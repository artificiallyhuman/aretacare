import CarPlay
import Observation
import UIKit

/// The voice screen for one Talk call: a `CPVoiceControlTemplate` that shows only the
/// call's state (no words from the conversation) with Mute and End buttons.
///
/// It follows the call's `TalkViewModel` and closes itself when the call ends, whichever
/// screen ended it. CarPlay ignores state changes that come too fast, so each state stays
/// up for at least `minimumDwell`.
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
    /// call is live and Unmute while muted. No microphone track exists while connecting.
    private(set) lazy var template = CPVoiceControlTemplate(voiceControlStates: State.allCases.map { state in
        let voiceState = CPVoiceControlState(identifier: state.rawValue, titleVariants: state.titles,
                                             image: CarPlayImages.voiceState(state, scale: scale), repeats: true)
        let buttons = buttons(for: state)
        voiceState.actionButtons = Array(buttons.prefix(CPVoiceControlState.maximumActionButtonCount))
        return voiceState
    })

    private let scale: CGFloat
    private let onClose: (CarPlayCallScreen, TalkViewModel.Notice?) -> Void
    private static let minimumDwell: TimeInterval = 1.0
    private var shownState: State = .connecting
    private var lastStateChange = Date()
    private var pendingState: Task<Void, Never>?
    private var isClosed = false

    /// `scale` is the car screen's (`carTraitCollection.displayScale`), for the state images.
    init(talk: TalkViewModel, scale: CGFloat,
         onClose: @escaping (CarPlayCallScreen, TalkViewModel.Notice?) -> Void) {
        self.talk = talk
        self.scale = scale
        self.onClose = onClose
        // The template shows its first state (connecting) when it appears.
        observe()
    }

    /// The template is on screen, so states can be activated. A call that was already
    /// running (started on the phone) would otherwise sit on "Connecting…" until it changed.
    func didAppear() {
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
        case .agentSpeaking: return .speaking
        case .working: return .working
        case .listening, .userSpeaking: return .listening
        default: return .connecting
        }
    }

    private func show(_ state: State) {
        pendingState?.cancel()
        pendingState = nil
        guard state != shownState else { return }
        let wait = Self.minimumDwell - Date().timeIntervalSince(lastStateChange)
        guard wait <= 0 else {
            pendingState = Task { [weak self] in
                try? await Task.sleep(for: .seconds(wait))
                guard let self, !Task.isCancelled, !self.isClosed else { return }
                self.show(self.state(for: self.talk))
            }
            return
        }
        shownState = state
        lastStateChange = Date()
        template.activateVoiceControlState(withIdentifier: state.rawValue)
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

    // MARK: - Buttons

    private func buttons(for state: State) -> [CPButton] {
        let end = CPButton(image: CarPlayImages.symbol("xmark")) { [weak self] _ in
            guard let talk = self?.talk else { return }
            Task { await talk.end() }
        }
        end.title = "End"
        guard state != .connecting else { return [end] }

        let muted = state == .muted
        let mute = CPButton(image: CarPlayImages.symbol(muted ? "mic.fill" : "mic.slash.fill")) { [weak self] _ in
            AuthManager.shared.recordActivity()
            self?.talk.toggleMute()
        }
        mute.title = muted ? "Unmute" : "Mute"
        return [mute, end]
    }
}
