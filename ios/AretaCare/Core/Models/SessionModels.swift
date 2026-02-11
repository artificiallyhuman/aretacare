import Foundation

// MARK: - Session

struct SessionResponse: Codable, Identifiable, Sendable {
    let id: String
    let name: String
    let createdAt: Date
    let lastActivity: Date
    let isActive: Bool
    let ownerId: String
    let ownerName: String
    let ownerEmail: String
    let isOwner: Bool
    let collaborators: [CollaboratorInfo]
    let colorKey: String?
}

struct CollaboratorInfo: Codable, Identifiable, Sendable {
    let userId: String
    let email: String
    let name: String
    let addedAt: Date
    let ownedSessionCount: Int

    var id: String { userId }
}

struct SessionCreateRequest: Codable {
    let name: String?
}

struct SessionRenameRequest: Codable {
    let name: String
}

struct SessionStatistics: Codable {
    let messageCount: Int
    let documentCount: Int
    let audioRecordingCount: Int
    let journalEntryCount: Int
}

// MARK: - Collaboration

struct UserCheckRequest: Codable {
    let email: String
}

struct UserExistsResponse: Codable {
    let exists: Bool
    let userId: String?
    let name: String?
    let message: String?
}

struct SessionShareRequest: Codable {
    let email: String
    let confirmSharingConsent: Bool
}

struct SessionShareResponse: Codable {
    let success: Bool
    let message: String
    let collaborator: CollaboratorInfo?
}

struct TransferOwnershipRequest: Codable {
    let newOwnerUserId: String
}

// MARK: - Session Colors

struct SessionColorUpdate: Codable {
    let colorKey: String
    let swapWithSessionId: String?
}

// MARK: - Invitations

struct InvitationSendRequest: Codable {
    let email: String
    let confirmSharingConsent: Bool
}

struct PendingInvitationResponse: Codable, Identifiable {
    let id: String
    let email: String
    let sessionId: String
    let invitedByName: String
    let createdAt: Date
    let daysRemaining: Int
    let isExpired: Bool
}
