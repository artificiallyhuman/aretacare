import CarPlay
import Observation
import UIKit

/// The voice screen for one Talk call: a `CPVoiceControlTemplate` that shows only the
/// call's state (no words from the conversation) with Mute and End buttons, and Done in the
/// navigation bar, which also ends the call.
///
/// It follows the call's `TalkViewModel` and closes itself when the call ends, whichever
/// screen ended it. CarPlay ignores state changes that come too fast or too often, so each
/// state stays up for at least `minimumDwell`, "Speaking" outlasts the pauses between
/// sentences (`speakingHold`), and a change CarPlay didn't take is sent again. Mute and
/// Unmute skip the wait: the driver is looking for the result of their tap.
@available(iOS 26.4, *)
@MainActor
final class CarPlayCallScreen {
    enum State: String, CaseIterable {
        case connecting, listening, speaking, working, muted

        var titles: [String] {
            switch self {
            case .connecting: return ["Connecting…"]
            case .listening: return ["Listening"]
            case .speaking: return ["Speaking"]
            case .working: return ["One moment…"]
            case .muted: return ["Muted"]
            }
        }
    }

    let talk: TalkViewModel
    /// Each state carries its own buttons (iOS 26.4): End everywhere, plus Mute while the
    /// call is live (its microphone slashed while muted). No microphone track exists while connecting.
    private(set) lazy var template: CPVoiceControlTemplate = {
        let template = CPVoiceControlTemplate(voiceControlStates: State.allCases.map { state in
            let voiceState = makeState(state)
            // End is last; if a car allows fewer buttons, it's the one kept.
            let buttons = buttons(for: state)
            let limit = max(1, CPVoiceControlState.maximumActionButtonCount)
            voiceState.actionButtons = Array(buttons.suffix(limit))
            return voiceState
        })
        // The system's close button was an unexplained X beside the End button. Done says
        // what it does: the conversation is over (closing the screen and leaving the call
        // running unseen would leave the driver no way to end it).
        template.backButton = CPBarButton(title: "Done") { [weak self] _ in
            guard let talk = self?.talk else { return }
            Task { await talk.end() }
        }
        return template
    }()

    private let scale: CGFloat
    private let darkBackground: Bool
    private let onClose: (CarPlayCallScreen, TalkViewModel.Notice?) -> Void
    private static let minimumDwell: TimeInterval = 1.2
    private static let speakingHold: TimeInterval = 1.5
    private static let maxResends = 3
    private var shownState: State = .connecting
    private var lastStateChange = Date()
    private var lastSpeaking = Date.distantPast
    private var pendingState: Task<Void, Never>?
    private var resendCheck: Task<Void, Never>?
    private var resends = 0
    private var lastAppeared = Date.distantPast
    private var isClosed = false

    /// `scale` and `style` are the car screen's (`carTraitCollection`), for the images.
    init(talk: TalkViewModel, scale: CGFloat, style: UIUserInterfaceStyle,
         onClose: @escaping (CarPlayCallScreen, TalkViewModel.Notice?) -> Void) {
        self.talk = talk
        self.scale = scale
        self.darkBackground = style != .light
        self.onClose = onClose
        // The template shows its first state (connecting) when it appears.
        observe()
    }

    /// The template is on screen, so states can be activated. A call that was already
    /// running (started on the phone) would otherwise sit on "Connecting…" until it changed.
    /// Also when the driver comes back from another CarPlay app (the present's completion
    /// and the appear event can both report the same appearance; once is enough).
    func didAppear() {
        guard Date().timeIntervalSince(lastAppeared) > 1 else { return }
        lastAppeared = Date()
        // Activations before the template was up had no effect: it shows its first state.
        shownState = .connecting
        lastStateChange = .distantPast
        refresh()
    }

    /// Stops following the call without touching it (the car disconnected, or another call
    /// screen replaced this one).
    func detach() {
        isClosed = true
        pendingState?.cancel()
        resendCheck?.cancel()
    }

    // MARK: - Following the call

    private func observe() {
        guard !isClosed else { return }
        withObservationTracking {
            _ = talk.phase
            _ = talk.isMuted
            _ = talk.notice  // a refusal before the call starts changes only this
        } onChange: { [weak self] in
            // Called before the change lands; read the new values on the next turn.
            Task { @MainActor in
                self?.refresh()
                self?.observe()
            }
        }
    }

    private func refresh() {
        guard !isClosed else { return }
        switch talk.phase {
        case .idle, .ending:
            close()
            return
        default:
            break
        }
        show(state(for: talk))
    }

    private func state(for talk: TalkViewModel) -> State {
        if talk.isMuted, talk.phase.isLive { return .muted }
        switch talk.phase {
        case .agentSpeaking:
            lastSpeaking = Date()
            return .speaking
        case .working: return .working
        case .listening, .userSpeaking:
            // A pause between sentences isn't the end of the answer: keep "Speaking" up
            // rather than flicking to "Listening" and back.
            return shownState == .speaking && Date().timeIntervalSince(lastSpeaking) < Self.speakingHold
                ? .speaking : .listening
        default: return .connecting
        }
    }

    private func show(_ state: State) {
        pendingState?.cancel()
        pendingState = nil
        // Still speaking only because of the hold: look again when it runs out.
        if state == .speaking, talk.phase != .agentSpeaking {
            recheck(after: Self.speakingHold - Date().timeIntervalSince(lastSpeaking))
        }
        guard state != shownState else { return }
        let isMuteChange = state == .muted || shownState == .muted
        let wait = Self.minimumDwell - Date().timeIntervalSince(lastStateChange)
        guard wait <= 0 || isMuteChange else {
            recheck(after: wait)
            return
        }
        shownState = state
        lastStateChange = Date()
        resends = 0
        activate(state)
    }

    private func recheck(after seconds: TimeInterval) {
        pendingState?.cancel()
        pendingState = Task { [weak self] in
            try? await Task.sleep(for: .seconds(max(seconds, 0.05)))
            guard let self, !Task.isCancelled, !self.isClosed else { return }
            self.show(self.state(for: self.talk))
        }
    }

    /// Activates a state, then checks that CarPlay took it (it drops changes that come too
    /// often) and sends it again if not. A dropped Unmute left the screen on "Muted" with
    /// the Unmute button doing nothing visible.
    private func activate(_ state: State) {
        template.activateVoiceControlState(withIdentifier: state.rawValue)
        resendCheck?.cancel()
        resendCheck = Task { [weak self] in
            try? await Task.sleep(for: .seconds(Self.minimumDwell))
            guard let self, !Task.isCancelled, !self.isClosed, self.shownState == state,
                  self.template.activeStateIdentifier != state.rawValue,
                  self.resends < Self.maxResends else { return }
            self.resends += 1
            self.activate(state)
        }
    }

    /// Shows the call's real state now, dwell or not.
    private func resync() {
        guard !isClosed else { return }
        pendingState?.cancel()
        let state = state(for: talk)
        shownState = state
        lastStateChange = Date()
        resends = 0
        activate(state)
    }

    private func close() {
        guard !isClosed else { return }
        isClosed = true
        pendingState?.cancel()
        resendCheck?.cancel()
        // A CarPlay call's problems are reported here; a phone call reports its own on the phone.
        var notice: TalkViewModel.Notice?
        if talk.surface == .carPlay {
            notice = talk.notice
            talk.notice = nil
        }
        onClose(self, notice)
    }

    /// iOS 27 adds a full-screen background, the same one in every state so a state change
    /// doesn't repaint the whole screen. The `compiler` check keeps the build working on an
    /// iOS 26 SDK (GitHub's runners), which doesn't have that initializer.
    private func makeState(_ state: State) -> CPVoiceControlState {
        let image = CarPlayImages.voiceState(state, scale: scale)
        #if compiler(>=6.4)
        if #available(iOS 27.0, *) {
            return CPVoiceControlState(identifier: state.rawValue, titleVariants: state.titles, image: image,
                                       backgroundImage: CarPlayImages.voiceBackground(dark: darkBackground),
                                       repeats: true)
        }
        #endif
        return CPVoiceControlState(identifier: state.rawValue, titleVariants: state.titles,
                                   image: image, repeats: true)
    }

    // MARK: - Buttons

    private func buttons(for state: State) -> [CPButton] {
        let end = CPButton(image: CarPlayImages.endButton()) { [weak self] _ in
            guard let talk = self?.talk else { return }
            Task { await talk.end() }
        }
        end.title = "End"
        guard state != .connecting else { return [end] }

        // Each state's button says what it does (Mute, or Unmute while muted) rather than
        // toggling: a tap delivered twice, or tapped on a screen CarPlay hadn't updated yet,
        // can't undo itself.
        let muted = state == .muted
        let mute = CPButton(image: CarPlayImages.muteButton(muted: muted)) { [weak self] _ in
            guard let self else { return }
            AuthManager.shared.recordActivity()
            if self.talk.isMuted == !muted {
                // Already so: the screen is behind (CarPlay dropped a change), and a tap that
                // changes nothing wouldn't fix it. Show the call as it is.
                self.resync()
            } else {
                self.talk.setMicrophoneMuted(!muted)
            }
        }
        mute.title = muted ? "Unmute" : "Mute"
        return [mute, end]
    }
}
