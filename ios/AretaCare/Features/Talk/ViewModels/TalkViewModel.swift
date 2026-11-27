import AVFoundation
import Observation
import SwiftUI
import UIKit

/// Drives one Talk (live voice) call: first-use consent, the WebRTC handshake through
/// the backend, the orb's state, and every way a call can end.
@Observable @MainActor
final class TalkViewModel {
    enum Phase: Equatable {
        case idle
        case preparing      // status check, consent, microphone permission
        case connecting
        case listening
        case userSpeaking
        case agentSpeaking
        case working        // the assistant is looking something up
        case ending

        var isLive: Bool {
            switch self {
            case .listening, .userSpeaking, .agentSpeaking, .working: return true
            default: return false
            }
        }

        var caption: String {
            switch self {
            case .idle, .preparing: return "Getting ready…"
            case .connecting: return "Connecting…"
            case .listening: return "Listening"
            case .userSpeaking: return "Listening"
            case .agentSpeaking: return "Speaking"
            case .working: return "Working on it…"
            case .ending: return "Saving your conversation…"
            }
        }

        var announcement: String? {
            switch self {
            case .connecting: return "Connecting"
            case .listening: return "Listening"
            case .agentSpeaking: return "AretaCare is speaking"
            case .working: return "AretaCare is working on it"
            case .ending: return "Conversation ended"
            default: return nil
            }
        }
    }

    struct Notice: Identifiable, Equatable {
        let id = UUID()
        let title: String
        let message: String
    }

    // MARK: - Observed state

    private(set) var phase: Phase = .idle

    /// Where this call runs: the phone's chat or the CarPlay screen. On CarPlay the person is
    /// driving, so nothing may need the phone (no consent sheet, no permission prompt), and
    /// the phone itself is left alone (no screen kept awake, no haptics).
    let surface: TalkSurface

    init(surface: TalkSurface = .app) {
        self.surface = surface
        isInCar = surface == .carPlay
    }

    /// The call this process is running, from whichever screen started it. The server allows
    /// one live call per account; this keeps the phone and CarPlay from starting a second
    /// one, lets CarPlay show a call the phone started, and lets sign-out end either.
    private(set) static weak var current: TalkViewModel?

    /// A call (or its setup) is under way. Tapping a notification checks it, like
    /// `AudioRecorderManager.isRecordingInProgress`: routing to another tab or care session
    /// would end the call.
    static var isCallInProgress: Bool { current?.isActive == true }
    /// A call on the phone's own Talk screen, which switching tab or care session would end.
    /// A CarPlay call isn't affected by what the phone shows.
    static var isPhoneCallInProgress: Bool { isCallInProgress && current?.surface == .app }
    /// A call holds the audio session. Deactivating it or changing its category would silence
    /// the call, and during a CarPlay call the phone's chat and recordings stay usable.
    static var isUsingAudioSession: Bool { current?.inCallEnvironment == true || TalkAudioTeardown.pending > 0 }

    /// Posted when a call starts connecting (the microphone opens), so CarPlay can show a
    /// call started on the phone: in the car, the microphone goes with the voice screen.
    static let callDidStartNotification = Notification.Name("TalkViewModel.callDidStart")
    /// Posted when a CarPlay call's card should reload in the phone's chat (userInfo:
    /// "sessionId"). Phone calls reload their own chat through `savedCallToken`.
    static let callSavedNotification = Notification.Name("TalkViewModel.callSaved")
    private(set) var userLevel: Double = 0
    private(set) var agentLevel: Double = 0
    private(set) var maxSessionSeconds = 1800
    /// The microphone is muted (the person is listening, or there's background noise).
    private(set) var isMuted = false
    var showingConsent = false
    var showingMicDenied = false
    var notice: Notice?
    /// Bumped when the chat should reload to show the call's card: once when the server has
    /// posted it as "saving", again when the summary is filled in.
    private(set) var savedCallToken = 0
    /// Shown as a banner in chat when saving failed.
    var saveErrorMessage: String?

    /// Called when Talk should give the screen back to Chat.
    var onExit: (() -> Void)?

    /// Whether to show the Talk button: only once the server has said Talk is on
    /// (`TALK_ENABLED`). Remembered across launches, so the button neither flashes up while
    /// Talk is off in production nor appears late on every launch while it is on.
    private(set) var isOffered = UserDefaults.standard.bool(forKey: TalkViewModel.offeredKey) {
        didSet { UserDefaults.standard.set(isOffered, forKey: TalkViewModel.offeredKey) }
    }
    private static let offeredKey = "talkOffered"
    private var offeredCheckedAt: Date?

    /// Refreshes `isOffered`, at most every 10 minutes. A failed check (offline) keeps the
    /// last answer; tapping Talk checks again and explains anything that's wrong.
    func refreshAvailability() async {
        if let checked = offeredCheckedAt, Date().timeIntervalSince(checked) < 600 { return }
        guard let status: TalkStatusResponse = try? await APIClient.shared.get(APIEndpoints.Talk.status) else { return }
        isOffered = status.enabled
        offeredCheckedAt = Date()
    }

    var isActive: Bool { phase != .idle }

    /// The status line under the orb. While muted, "Listening" would be misleading.
    var caption: String {
        if isMuted, phase == .listening || phase == .userSpeaking {
            return "Muted"
        }
        return phase.caption
    }

    /// The on-screen Mute button. Only during a live call: before that there is no
    /// microphone track.
    func toggleMute() {
        setMicrophoneMuted(!isMuted)
    }

    /// Mute or unmute outright. CarPlay's buttons say which they mean (each voice state has
    /// its own), so a tap delivered twice over a slow wireless link can't undo itself.
    func setMicrophoneMuted(_ muted: Bool) {
        guard phase.isLive, muted != isMuted else { return }
        setMuted(muted)
        // On the phone, tell iOS too, so an AirPods stem press toggles from the right state.
        // Not in the car (started there, or moved there: `isInCar`), where the car's
        // microphone is the route and the app-level mute only added a second, system-held
        // mute state to keep in step. The app plays no tone itself: during a call voice
        // processing ducks any other audio the app plays to near silence. A firm tap and the
        // button's look carry the state.
        guard !isInCar else { return }
        try? AVAudioApplication.shared.setInputMuted(isMuted)
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
    }

    private func setMuted(_ muted: Bool) {
        guard phase.isLive, let transport, muted != isMuted else { return }
        isMuted = muted
        transport.setMuted(muted)
        if muted {
            userLevel = 0
            if phase == .userSpeaking { setPhase(.listening) }
        }
        if surface == .app, UIAccessibility.isVoiceOverRunning {
            UIAccessibility.post(notification: .announcement, argument: muted ? "Microphone muted" : "Microphone on")
        }
    }

    // MARK: - Private state

    private var transport: TalkTransport?
    private var talkId: String?
    private(set) var sessionId: String?
    private var opening: TalkOpening?
    /// The assistant started a lookup before the connection was up (an opening that looks
    /// something up first, like "Catch me up"): the call opens on Working, not Listening.
    private var workingAtConnect = false
    /// The server has the driving rules (`TALK_DRIVING_INSTRUCTIONS`) for this call: it was
    /// started in the car, or on the phone while CarPlay was connected, or it moved to the
    /// car since (`moveToCar`). They're set when a call starts, so a phone call whose audio
    /// went to the car would otherwise go on pointing the driver at screens.
    private var hasDrivingRules = false
    /// CarPlay showed this phone call's voice screen: it should get the driving rules once
    /// the server has given it an id.
    private var wantsDrivingRules = false
    /// This server applies driving rules (`/talk/status` `carplay`). An older one has no
    /// route to move a call to the car.
    private var serverHasDrivingRules = false
    /// Asking for the driving rules failed this many times; retried after
    /// `drivingRulesRetryDelays`, then left to the next time CarPlay shows the call.
    private var drivingRulesRetries = 0
    private static let drivingRulesRetryDelays: [Double] = [2, 5, 15]
    /// The call is the car's: started there, or a phone call whose voice screen CarPlay
    /// showed (`moveToCar`). From then on its only mute is the microphone track, which the
    /// car screen's Mute and Unmute set: no app-level `AVAudioApplication` mute and no AirPods
    /// stem. A phone call kept both after moving to the car, a second mute state that a
    /// late notification could set against the car's Unmute. Kept for the rest of the call,
    /// even if the car disconnects (the phone's Mute still works; the stem doesn't).
    private var isInCar = false
    private var didKeepScreenAwake = false
    /// The call's audio environment is set up: from here WebRTC's voice processing owns the
    /// app's audio session until the call ends.
    private(set) var inCallEnvironment = false
    private var levelTask: Task<Void, Never>?
    private var watchdogTask: Task<Void, Never>?
    private var keepAliveTask: Task<Void, Never>?
    private var statusTask: Task<Void, Never>?
    /// One result poll per ended call, by talk id. Ending a second call must not cancel the
    /// first one's poll: its card would stay on "Saving…" and a failure would go unreported.
    private var pollTasks: [String: Task<Void, Never>] = [:]
    private var interruptionObserver: NSObjectProtocol?
    private var muteGestureObserver: NSObjectProtocol?
    private var previousIdleTimerDisabled = false
    private var isEnding = false
    /// The current attempt. Phase alone can't tell an ended attempt from a new one (both
    /// reach `.connecting`), so a slow response from a call the user already ended passed
    /// the phase checks, took over `talkId` and failed the new call. Every await and every
    /// transport event re-checks this; `reset()` replaces it.
    private var attemptId = UUID()

    private static let connectTimeoutSeconds: Double = 20
    private static let statusCheckSeconds: Double = 20
    private static let speakingThreshold = 0.02

    // MARK: - Entry

    /// The user chose Talk. Checks availability and consent before touching the microphone.
    /// `opening` is one of CarPlay's one-tap starts.
    func begin(sessionId: String, opening: TalkOpening? = nil) async {
        guard phase == .idle else { return }
        if let other = Self.current, other !== self, other.isActive {
            // Not `fail()`: its teardown resets the app-wide input mute, which would unmute
            // the call that's running.
            notice = Notice(title: "Talk Is Already On", message: other.surface == .carPlay
                            ? "A Talk conversation is running in CarPlay."
                            : "A Talk conversation is already running on your iPhone.")
            onExit?()
            return
        }
        Self.current = self
        let attempt = UUID()
        attemptId = attempt
        self.sessionId = sessionId
        self.opening = opening
        phase = .preparing

        guard NetworkMonitor.shared.isConnected else {
            fail(title: "You're Offline", message: "Talk needs an internet connection.")
            return
        }
        guard TalkTransportFactory.make() != nil else {
            fail(title: "Talk Unavailable", message: TalkTransportError.unavailable.localizedDescription)
            return
        }
        do {
            let status: TalkStatusResponse = try await APIClient.shared.get(APIEndpoints.Talk.status)
            guard attempt == attemptId, phase == .preparing else { return }
            maxSessionSeconds = status.maxSessionSeconds
            serverHasDrivingRules = status.carplay == true
            isOffered = status.enabled
            offeredCheckedAt = Date()
            guard status.enabled else {
                fail(title: "Talk Unavailable", message: "Talk isn't available right now.")
                return
            }
            // Never a car call without the server's driving rules (a server not yet updated).
            if surface == .carPlay, status.carplay != true {
                fail(title: "Talk Unavailable", message: "Talk isn't available in the car yet.")
                return
            }
            guard status.remainingSecondsToday >= 60 else {
                fail(title: "Daily Limit Reached", message: "You've reached today's Talk limit. It resets within 24 hours.")
                return
            }
            if status.hasConsent {
                await startCall(attempt: attempt)
            } else if surface == .carPlay {
                // Consent means reading what Talk does: never while driving.
                fail(title: "Talk Isn't Set Up", message: Self.notSetUpInCar)
            } else {
                showingConsent = true
            }
        } catch {
            guard attempt == attemptId, phase == .preparing else { return }
            fail(title: "Talk Unavailable", message: message(for: error))
        }
    }

    func acceptConsent() async {
        showingConsent = false
        let attempt = attemptId
        do {
            let _: TalkConsentResponse = try await APIClient.shared.post(APIEndpoints.Talk.consent)
            guard attempt == attemptId, phase == .preparing else { return }
            await startCall(attempt: attempt)
        } catch {
            guard attempt == attemptId, phase == .preparing else { return }  // ended while the request was in flight
            fail(title: "Talk Unavailable", message: message(for: error))
        }
    }

    func declineConsent() {
        showingConsent = false
        reset()
        onExit?()
    }

    // MARK: - Call lifecycle

    private func startCall(attempt: UUID) async {
        guard attempt == attemptId, let sessionId, phase == .preparing else { return }

        // The permission prompt appears on the phone, so CarPlay never asks for it.
        if surface == .carPlay, AVAudioApplication.shared.recordPermission != .granted {
            fail(title: "Talk Isn't Set Up", message: Self.notSetUpInCar)
            return
        }
        let granted = await withCheckedContinuation { continuation in
            AVAudioApplication.requestRecordPermission { continuation.resume(returning: $0) }
        }
        guard attempt == attemptId, phase == .preparing else { return }
        guard granted else {
            showingMicDenied = true
            reset()
            onExit?()
            return
        }
        guard let transport = TalkTransportFactory.make() else {
            fail(title: "Talk Unavailable", message: TalkTransportError.unavailable.localizedDescription)
            return
        }

        // Anything else using the audio session (a playing voice message) stops first.
        AudioSessionManager.shared.deactivate()
        self.transport = transport
        transport.onEvent = { [weak self] event in self?.handle(event, attempt: attempt) }
        phase = .connecting
        beginCallEnvironment()
        NotificationCenter.default.post(name: Self.callDidStartNotification, object: self)
        startWatchdog(seconds: Self.connectTimeoutSeconds) { [weak self] in
            guard let self, attempt == self.attemptId else { return }
            self.fail(title: "Couldn't Connect", message: "Talk couldn't connect. Please try again.")
        }

        do {
            let offer = try await transport.makeOffer()
            guard attempt == attemptId, phase == .connecting else { return }
            // A phone call while CarPlay is connected: its audio is in the car.
            let inCar = surface == .carPlay || (serverHasDrivingRules && CarPlayConnection.shared.isConnected)
            let request = TalkStartRequest(
                sessionId: sessionId,
                sdp: offer,
                userTimezone: TimeZone.current.identifier,
                currentTime: ISO8601DateFormatter().string(from: Date()),
                surface: inCar ? .carPlay : .app,
                opening: opening
            )
            hasDrivingRules = inCar
            let response: TalkStartResponse = try await APIClient.shared.post(APIEndpoints.Talk.sessions, body: request)
            guard attempt == attemptId, phase == .connecting else {
                // Ended while the request was in flight (possibly with a new attempt
                // already under way): the server still has this live call.
                Self.sendEnd(talkId: response.talkId)
                return
            }
            talkId = response.talkId
            maxSessionSeconds = response.maxSeconds
            sendDrivingRulesIfNeeded()
            try await transport.applyAnswer(response.sdp)
        } catch {
            guard attempt == attemptId, phase == .connecting else { return }
            fail(title: "Couldn't Start Talk", message: message(for: error))
        }
    }

    private func handle(_ event: TalkTransportEvent, attempt: UUID) {
        guard attempt == attemptId else { return }  // a transport from an ended attempt
        switch event {
        case .ready:
            guard phase == .connecting else { return }
            // A lookup already under way: say so. "Listening" sat on screen through the whole
            // lookup, as if the assistant were waiting for the person.
            phase = workingAtConnect ? .working : .listening
            announce(phase)
            if surface == .app { UIImpactFeedbackGenerator(style: .soft).impactOccurred() }
            // The server enforces the limit; this is the fallback if its close never arrives.
            startWatchdog(seconds: Double(maxSessionSeconds) + 15) { [weak self] in
                Task { await self?.end() }
            }
            startLevelLoop()
            startKeepAlive()
            startStatusChecks(attempt: attempt)
            // A stem press while connecting already muted the microphone at the system level.
            if !isInCar, AVAudioApplication.shared.isInputMuted { setMuted(true) }
        case .working:
            if phase == .connecting {
                workingAtConnect = true  // shown once the call is live (.ready)
                return
            }
            guard phase.isLive else { return }
            setPhase(.working)
        case .closedByServer(let reason):
            guard isActive, !isEnding else { return }
            if reason == "content" {
                notice = Notice(title: "Conversation Ended", message: "This conversation was ended.")
            } else if reason != "remote_hangup" {
                notice = Notice(title: "Conversation Ended", message: "Your Talk conversation has ended and is being saved.")
            }
            Task { await end() }
        case .connectionLost:
            guard isActive, !isEnding else { return }
            if phase == .connecting {
                fail(title: "Couldn't Connect", message: "Talk couldn't connect. Please try again.")
            } else {
                notice = Notice(title: "Connection Lost", message: "The connection dropped. What was said so far is being saved.")
                Task { await end() }
            }
        case .serverError:
            break  // a rejected event or a moderated phrase; the session reports its own end
        }
    }

    /// Ends the call (End button, a server close, a lost connection, …) and hands the screen
    /// back to Chat straight away. Saving continues on the server; the result is polled so
    /// the chat card appears and fills in. Never waits on the network: End is the only way
    /// off the Talk screen, and `/end` can stall for minutes on a bad connection.
    func end(pollForResult shouldPoll: Bool = true) async {
        guard isActive, !isEnding else { return }
        isEnding = true
        let wasLive = phase.isLive
        phase = .ending
        if wasLive { announce(.ending) }
        stopLoops()
        transport?.close()
        transport = nil

        let endedTalkId = talkId
        let endedSessionId = sessionId
        if let endedTalkId {
            Self.sendEnd(talkId: endedTalkId)
        }
        endCallEnvironment()
        reset()
        onExit?()
        if shouldPoll, let endedTalkId, let endedSessionId, wasLive {
            pollForResult(talkId: endedTalkId, sessionId: endedSessionId)
        }
    }

    /// Tear down without any UI follow-up (the view is going away, e.g. logout).
    func abandon() {
        guard isActive else { return }
        stopLoops()
        transport?.close()
        transport = nil
        if let talkId {
            Self.sendEnd(talkId: talkId)
        }
        endCallEnvironment()
        reset()
    }

    /// Fire and forget. Closing the peer connection already ends the session server-side;
    /// this makes the backend save promptly. Background time keeps a screen lock from
    /// cutting it off, and the expiration handler ends that time if the request outlasts
    /// it (an unended background task gets the app terminated).
    private static func sendEnd(talkId: String) {
        var backgroundTaskId: UIBackgroundTaskIdentifier = .invalid
        backgroundTaskId = UIApplication.shared.beginBackgroundTask(withName: "talk-end") {
            UIApplication.shared.endBackgroundTask(backgroundTaskId)
            backgroundTaskId = .invalid
        }
        Task { @MainActor in
            let _: TalkSessionStatusResponse? = try? await APIClient.shared.post(APIEndpoints.Talk.end(talkId))
            if backgroundTaskId != .invalid {
                UIApplication.shared.endBackgroundTask(backgroundTaskId)
                backgroundTaskId = .invalid
            }
        }
    }

    /// CarPlay is showing this phone call's voice screen: the driver is now in it. Asks the
    /// server for the driving rules, once the call has an id.
    func moveToCar() {
        guard surface == .app, isActive else { return }
        if !isInCar {
            isInCar = true
            // The car screen's Mute is the only one now. The observer goes first, so clearing
            // the app-level mute can't come back to `setMuted` (a notification it already
            // queued is turned away by its own `isInCar` check). The track keeps its state:
            // a call muted on the phone shows Muted in the car.
            if let muteGestureObserver {
                NotificationCenter.default.removeObserver(muteGestureObserver)
            }
            muteGestureObserver = nil
            if inCallEnvironment { try? AVAudioApplication.shared.setInputMuted(false) }
        }
        wantsDrivingRules = true
        sendDrivingRulesIfNeeded()
    }

    private func sendDrivingRulesIfNeeded() {
        guard wantsDrivingRules, !hasDrivingRules, serverHasDrivingRules, let talkId else { return }
        hasDrivingRules = true
        let attempt = attemptId
        Task { [weak self] in
            do {
                let _: TalkSurfaceResponse = try await APIClient.shared.post(
                    APIEndpoints.Talk.surface(talkId), body: TalkSurfaceRequest(surface: .carPlay)
                )
            } catch {
                guard let self, attempt == self.attemptId else { return }
                self.hasDrivingRules = false
                // The driver is in the car under the phone's rules: try again a few times.
                // After that, CarPlay showing this call again (the car reconnecting, a tap on
                // a start, an alert's OK) asks once more.
                guard self.drivingRulesRetries < Self.drivingRulesRetryDelays.count else { return }
                let delay = Self.drivingRulesRetryDelays[self.drivingRulesRetries]
                self.drivingRulesRetries += 1
                try? await Task.sleep(for: .seconds(delay))
                guard attempt == self.attemptId, self.isActive else { return }
                self.sendDrivingRulesIfNeeded()
            }
        }
    }

    private func fail(title: String, message: String) {
        let orphanedTalkId = talkId
        stopLoops()
        transport?.close()
        transport = nil
        endCallEnvironment()
        reset()
        notice = Notice(title: title, message: message)
        onExit?()
        if let orphanedTalkId {
            Self.sendEnd(talkId: orphanedTalkId)
        }
    }

    private func reset() {
        phase = .idle
        if Self.current === self { Self.current = nil }
        opening = nil
        workingAtConnect = false
        hasDrivingRules = false
        wantsDrivingRules = false
        drivingRulesRetries = 0
        isInCar = surface == .carPlay
        // The first-use consent sheet belongs to the attempt: left up after the attempt
        // ended, "Agree and Start" recorded consent and then started nothing.
        showingConsent = false
        userLevel = 0
        agentLevel = 0
        isMuted = false
        talkId = nil
        sessionId = nil
        isEnding = false
        attemptId = UUID()  // anything still in flight now belongs to an ended attempt
    }

    // MARK: - Result polling

    private func pollForResult(talkId: String, sessionId: String) {
        pollTasks[talkId]?.cancel()
        pollTasks[talkId] = Task { [weak self] in
            defer { self?.pollTasks[talkId] = nil }
            // Quick at first (the card appears within seconds), then slower; up to the
            // server's own limit (FINALIZING_STALE_SECONDS) for a save that queues behind uploads.
            let delays: [Double] = [2, 2, 3, 5, 5, 5]
            let deadline = Date().addingTimeInterval(15 * 60)
            var attempt = 0
            var savingRefreshes = 0
            while !Task.isCancelled, Date() < deadline {
                try? await Task.sleep(for: .seconds(attempt < delays.count ? delays[attempt] : 10))
                attempt += 1
                // Signed out since (a CarPlay call outlives the phone's chat): nothing to show.
                guard !Task.isCancelled, AuthManager.shared.isAuthenticated else { return }
                do {
                    let status: TalkSessionStatusResponse = try await APIClient.shared.get(APIEndpoints.Talk.session(talkId))
                    guard status.isFinished else {
                        // Saving has started, so the card is in the chat already: show it now
                        // rather than after the recording and journal entries are done. Twice,
                        // because the server posts the card a moment after "finalizing".
                        if status.status == "finalizing", savingRefreshes < 2, let self {
                            savingRefreshes += 1
                            self.callSaved(sessionId: sessionId)
                        }
                        continue
                    }
                    guard let self, !Task.isCancelled else { return }
                    if status.failed {
                        self.saveErrorMessage = Self.saveFailedMessage
                        self.callSaved(sessionId: sessionId, failed: true)  // the server removed the "saving" card
                    } else if !status.wasDiscarded {
                        self.callSaved(sessionId: sessionId)
                    }
                    return
                } catch let error as APIError {
                    if case .notFound = error { return }
                    if error.requiresLogout { return }
                } catch {
                    // transient: keep polling
                }
            }
        }
    }

    /// The chat should reload to show (or drop) the call's card. A phone call's own chat
    /// watches `savedCallToken`; a CarPlay call's card belongs to whichever chat the phone
    /// shows, so that one is told by notification.
    private func callSaved(sessionId: String, failed: Bool = false) {
        savedCallToken += 1
        if surface == .carPlay {
            NotificationCenter.default.post(name: Self.callSavedNotification, object: nil,
                                            userInfo: ["sessionId": sessionId, "failed": failed])
        }
    }

    static let saveFailedMessage = "We couldn't save that Talk conversation."

    /// Still polling for an ended call's result (CarPlay keeps such calls alive until done).
    var isAwaitingResult: Bool { !pollTasks.isEmpty }

    func cancelResultPolling() {
        for task in pollTasks.values { task.cancel() }
        pollTasks = [:]
    }

    // MARK: - Loops

    private func startLevelLoop() {
        levelTask?.cancel()
        levelTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(100))
                guard let self, let transport = self.transport, self.phase.isLive else { return }
                let levels = await transport.currentLevels()
                guard !Task.isCancelled, self.phase.isLive else { return }
                self.apply(levels)
            }
        }
    }

    private func apply(_ levels: TalkAudioLevels) {
        // Fast attack, slow release: the orb follows speech without flickering between words.
        func smooth(_ current: Double, _ target: Double) -> Double {
            let boosted = min(1, target * 3)
            return boosted > current ? current + (boosted - current) * 0.6 : current + (boosted - current) * 0.18
        }
        // The source statistic still measures the microphone while the track is disabled.
        userLevel = isMuted ? 0 : smooth(userLevel, levels.user)
        agentLevel = smooth(agentLevel, levels.agent)

        if agentLevel > Self.speakingThreshold * 2 {
            setPhase(.agentSpeaking)
        } else if userLevel > Self.speakingThreshold * 2 {
            setPhase(.userSpeaking)
        } else if phase != .working {
            setPhase(.listening)
        }
    }

    private func setPhase(_ newPhase: Phase) {
        guard phase != newPhase, phase.isLive else { return }
        let previous = phase
        phase = newPhase
        // Announce turn changes, not every pause between words.
        if newPhase == .agentSpeaking || newPhase == .working || (newPhase == .listening && previous != .userSpeaking) {
            announce(newPhase)
        }
    }

    /// Voice is not touch: without this the 30-minute idle logout would end a long call.
    private func startKeepAlive() {
        keepAliveTask?.cancel()
        keepAliveTask = Task { [weak self] in
            while !Task.isCancelled {
                AuthManager.shared.recordActivity()
                try? await Task.sleep(for: .seconds(60))
                guard self?.phase.isLive == true else { return }
            }
        }
    }

    /// The voice connection runs straight to OpenAI, so it can outlive the server's side of
    /// the call: if the server stops recording it (its own connection to the call failed for
    /// good, or its instance died), nothing would be saved from then on, and the assistant
    /// can no longer look anything up. The server ends calls it can; this catches the rest.
    /// Network errors are ignored: a lost connection has its own path.
    private func startStatusChecks(attempt: UUID) {
        statusTask?.cancel()
        guard let talkId else { return }
        statusTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(Self.statusCheckSeconds))
                guard !Task.isCancelled else { return }
                guard let status: TalkSessionStatusResponse = try? await APIClient.shared.get(
                    APIEndpoints.Talk.session(talkId)
                ) else { continue }
                guard let self, !Task.isCancelled, attempt == self.attemptId, self.phase.isLive,
                      !self.isEnding else { return }
                if status.status != "active" {
                    self.notice = Notice(
                        title: "Conversation Ended",
                        message: "Talk lost its connection to AretaCare, so this conversation was ended. What was said up to now is being saved."
                    )
                    await self.end()
                    return
                }
            }
        }
    }

    private func startWatchdog(seconds: Double, onFire: @escaping @MainActor () -> Void) {
        watchdogTask?.cancel()
        watchdogTask = Task {
            try? await Task.sleep(for: .seconds(seconds))
            guard !Task.isCancelled else { return }
            onFire()
        }
    }

    private func stopLoops() {
        levelTask?.cancel()
        watchdogTask?.cancel()
        keepAliveTask?.cancel()
        statusTask?.cancel()
        levelTask = nil
        watchdogTask = nil
        keepAliveTask = nil
        statusTask = nil
    }

    // MARK: - Device environment

    private func beginCallEnvironment() {
        inCallEnvironment = true
        // Keep the phone's screen on for a call on the phone only. In the car the phone is
        // usually locked in a mount, and a lit screen would be a distraction.
        if surface == .app {
            previousIdleTimerDisabled = UIApplication.shared.isIdleTimerDisabled
            UIApplication.shared.isIdleTimerDisabled = true
            didKeepScreenAwake = true
        }
        interruptionObserver = NotificationCenter.default.addObserver(
            forName: AVAudioSession.interruptionNotification, object: nil, queue: .main
        ) { [weak self] notification in
            guard let raw = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
                  AVAudioSession.InterruptionType(rawValue: raw) == .began else { return }
            // A phone call or Siri took the audio session. Resuming a live model call
            // afterwards is unreliable, so end cleanly and save what was said.
            Task { @MainActor in
                guard let self, self.isActive, !self.isEnding else { return }
                self.notice = Notice(title: "Conversation Ended", message: "Talk ended because another call or app took over audio.")
                await self.end()
            }
        }
        // AirPods "press to mute" (iOS 17+). Observing this notification opts the app in;
        // on a stem press iOS mutes the microphone, plays its own tone, and posts it here.
        // Registered only for the call, so outside Talk the stem keeps its usual job. Not
        // for a call in the car: its Mute is the car screen's button alone, and a second,
        // system-held mute state is one more way for Unmute not to take.
        try? AVAudioApplication.shared.setInputMuted(false)
        guard !isInCar else { return }
        let attempt = attemptId
        muteGestureObserver = NotificationCenter.default.addObserver(
            forName: AVAudioApplication.inputMuteStateChangeNotification, object: nil, queue: .main
        ) { [weak self] notification in
            guard let muted = notification.userInfo?[AVAudioApplication.muteStateKey] as? Bool else { return }
            // Also fires for this app's own setInputMuted calls; setMuted ignores no-ops.
            // Removing the observer doesn't recall a notification already handed on: one that
            // arrives after the call moved to the car (or ended) is ignored.
            Task { @MainActor in
                guard let self, !self.isInCar, attempt == self.attemptId else { return }
                self.setMuted(muted)
            }
        }
    }

    private func endCallEnvironment() {
        // Only the call that set the environment up tears it down: an attempt that never
        // reached the microphone must not reset the app-wide mute of a call that's running.
        guard inCallEnvironment else { return }
        inCallEnvironment = false
        if didKeepScreenAwake {
            UIApplication.shared.isIdleTimerDisabled = previousIdleTimerDisabled
            didKeepScreenAwake = false
        }
        if let interruptionObserver {
            NotificationCenter.default.removeObserver(interruptionObserver)
        }
        interruptionObserver = nil
        if let muteGestureObserver {
            NotificationCenter.default.removeObserver(muteGestureObserver)
        }
        muteGestureObserver = nil
        // Never leave the app muted: a voice message recorded after the call would be silent.
        try? AVAudioApplication.shared.setInputMuted(false)
    }

    private func announce(_ phase: Phase) {
        guard surface == .app, UIAccessibility.isVoiceOverRunning, let text = phase.announcement else { return }
        UIAccessibility.post(notification: .announcement, argument: text)
    }

    // MARK: - Errors

    /// Shown in the car when something needs the phone first (consent, the microphone
    /// permission). Apple's CarPlay rules: say what's wrong, never tell the driver to pick
    /// up the phone.
    static let notSetUpInCar = "Talk isn't set up yet. You can set it up in AretaCare when you're parked."
    static let signedOutInCar = "You're signed out. You can sign in to AretaCare when you're parked."
    static let noCareSessionInCar = "There's no care session yet. You can create one in AretaCare when you're parked."

    private func message(for error: Error) -> String {
        guard surface == .carPlay else { return Self.message(for: error) }
        // In the car: short, and never an instruction to do something on the phone.
        guard let apiError = error as? APIError else { return "Talk couldn't start. Try again in a moment." }
        switch apiError {
        case .forbidden(let code) where code == "TALK_CONSENT_REQUIRED" || code == "AI_DATA_SHARING_CONSENT_REQUIRED":
            return Self.notSetUpInCar
        case .forbidden(let code) where code == "TALK_SUBSCRIPTION_REQUIRED":
            return "Talk needs an AretaCare subscription."
        case _ where apiError.requiresLogout:
            return Self.signedOutInCar
        case .notFound:
            return "Talk isn't available right now."
        case .unknown(let statusCode) where statusCode == 409:
            return "A Talk conversation is already running."
        case .rateLimited:
            return "You've reached the Talk limit for now. Try again later."
        case .offline, .networkError:
            return "Talk needs an internet connection."
        default:
            return "Talk couldn't start. Try again in a moment."
        }
    }

    private static func message(for error: Error) -> String {
        guard let apiError = error as? APIError else {
            return (error as? LocalizedError)?.errorDescription ?? "Talk couldn't start. Please try again."
        }
        switch apiError {
        case .forbidden(let code):
            switch code {
            case "TALK_SUBSCRIPTION_REQUIRED": return "Talk requires an active AretaCare subscription."
            case "TALK_CONSENT_REQUIRED": return "Please review how Talk works before starting."
            case "AI_DATA_SHARING_CONSENT_REQUIRED": return "Please accept the AI data processing notice before using Talk."
            default: return apiError.localizedDescription
            }
        case .notFound:
            return "Talk isn't available right now."
        case .unknown(let statusCode) where statusCode == 409:
            return "A Talk conversation is already in progress on this account. End it, or try again in a moment."
        case .rateLimited:
            return "You've reached the Talk limit for now. Please try again later."
        case .serverError(_, let message):
            return message ?? "Talk is temporarily unavailable. Please try again shortly."
        case .offline, .networkError:
            return "Talk needs an internet connection. Please check your network and try again."
        default:
            return apiError.localizedDescription
        }
    }
}
