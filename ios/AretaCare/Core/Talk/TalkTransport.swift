import Foundation

/// What the live connection reports to `TalkViewModel`.
enum TalkTransportEvent: Sendable {
    /// Media is flowing and the server confirmed the session.
    case ready
    /// The assistant started a lookup or a change in the care session.
    case working
    /// The server ended the session (`reason` from `session.closed`).
    case closedByServer(reason: String)
    /// The connection failed or dropped and did not recover.
    case connectionLost
    /// The server reported an error on the events channel.
    case serverError(code: String?)
}

struct TalkAudioLevels: Sendable {
    /// 0...1, the person's microphone.
    var user: Double
    /// 0...1, the assistant's voice.
    var agent: Double
}

/// The live audio connection for a Talk call.
///
/// The phone never holds an OpenAI credential: it produces a WebRTC offer, the backend
/// exchanges it for an answer, and the audio then flows directly. The events channel is
/// receive-only (the server rejects anything the client sends on it).
@MainActor
protocol TalkTransport: AnyObject {
    var onEvent: ((TalkTransportEvent) -> Void)? { get set }

    /// Configures audio, opens the microphone, and returns the complete SDP offer
    /// (ICE gathering finished — the exchange is not trickled).
    func makeOffer() async throws -> String
    func applyAnswer(_ sdp: String) async throws
    func currentLevels() async -> TalkAudioLevels
    /// Idempotent. Ends the call and releases the microphone and audio session.
    func close()
}

enum TalkTransportError: LocalizedError {
    case unavailable
    case setupFailed(String)

    var errorDescription: String? {
        switch self {
        case .unavailable:
            return "Talk isn't available in this version of the app."
        case .setupFailed:
            return "Talk couldn't start the audio connection. Please try again."
        }
    }
}

enum TalkTransportFactory {
    @MainActor
    static func make() -> TalkTransport? {
        #if canImport(WebRTC)
        return WebRTCTalkTransport()
        #else
        return nil
        #endif
    }
}
