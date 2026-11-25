import CarPlay
import Observation
import UIKit

/// The voice screen for one Talk call: a `CPVoiceControlTemplate` that shows only the
/// call's state (no words from the conversation) with Mute and End buttons, and Done in the
/// navigation bar, which also ends the call.
///
/// It follows the call's `TalkViewModel` and closes itself when the call ends, whichever
/// screen ended it. Each state stays up for at least `minimumDwell` and "Speaking" outlasts
/// the pauses between sentences (`speakingHold`), so the screen doesn't flicker. Mute and
/// Unmute skip that wait (the driver is looking for the result of their tap), but nothing
/// skips `carMinimumGap`: CarPlay throws away a state change that arrives within 0.5 s of
/// the last one it showed, without telling the app.
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
    /// call is live (Unmute, its microphone slashed, while muted). No microphone track exists
    /// while connecting. The states share the same button objects: CarPlay identifies a
    /// button by its object, so a shared one stays on screen through a state change, while a
    /// different object for each state was swapped out at every change, and a tap that
    /// landed during the swap was lost.
    private(set) lazy var template: CPVoiceControlTemplate = {
        let end = endButton()
        let mute = muteButton(muting: true)
        let unmute = muteButton(muting: false)
        let template = CPVoiceControlTemplate(voiceControlStates: State.allCases.map { state in
            let voiceState = makeState(state)
            let buttons: [CPButton] = switch state {
            case .connecting: [end]
            case .muted: [unmute, end]
            default: [mute, end]
            }
            // End is last; if a car allows fewer buttons, it's the one kept.
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
    /// CarPlay's host (CarPlaySupport, iOS 26 and 27) discards a state change that comes
    /// less than 0.5 s after the last one it accepted, and logs "Throttling state change";
    /// the app isn't told, and `activeStateIdentifier` already names the discarded state.
    /// A little over that, for the hop between the app and the host.
    private static let carMinimumGap: TimeInterval = 0.6
    private var shownState: State = .connecting
    /// When the shown state last changed (for `minimumDwell`).
    private var lastStateChange = Date()
    /// When a state was last sent to CarPlay, whether or not it changed (for `carMinimumGap`).
    private var lastSent = Date.distantPast
    /// A tap said the screen is behind: send the state even if it's the one already sent.
    private var resendRequested = false
    private var lastSpeaking = Date.distantPast
    private var pendingState: Task<Void, Never>?
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
        guard state != shownState || resendRequested else { return }
        let isMuteChange = resendRequested || state == .muted || shownState == .muted
        let dwell = isMuteChange ? 0 : Self.minimumDwell - Date().timeIntervalSince(lastStateChange)
        // Sent sooner, CarPlay would throw the change away and the screen would stay behind
        // (a Mute tap right after "Speaking" turned to "Listening" showed nothing, so the
        // driver tapped again).
        let gap = Self.carMinimumGap - Date().timeIntervalSince(lastSent)
        let wait = max(dwell, gap)
        guard wait <= 0 else {
            recheck(after: wait)
            return
        }
        if state != shownState {
            shownState = state
            lastStateChange = Date()
        }
        lastSent = Date()
        resendRequested = false
        template.activateVoiceControlState(withIdentifier: state.rawValue)
    }

    private func recheck(after seconds: TimeInterval) {
        pendingState?.cancel()
        pendingState = Task { [weak self] in
            try? await Task.sleep(for: .seconds(max(seconds, 0.05)))
            guard let self, !Task.isCancelled, !self.isClosed else { return }
            self.show(self.state(for: self.talk))
        }
    }

    /// The driver tapped a button whose outcome already holds, so the screen they see is
    /// behind (a change still waiting out `carMinimumGap`, or one CarPlay dropped anyway).
    /// Sends the call's real state again, as soon as CarPlay will take it.
    private func resync() {
        guard !isClosed else { return }
        resendRequested = true
        show(state(for: talk))
    }

    private func close() {
        guard !isClosed else { return }
        isClosed = true
        pendingState?.cancel()
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

    private func endButton() -> CPButton {
        let end = CPButton(image: CarPlayImages.endButton()) { [weak self] _ in
            guard let talk = self?.talk else { return }
            Task { await talk.end() }
        }
        end.title = "End"
        return end
    }

    /// Mute (`muting`) or Unmute: each says what it does rather than toggling, so a tap
    /// delivered twice, or made on a screen CarPlay hadn't updated yet, can't undo itself.
    private func muteButton(muting: Bool) -> CPButton {
        // The Unmute button shows the slashed microphone: the state it ends.
        let button = CPButton(image: CarPlayImages.muteButton(muted: !muting)) { [weak self] _ in
            guard let self else { return }
            AuthManager.shared.recordActivity()
            if self.talk.isMuted == muting {
                // Already so: the screen is behind, and a tap that changes nothing wouldn't
                // fix it. Show the call as it is.
                self.resync()
            } else {
                self.talk.setMicrophoneMuted(muting)
            }
        }
        button.title = muting ? "Mute" : "Unmute"
        return button
    }
}
