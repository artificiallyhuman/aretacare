import Foundation

// MARK: - Talk (live voice) API models
//
// The decoder converts snake_case keys, so property names are camelCase with no CodingKeys.

struct TalkStatusResponse: Codable, Sendable {
    let enabled: Bool
    let hasConsent: Bool
    let remainingSecondsToday: Int
    let maxSessionSeconds: Int
}

struct TalkConsentResponse: Codable, Sendable {
    let status: String
}

struct TalkStartRequest: Codable, Sendable {
    let sessionId: String
    let sdp: String
    let userTimezone: String
    let currentTime: String
}

struct TalkStartResponse: Codable, Sendable {
    let talkId: String
    let sdp: String
    let maxSeconds: Int
}

struct TalkSessionStatusResponse: Codable, Sendable {
    let talkId: String
    let status: String
    let outcome: String?
    let audioRecordingId: Int?
    let durationSeconds: Double?
    let journalEntriesCreated: Int?

    var isFinished: Bool { status == "completed" || status == "failed" }
    var failed: Bool { status == "failed" }
    var wasDiscarded: Bool { outcome == "discarded" }
}

// MARK: - Summary message metadata

/// The post-call summary is an ordinary assistant text message carrying
/// `message_metadata.kind == "talk_summary"`; older builds show its `content` as a
/// normal bubble.
struct TalkSummaryInfo: Equatable, Sendable {
    let hasRecording: Bool
    let durationSeconds: Double?
    let journalEntries: Int
    /// Posted when the call ends; the server fills in the summary once the recording,
    /// transcript and journal entries are saved.
    let isSaving: Bool

    init?(metadata: [String: AnyCodableValue]?) {
        guard let metadata, case .string("talk_summary")? = metadata["kind"] else { return nil }
        // Keys inside free-form metadata may or may not have been camel-cased by the
        // decoder's key strategy; accept both spellings.
        func value(_ snake: String, _ camel: String) -> AnyCodableValue? { metadata[snake] ?? metadata[camel] }
        func number(_ value: AnyCodableValue?) -> Double? {
            switch value {
            case .int(let int)?: return Double(int)
            case .double(let double)?: return double
            default: return nil
            }
        }
        hasRecording = number(value("audio_recording_id", "audioRecordingId")) != nil
        durationSeconds = number(value("duration_seconds", "durationSeconds"))
        journalEntries = Int(number(value("journal_entries", "journalEntries")) ?? 0)
        isSaving = metadata["status"] == .string("saving")
    }

    var durationLabel: String? {
        guard let durationSeconds, durationSeconds > 0 else { return nil }
        let seconds = Int(durationSeconds.rounded())
        return seconds < 60 ? "\(seconds) sec" : "\(Int((Double(seconds) / 60).rounded())) min"
    }
}

extension MessageResponse {
    var talkSummary: TalkSummaryInfo? { TalkSummaryInfo(metadata: messageMetadata) }
}
