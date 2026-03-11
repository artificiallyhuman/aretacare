import Foundation

// MARK: - Enums

enum MessageRole: String, Codable, Sendable {
    case user
    case assistant
}

enum MessageType: String, Codable, Sendable {
    case text
    case document
    case image
    case audio
}

// MARK: - Source Tag

struct SourceTagInfo: Codable, Sendable, Equatable {
    let userId: String
    let name: String
    let initials: String
}

// MARK: - Message

struct MessageResponse: Codable, Identifiable, Sendable, Equatable {
    let id: Int
    let sessionId: String
    let role: MessageRole
    let content: String
    let createdAt: Date
    let updatedAt: Date?
    let messageType: MessageType?
    let documentId: Int?
    let mediaUrl: String?
    let thumbnailUrl: String?
    let extractedText: String?
    let createdBy: SourceTagInfo?
    let lastEditedBy: SourceTagInfo?
}

struct ConversationHistory: Codable {
    let messages: [MessageResponse]
    let totalCount: Int
    let hasMore: Bool
}

// MARK: - Requests

struct SendMessageRequest: Codable {
    let content: String
    let sessionId: String
    let messageType: String
    let documentId: Int?
    let audioRecordingId: Int?
    let mediaUrl: String?
    let entryDate: String?
    let userTimezone: String?
    let currentTime: String?

    init(content: String, sessionId: String, messageType: String = "text",
         documentId: Int? = nil, audioRecordingId: Int? = nil, mediaUrl: String? = nil,
         entryDate: String? = nil, userTimezone: String? = nil, currentTime: String? = nil) {
        self.content = content
        self.sessionId = sessionId
        self.messageType = messageType
        self.documentId = documentId
        self.audioRecordingId = audioRecordingId
        self.mediaUrl = mediaUrl
        self.entryDate = entryDate
        self.userTimezone = userTimezone
        self.currentTime = currentTime
    }
}

struct UpdateMessageRequest: Codable {
    let content: String
}

struct UpdateMessageResponse: Codable {
    let id: Int
    let content: String
    let updatedAt: Date
    let lastEditedBy: SourceTagInfo?
}

// MARK: - Tools

struct JargonTranslationRequest: Codable {
    let medicalTerm: String
    let context: String
    let sessionId: String?

    init(medicalTerm: String, context: String = "", sessionId: String? = nil) {
        self.medicalTerm = medicalTerm
        self.context = context
        self.sessionId = sessionId
    }
}

struct JargonTranslationResponse: Codable {
    let term: String
    let explanation: String
    let contextNote: String
}

struct ConversationCoachRequest: Codable {
    let situation: String
    let sessionId: String?

    init(situation: String, sessionId: String? = nil) {
        self.situation = situation
        self.sessionId = sessionId
    }
}

struct ConversationCoachResponse: Codable {
    let content: String
}
