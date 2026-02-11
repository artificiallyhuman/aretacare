import Foundation

// MARK: - Profile Data Structure

struct PatientInfo: Codable {
    var fullName: String?
    var preferredName: String?
    var dateOfBirth: String?
    var age: String?
    var contactInfo: String?
    var location: String?
}

struct CaregiverInfo: Codable, Identifiable {
    var id: String?
    var name: String?
    var relationship: String?
    var role: String?
    var contactInfo: String?
    var location: String?
}

struct ProviderInfo: Codable, Identifiable {
    var id: String?
    var name: String?
    var specialty: String?
    var organization: String?
    var contactInfo: String?
}

struct ConditionInfo: Codable, Identifiable {
    var id: String?
    var clinicalTerm: String?
    var description: String?
    var status: String? // "active", "resolved", "monitoring"
    var diagnosisDate: String?
    var details: String?
}

struct MedicationInfo: Codable, Identifiable {
    var id: String?
    var name: String?
    var description: String?
    var dose: String?
    var frequency: String?
    var status: String? // "active", "paused", "discontinued"
    var category: String? // medication category key
    var startDate: String?
    var prescriber: String?
    var notes: String?
}

struct AllergyInfo: Codable, Identifiable {
    var id: String?
    var substance: String?
    var reaction: String?
    var severity: String? // "mild", "moderate", "severe"
}

struct EventInfo: Codable, Identifiable {
    var id: String?
    var eventType: String?
    var description: String?
    var date: String?
    var details: String?
}

struct CommunicationPreference: Codable, Identifiable {
    var id: String?
    var category: String?
    var preference: String?
    var details: String?
}

struct CaregivingGuideline: Codable, Identifiable {
    var id: String?
    var category: String?
    var guideline: String?
    var importance: String? // "critical", "important", "preferred"
    var details: String?
}

struct ImportantContext: Codable, Identifiable {
    var id: String?
    var category: String?
    var context: String?
    var details: String?
}

struct PreferencesInfo: Codable {
    var communicationPreferences: [CommunicationPreference]?
    var caregivingGuidelines: [CaregivingGuideline]?
    var importantContext: [ImportantContext]?
    var emergencyInstructions: String?
    var additionalNotes: String?
}

struct ProfileData: Codable {
    var patient: PatientInfo?
    var caregivers: [CaregiverInfo]?
    var providers: [ProviderInfo]?
    var conditions: [ConditionInfo]?
    var medications: [MedicationInfo]?
    var allergies: [AllergyInfo]?
    var events: [EventInfo]?
    var preferences: PreferencesInfo?
}

// MARK: - API Response/Request Models

struct ProfileResponse: Codable, Identifiable {
    let id: Int
    let sessionId: String
    let profileData: ProfileData
    let pendingChanges: [PendingChange]?
    let lastAiUpdate: Date?
    let lastUserUpdate: Date?
    let createdAt: Date
    let updatedAt: Date
}

struct ProfileUpdateRequest: Codable {
    let profileData: ProfileData
}

struct ProfileSectionUpdateRequest: Codable {
    let section: String
    let data: AnyCodableValue
}

struct ProfileCheckResponse: Codable {
    let needsUpdate: Bool
    let hasProfile: Bool
    let lastUpdate: Date?
    let newActivityCount: Int
    let newConversationCount: Int
    let newJournalCount: Int
}

struct ProfileRegenerateRequest: Codable {
    let confirm: Bool
}

// MARK: - Pending Changes

enum ChangeType: String, Codable {
    case add
    case edit
    case delete
}

struct PendingChange: Codable, Identifiable {
    let id: String
    let changeType: ChangeType
    let fieldPath: String
    let section: String
    let itemId: String?
    let oldValue: AnyCodableValue?
    let newValue: AnyCodableValue?
    let reasoning: String
}

struct PendingChangesReviewRequest: Codable {
    let decisions: [String: AnyCodableValue]
}

struct PendingChangesResponse: Codable {
    let pendingChanges: [PendingChange]
    let hasChanges: Bool
}
