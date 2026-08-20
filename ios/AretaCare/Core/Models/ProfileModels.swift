import Foundation

// MARK: - Profile Data Structure
//
// Every struct in this section keeps the JSON fields it does not model in
// `additionalFields` (see `UnknownFieldsCodable.swift`). Sections are saved back
// whole, so dropping unknown keys here would delete them on the server. The
// Codable conformances live in extensions so the synthesized memberwise
// initialisers (`CaregiverInfo(id:)`, `ProfileData()`, …) keep working.

struct PatientInfo: Codable, UnknownFieldsPreserving {
    var fullName: String?
    var preferredName: String?
    var dateOfBirth: String?
    var age: String?
    var contactInfo: String?
    var location: String?
    var additionalFields: [String: AnyCodableValue] = [:]
}

extension PatientInfo {
    private enum CodingKeys: String, CodingKey, CaseIterable {
        case fullName, preferredName, dateOfBirth, age, contactInfo, location
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        fullName = try c.decodeIfPresent(String.self, forKey: .fullName)
        preferredName = try c.decodeIfPresent(String.self, forKey: .preferredName)
        dateOfBirth = try c.decodeIfPresent(String.self, forKey: .dateOfBirth)
        age = try c.decodeIfPresent(String.self, forKey: .age)
        contactInfo = try c.decodeIfPresent(String.self, forKey: .contactInfo)
        location = try c.decodeIfPresent(String.self, forKey: .location)
        additionalFields = try decoder.decodeUnknownFields(excluding: CodingKeys.self)
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(fullName, forKey: .fullName)
        try c.encodeIfPresent(preferredName, forKey: .preferredName)
        try c.encodeIfPresent(dateOfBirth, forKey: .dateOfBirth)
        try c.encodeIfPresent(age, forKey: .age)
        try c.encodeIfPresent(contactInfo, forKey: .contactInfo)
        try c.encodeIfPresent(location, forKey: .location)
        try encoder.encodeUnknownFields(additionalFields)
    }
}

struct CaregiverInfo: Codable, Identifiable, UnknownFieldsPreserving {
    var id: String?
    var name: String?
    var relationship: String?
    var role: String?
    var contactInfo: String?
    var location: String?
    var additionalFields: [String: AnyCodableValue] = [:]
}

extension CaregiverInfo {
    private enum CodingKeys: String, CodingKey, CaseIterable {
        case id, name, relationship, role, contactInfo, location
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decodeIfPresent(String.self, forKey: .id)
        name = try c.decodeIfPresent(String.self, forKey: .name)
        relationship = try c.decodeIfPresent(String.self, forKey: .relationship)
        role = try c.decodeIfPresent(String.self, forKey: .role)
        contactInfo = try c.decodeIfPresent(String.self, forKey: .contactInfo)
        location = try c.decodeIfPresent(String.self, forKey: .location)
        additionalFields = try decoder.decodeUnknownFields(excluding: CodingKeys.self)
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(id, forKey: .id)
        try c.encodeIfPresent(name, forKey: .name)
        try c.encodeIfPresent(relationship, forKey: .relationship)
        try c.encodeIfPresent(role, forKey: .role)
        try c.encodeIfPresent(contactInfo, forKey: .contactInfo)
        try c.encodeIfPresent(location, forKey: .location)
        try encoder.encodeUnknownFields(additionalFields)
    }
}

struct ProviderInfo: Codable, Identifiable, UnknownFieldsPreserving {
    var id: String?
    var name: String?
    var specialty: String?
    var organization: String?
    var phone: String?
    var email: String?
    var address: String?
    var contactInfo: String?
    var additionalFields: [String: AnyCodableValue] = [:]
}

extension ProviderInfo {
    private enum CodingKeys: String, CodingKey, CaseIterable {
        case id, name, specialty, organization, phone, email, address, contactInfo
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decodeIfPresent(String.self, forKey: .id)
        name = try c.decodeIfPresent(String.self, forKey: .name)
        specialty = try c.decodeIfPresent(String.self, forKey: .specialty)
        organization = try c.decodeIfPresent(String.self, forKey: .organization)
        phone = try c.decodeIfPresent(String.self, forKey: .phone)
        email = try c.decodeIfPresent(String.self, forKey: .email)
        address = try c.decodeIfPresent(String.self, forKey: .address)
        contactInfo = try c.decodeIfPresent(String.self, forKey: .contactInfo)
        additionalFields = try decoder.decodeUnknownFields(excluding: CodingKeys.self)
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(id, forKey: .id)
        try c.encodeIfPresent(name, forKey: .name)
        try c.encodeIfPresent(specialty, forKey: .specialty)
        try c.encodeIfPresent(organization, forKey: .organization)
        try c.encodeIfPresent(phone, forKey: .phone)
        try c.encodeIfPresent(email, forKey: .email)
        try c.encodeIfPresent(address, forKey: .address)
        try c.encodeIfPresent(contactInfo, forKey: .contactInfo)
        try encoder.encodeUnknownFields(additionalFields)
    }
}

struct ConditionInfo: Codable, Identifiable, UnknownFieldsPreserving {
    var id: String?
    var clinicalTerm: String?
    var description: String?
    var status: String? // "active", "resolved", "monitoring"
    var diagnosisDate: String?
    var details: String?
    var additionalFields: [String: AnyCodableValue] = [:]
}

extension ConditionInfo {
    private enum CodingKeys: String, CodingKey, CaseIterable {
        case id, clinicalTerm, description, status, diagnosisDate, details
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decodeIfPresent(String.self, forKey: .id)
        clinicalTerm = try c.decodeIfPresent(String.self, forKey: .clinicalTerm)
        description = try c.decodeIfPresent(String.self, forKey: .description)
        status = try c.decodeIfPresent(String.self, forKey: .status)
        diagnosisDate = try c.decodeIfPresent(String.self, forKey: .diagnosisDate)
        details = try c.decodeIfPresent(String.self, forKey: .details)
        additionalFields = try decoder.decodeUnknownFields(excluding: CodingKeys.self)
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(id, forKey: .id)
        try c.encodeIfPresent(clinicalTerm, forKey: .clinicalTerm)
        try c.encodeIfPresent(description, forKey: .description)
        try c.encodeIfPresent(status, forKey: .status)
        try c.encodeIfPresent(diagnosisDate, forKey: .diagnosisDate)
        try c.encodeIfPresent(details, forKey: .details)
        try encoder.encodeUnknownFields(additionalFields)
    }
}

struct MedicationInfo: Codable, Identifiable, UnknownFieldsPreserving {
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
    var additionalFields: [String: AnyCodableValue] = [:]
}

extension MedicationInfo {
    private enum CodingKeys: String, CodingKey, CaseIterable {
        case id, name, description, dose, frequency, status, category, startDate, prescriber, notes
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decodeIfPresent(String.self, forKey: .id)
        name = try c.decodeIfPresent(String.self, forKey: .name)
        description = try c.decodeIfPresent(String.self, forKey: .description)
        dose = try c.decodeIfPresent(String.self, forKey: .dose)
        frequency = try c.decodeIfPresent(String.self, forKey: .frequency)
        status = try c.decodeIfPresent(String.self, forKey: .status)
        category = try c.decodeIfPresent(String.self, forKey: .category)
        startDate = try c.decodeIfPresent(String.self, forKey: .startDate)
        prescriber = try c.decodeIfPresent(String.self, forKey: .prescriber)
        notes = try c.decodeIfPresent(String.self, forKey: .notes)
        additionalFields = try decoder.decodeUnknownFields(excluding: CodingKeys.self)
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(id, forKey: .id)
        try c.encodeIfPresent(name, forKey: .name)
        try c.encodeIfPresent(description, forKey: .description)
        try c.encodeIfPresent(dose, forKey: .dose)
        try c.encodeIfPresent(frequency, forKey: .frequency)
        try c.encodeIfPresent(status, forKey: .status)
        try c.encodeIfPresent(category, forKey: .category)
        try c.encodeIfPresent(startDate, forKey: .startDate)
        try c.encodeIfPresent(prescriber, forKey: .prescriber)
        try c.encodeIfPresent(notes, forKey: .notes)
        try encoder.encodeUnknownFields(additionalFields)
    }
}

struct AllergyInfo: Codable, Identifiable, UnknownFieldsPreserving {
    var id: String?
    var substance: String?
    var reaction: String?
    var severity: String? // "mild", "moderate", "severe"
    var additionalFields: [String: AnyCodableValue] = [:]
}

extension AllergyInfo {
    private enum CodingKeys: String, CodingKey, CaseIterable {
        case id, substance, reaction, severity
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decodeIfPresent(String.self, forKey: .id)
        substance = try c.decodeIfPresent(String.self, forKey: .substance)
        reaction = try c.decodeIfPresent(String.self, forKey: .reaction)
        severity = try c.decodeIfPresent(String.self, forKey: .severity)
        additionalFields = try decoder.decodeUnknownFields(excluding: CodingKeys.self)
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(id, forKey: .id)
        try c.encodeIfPresent(substance, forKey: .substance)
        try c.encodeIfPresent(reaction, forKey: .reaction)
        try c.encodeIfPresent(severity, forKey: .severity)
        try encoder.encodeUnknownFields(additionalFields)
    }
}

struct EventInfo: Codable, Identifiable, UnknownFieldsPreserving {
    var id: String?
    var eventType: String?
    var description: String?
    var date: String?
    var details: String?
    var additionalFields: [String: AnyCodableValue] = [:]
}

extension EventInfo {
    private enum CodingKeys: String, CodingKey, CaseIterable {
        case id, eventType, description, date, details
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decodeIfPresent(String.self, forKey: .id)
        eventType = try c.decodeIfPresent(String.self, forKey: .eventType)
        description = try c.decodeIfPresent(String.self, forKey: .description)
        date = try c.decodeIfPresent(String.self, forKey: .date)
        details = try c.decodeIfPresent(String.self, forKey: .details)
        additionalFields = try decoder.decodeUnknownFields(excluding: CodingKeys.self)
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(id, forKey: .id)
        try c.encodeIfPresent(eventType, forKey: .eventType)
        try c.encodeIfPresent(description, forKey: .description)
        try c.encodeIfPresent(date, forKey: .date)
        try c.encodeIfPresent(details, forKey: .details)
        try encoder.encodeUnknownFields(additionalFields)
    }
}

struct CommunicationPreference: Codable, Identifiable, UnknownFieldsPreserving {
    var id: String?
    var category: String?
    var preference: String?
    var details: String?
    var additionalFields: [String: AnyCodableValue] = [:]
}

extension CommunicationPreference {
    private enum CodingKeys: String, CodingKey, CaseIterable {
        case id, category, preference, details
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decodeIfPresent(String.self, forKey: .id)
        category = try c.decodeIfPresent(String.self, forKey: .category)
        preference = try c.decodeIfPresent(String.self, forKey: .preference)
        details = try c.decodeIfPresent(String.self, forKey: .details)
        additionalFields = try decoder.decodeUnknownFields(excluding: CodingKeys.self)
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(id, forKey: .id)
        try c.encodeIfPresent(category, forKey: .category)
        try c.encodeIfPresent(preference, forKey: .preference)
        try c.encodeIfPresent(details, forKey: .details)
        try encoder.encodeUnknownFields(additionalFields)
    }
}

struct CaregivingGuideline: Codable, Identifiable, UnknownFieldsPreserving {
    var id: String?
    var category: String?
    var guideline: String?
    var importance: String? // "critical", "important", "preferred"
    var details: String?
    var additionalFields: [String: AnyCodableValue] = [:]
}

extension CaregivingGuideline {
    private enum CodingKeys: String, CodingKey, CaseIterable {
        case id, category, guideline, importance, details
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decodeIfPresent(String.self, forKey: .id)
        category = try c.decodeIfPresent(String.self, forKey: .category)
        guideline = try c.decodeIfPresent(String.self, forKey: .guideline)
        importance = try c.decodeIfPresent(String.self, forKey: .importance)
        details = try c.decodeIfPresent(String.self, forKey: .details)
        additionalFields = try decoder.decodeUnknownFields(excluding: CodingKeys.self)
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(id, forKey: .id)
        try c.encodeIfPresent(category, forKey: .category)
        try c.encodeIfPresent(guideline, forKey: .guideline)
        try c.encodeIfPresent(importance, forKey: .importance)
        try c.encodeIfPresent(details, forKey: .details)
        try encoder.encodeUnknownFields(additionalFields)
    }
}

struct ImportantContext: Codable, Identifiable, UnknownFieldsPreserving {
    var id: String?
    var category: String?
    var context: String?
    var details: String?
    var additionalFields: [String: AnyCodableValue] = [:]
}

extension ImportantContext {
    private enum CodingKeys: String, CodingKey, CaseIterable {
        case id, category, context, details
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decodeIfPresent(String.self, forKey: .id)
        category = try c.decodeIfPresent(String.self, forKey: .category)
        context = try c.decodeIfPresent(String.self, forKey: .context)
        details = try c.decodeIfPresent(String.self, forKey: .details)
        additionalFields = try decoder.decodeUnknownFields(excluding: CodingKeys.self)
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(id, forKey: .id)
        try c.encodeIfPresent(category, forKey: .category)
        try c.encodeIfPresent(context, forKey: .context)
        try c.encodeIfPresent(details, forKey: .details)
        try encoder.encodeUnknownFields(additionalFields)
    }
}

struct PreferencesInfo: Codable, UnknownFieldsPreserving {
    var communicationPreferences: [CommunicationPreference]?
    var caregivingGuidelines: [CaregivingGuideline]?
    var importantContext: [ImportantContext]?
    var emergencyInstructions: String?
    var additionalNotes: String?
    var additionalFields: [String: AnyCodableValue] = [:]
}

extension PreferencesInfo {
    private enum CodingKeys: String, CodingKey, CaseIterable {
        case communicationPreferences, caregivingGuidelines, importantContext, emergencyInstructions, additionalNotes
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        communicationPreferences = try c.decodeIfPresent([CommunicationPreference].self, forKey: .communicationPreferences)
        caregivingGuidelines = try c.decodeIfPresent([CaregivingGuideline].self, forKey: .caregivingGuidelines)
        importantContext = try c.decodeIfPresent([ImportantContext].self, forKey: .importantContext)
        emergencyInstructions = try c.decodeIfPresent(String.self, forKey: .emergencyInstructions)
        additionalNotes = try c.decodeIfPresent(String.self, forKey: .additionalNotes)
        additionalFields = try decoder.decodeUnknownFields(excluding: CodingKeys.self)
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(communicationPreferences, forKey: .communicationPreferences)
        try c.encodeIfPresent(caregivingGuidelines, forKey: .caregivingGuidelines)
        try c.encodeIfPresent(importantContext, forKey: .importantContext)
        try c.encodeIfPresent(emergencyInstructions, forKey: .emergencyInstructions)
        try c.encodeIfPresent(additionalNotes, forKey: .additionalNotes)
        try encoder.encodeUnknownFields(additionalFields)
    }
}

struct ProfileData: Codable, UnknownFieldsPreserving {
    var patient: PatientInfo?
    var caregivers: [CaregiverInfo]?
    var providers: [ProviderInfo]?
    var conditions: [ConditionInfo]?
    var medications: [MedicationInfo]?
    var allergies: [AllergyInfo]?
    var events: [EventInfo]?
    var preferences: PreferencesInfo?
    var additionalFields: [String: AnyCodableValue] = [:]
}

extension ProfileData {
    private enum CodingKeys: String, CodingKey, CaseIterable {
        case patient, caregivers, providers, conditions, medications, allergies, events, preferences
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        patient = try c.decodeIfPresent(PatientInfo.self, forKey: .patient)
        caregivers = try c.decodeIfPresent([CaregiverInfo].self, forKey: .caregivers)
        providers = try c.decodeIfPresent([ProviderInfo].self, forKey: .providers)
        conditions = try c.decodeIfPresent([ConditionInfo].self, forKey: .conditions)
        medications = try c.decodeIfPresent([MedicationInfo].self, forKey: .medications)
        allergies = try c.decodeIfPresent([AllergyInfo].self, forKey: .allergies)
        events = try c.decodeIfPresent([EventInfo].self, forKey: .events)
        preferences = try c.decodeIfPresent(PreferencesInfo.self, forKey: .preferences)
        additionalFields = try decoder.decodeUnknownFields(excluding: CodingKeys.self)
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(patient, forKey: .patient)
        try c.encodeIfPresent(caregivers, forKey: .caregivers)
        try c.encodeIfPresent(providers, forKey: .providers)
        try c.encodeIfPresent(conditions, forKey: .conditions)
        try c.encodeIfPresent(medications, forKey: .medications)
        try c.encodeIfPresent(allergies, forKey: .allergies)
        try c.encodeIfPresent(events, forKey: .events)
        try c.encodeIfPresent(preferences, forKey: .preferences)
        try encoder.encodeUnknownFields(additionalFields)
    }
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
