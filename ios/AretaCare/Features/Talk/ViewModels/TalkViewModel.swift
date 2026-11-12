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
    private(set) var userLevel: Double = 0
    private(set) var agentLevel: Double = 0
    private(set) var maxSessionSeconds = 1800
    var showingConsent = false
    var showingMicDenied = false
    var notice: Notice?
    /// Set when a saved call's summary is ready to be loaded into the chat.
    private(set) var savedCallToken = 0
    /// Shown as a banner in chat when saving failed.
    var saveErrorMessage: String?

    /// Called when Talk should give the screen back to Chat.
    var onExit: (() -> Void)?

    var isActive: Bool { phase != .idle }

    // MARK: - Private state

    private var transport: TalkTransport?
    private var talkId: String?
    private var sessionId: String?
    private var levelTask: Task<Void, Never>?
    private var watchdogTask: Task<Void, Never>?
    private var keepAliveTask: Task<Void, Never>?
    private var pollTask: Task<Void, Never>?
    private var interruptionObserver: NSObjectProtocol?
    private var previousIdleTimerDisabled = false
    private var isEnding = false

    private static let connectTimeoutSeconds: Double = 20
    private static let speakingThreshold = 0.02

    // MARK: - Entry

    /// The user chose Talk. Checks availability and consent before touching the microphone.
    func begin(sessionId: String) async {
        guard phase == .idle else { return }
        self.sessionId = sessionId
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
            guard phase == .preparing else { return }
            maxSessionSeconds = status.maxSessionSeconds
            guard status.enabled else {
                fail(title: "Talk Unavailable", message: "Talk isn't available right now.")
                return
            }
            guard status.remainingSecondsToday >= 60 else {
                fail(title: "Daily Limit Reached", message: "You've reached today's Talk limit. It resets within 24 hours.")
                return
            }
            if status.hasConsent {
                await startCall()
            } else {
                showingConsent = true
            }
        } catch {
            guard phase == .preparing else { return }
            fail(title: "Talk Unavailable", message: Self.message(for: error))
        }
    }

    func acceptConsent() async {
        showingConsent = false
        do {
            let _: TalkConsentResponse = try await APIClient.shared.post(APIEndpoints.Talk.consent)
            guard phase == .preparing else { return }
            await startCall()
        } catch {
            fail(title: "Talk Unavailable", message: Self.message(for: error))
        }
    }

    func declineConsent() {
        showingConsent = false
        reset()
        onExit?()
    }

    // MARK: - Call lifecycle

    private func startCall() async {
        guard let sessionId, phase == .preparing else { return }

        let granted = await withCheckedContinuation { continuation in
            AVAudioApplication.requestRecordPermission { continuation.resume(returning: $0) }
        }
        guard phase == .preparing else { return }
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
        transport.onEvent = { [weak self] event in self?.handle(event) }
        phase = .connecting
        beginCallEnvironment()
        startWatchdog(seconds: Self.connectTimeoutSeconds) { [weak self] in
            self?.fail(title: "Couldn't Connect", message: "Talk couldn't connect. Please try again.")
        }

        do {
            let offer = try await transport.makeOffer()
            guard phase == .connecting else { return }
            let request = TalkStartRequest(
                sessionId: sessionId,
                sdp: offer,
                userTimezone: TimeZone.current.identifier,
                currentTime: ISO8601DateFormatter().string(from: Date())
            )
            let response: TalkStartResponse = try await APIClient.shared.post(APIEndpoints.Talk.sessions, body: request)
            talkId = response.talkId
            guard phase == .connecting else {
                // Ended while the request was in flight: the server still has a live call.
                await sendEnd(talkId: response.talkId)
                return
            }
            maxSessionSeconds = response.maxSeconds
            try await transport.applyAnswer(response.sdp)
        } catch {
            guard phase == .connecting else { return }
            fail(title: "Couldn't Start Talk", message: Self.message(for: error))
        }
    }

    private func handle(_ event: TalkTransportEvent) {
        switch event {
        case .ready:
            guard phase == .connecting else { return }
            phase = .listening
            announce(.listening)
            UIImpactFeedbackGenerator(style: .soft).impactOccurred()
            // The server enforces the limit; this is the fallback if its close never arrives.
            startWatchdog(seconds: Double(maxSessionSeconds) + 15) { [weak self] in
                Task { await self?.end() }
            }
            startLevelLoop()
            startKeepAlive()
        case .working:
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

    /// Ends the call (End button, switching back to Chat, or any failure after connecting)
    /// and hands the screen back to Chat. Saving continues on the server; the result is
    /// polled so the summary appears in the chat.
    func end() async {
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
            await sendEnd(talkId: endedTalkId)
        }
        endCallEnvironment()
        reset()
        onExit?()
        if let endedTalkId, let endedSessionId, wasLive {
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
            Task { await self.sendEnd(talkId: talkId) }
        }
        endCallEnvironment()
        reset()
    }

    private func sendEnd(talkId: String) async {
        // Closing the peer connection already ends the session server-side; this just
        // makes the backend save promptly. Protected so a screen lock doesn't cut it off.
        let backgroundTask = UIApplication.shared.beginBackgroundTask(withName: "talk-end")
        defer {
            if backgroundTask != .invalid { UIApplication.shared.endBackgroundTask(backgroundTask) }
        }
        let _: TalkSessionStatusResponse? = try? await APIClient.shared.post(APIEndpoints.Talk.end(talkId))
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
            Task { await self.sendEnd(talkId: orphanedTalkId) }
        }
    }

    private func reset() {
        phase = .idle
        userLevel = 0
        agentLevel = 0
        talkId = nil
        sessionId = nil
        isEnding = false
    }

    // MARK: - Result polling

    private func pollForResult(talkId: String, sessionId: String) {
        pollTask?.cancel()
        pollTask = Task { [weak self] in
            let delays: [Double] = [2, 2, 3]
            let deadline = Date().addingTimeInterval(180)
            var attempt = 0
            while !Task.isCancelled, Date() < deadline {
                try? await Task.sleep(for: .seconds(attempt < delays.count ? delays[attempt] : 5))
                attempt += 1
                guard !Task.isCancelled else { return }
                do {
                    let status: TalkSessionStatusResponse = try await APIClient.shared.get(APIEndpoints.Talk.session(talkId))
                    guard status.isFinished else { continue }
                    guard let self, !Task.isCancelled else { return }
                    if status.failed {
                        self.saveErrorMessage = "We couldn't save that Talk conversation."
                    } else if !status.wasDiscarded {
                        self.savedCallToken += 1
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

    func cancelResultPolling() {
        pollTask?.cancel()
        pollTask = nil
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
        userLevel = smooth(userLevel, levels.user)
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
        levelTask = nil
        watchdogTask = nil
        keepAliveTask = nil
    }

    // MARK: - Device environment

    private func beginCallEnvironment() {
        previousIdleTimerDisabled = UIApplication.shared.isIdleTimerDisabled
        UIApplication.shared.isIdleTimerDisabled = true
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
    }

    private func endCallEnvironment() {
        UIApplication.shared.isIdleTimerDisabled = previousIdleTimerDisabled
        if let interruptionObserver {
            NotificationCenter.default.removeObserver(interruptionObserver)
        }
        interruptionObserver = nil
    }

    private func announce(_ phase: Phase) {
        guard UIAccessibility.isVoiceOverRunning, let text = phase.announcement else { return }
        UIAccessibility.post(notification: .announcement, argument: text)
    }

    // MARK: - Errors

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
