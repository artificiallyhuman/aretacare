import Foundation

// MARK: - Audio Recording

struct AudioRecordingResponse: Codable, Identifiable, Sendable {
    let id: Int
    let sessionId: String
    let filename: String
    let s3Key: String
    let duration: Double?
    let transcribedText: String?
    let category: String?
    let aiSummary: String?
    let createdAt: Date
    let createdBy: SourceTagInfo?
    let lastEditedBy: SourceTagInfo?
    /// "processing" | "completed" | "failed". Nil from a backend that predates
    /// background transcription, which only ever returned finished recordings.
    let transcriptionStatus: String?

    var isTranscribing: Bool { transcriptionStatus == "processing" }
    var transcriptionFailed: Bool { transcriptionStatus == "failed" }
}

struct AudioRecordingUpdateRequest: Codable {
    let aiSummary: String?
    let category: String?

    init(aiSummary: String? = nil, category: String? = nil) {
        self.aiSummary = aiSummary
        self.category = category
    }
}

struct AudioRecordingListResponse: Codable {
    let recordings: [AudioRecordingResponse]
    let hasMore: Bool
    let total: Int
}

struct AudioUrlResponse: Codable {
    let url: String
}

struct AudioTranscribeResponse: Decodable {
    let transcribedText: String?
    let recordingId: Int?
    let duration: Double?
    /// "processing" on a 202 (transcription continues server-side — poll
    /// `TranscriptionPoller`); "completed" or nil when the server answered
    /// inline with `transcribedText` populated.
    let transcriptionStatus: String?

    var isProcessing: Bool { transcriptionStatus == "processing" }
}
