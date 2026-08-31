import Foundation

// MARK: - Entry Type

enum EntryType: String, Codable, CaseIterable, Sendable {
    case medicalUpdate = "MEDICAL_UPDATE"
    case treatmentChange = "TREATMENT_CHANGE"
    case appointment = "APPOINTMENT"
    case insight = "INSIGHT"
    case milestone = "MILESTONE"
    case other = "OTHER"

    var displayName: String {
        switch self {
        case .medicalUpdate: return "Medical Update"
        case .treatmentChange: return "Treatment Change"
        case .appointment: return "Appointment"
        case .insight: return "Insight"
        case .milestone: return "Milestone"
        case .other: return "Other"
        }
    }
}

// MARK: - Journal Entry

struct JournalEntryResponse: Codable, Identifiable, Sendable {
    let id: Int
    let sessionId: String
    let entryDate: String // "YYYY-MM-DD"
    let entryType: EntryType
    let title: String
    let content: String
    let createdBy: String
    let createdAt: Date
    let updatedAt: Date
    let sourceMessageIds: [Int]?
    let entryMetadata: [String: AnyCodableValue]?
    let createdByInfo: SourceTagInfo?
    let lastEditedBy: SourceTagInfo?
}

struct JournalEntriesGrouped: Codable {
    let entriesByDate: [String: [JournalEntryResponse]]
    let totalDates: Int?
    let hasMore: Bool?
    let oldestDate: String?
}

// MARK: - Journal Dates (for calendar view)

struct JournalDateInfo: Codable, Identifiable {
    let date: String      // "YYYY-MM-DD"
    let entryCount: Int

    var id: String { date }
}

struct JournalDatesResponse: Codable {
    let dates: [JournalDateInfo]
}

// MARK: - Requests

struct JournalEntryCreateRequest: Codable {
    let title: String
    let content: String
    let entryType: EntryType
    let entryDate: String? // "YYYY-MM-DD", defaults to today
}

struct JournalEntryUpdateRequest: Codable {
    let title: String?
    let content: String?
    let entryType: EntryType?
    let entryDate: String?

    init(title: String? = nil, content: String? = nil, entryType: EntryType? = nil, entryDate: String? = nil) {
        self.title = title
        self.content = content
        self.entryType = entryType
        self.entryDate = entryDate
    }
}

// MARK: - AnyCodableValue (for flexible metadata)

enum AnyCodableValue: Codable, Sendable {
    case string(String)
    case int(Int)
    case double(Double)
    case bool(Bool)
    case array([AnyCodableValue])
    case dictionary([String: AnyCodableValue])
    case null

    /// Nesting depth beyond which decoding fails rather than recursing. Metadata
    /// this deep is never legitimate, and unbounded recursion on hostile JSON
    /// overflows the stack (an uncatchable crash) instead of throwing.
    private static let maxNestingDepth = 32

    /// Key type used only to probe whether a value is a JSON object.
    private struct ProbeKey: CodingKey {
        var stringValue: String
        var intValue: Int?
        init?(stringValue: String) { self.stringValue = stringValue }
        init?(intValue: Int) { self.intValue = intValue; self.stringValue = String(intValue) }
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Int.self) {
            self = .int(value)
        } else if let value = try? container.decode(Double.self) {
            self = .double(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if container.decodeNil() {
            self = .null
        } else {
            // Container types are the only remaining possibilities, and they are
            // where recursion happens. `codingPath` tracks how deep we already
            // are, so it doubles as the depth counter.
            guard decoder.codingPath.count < Self.maxNestingDepth else {
                throw DecodingError.dataCorrupted(
                    DecodingError.Context(
                        codingPath: decoder.codingPath,
                        debugDescription: "JSON nesting exceeds \(Self.maxNestingDepth) levels"
                    )
                )
            }
            // Probe the shape first so the recursive decode can use `try` and
            // let a depth violation propagate instead of collapsing to null.
            if (try? decoder.unkeyedContainer()) != nil {
                self = .array(try container.decode([AnyCodableValue].self))
            } else if (try? decoder.container(keyedBy: ProbeKey.self)) != nil {
                self = .dictionary(try container.decode([String: AnyCodableValue].self))
            } else {
                self = .null
            }
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let value): try container.encode(value)
        case .int(let value): try container.encode(value)
        case .double(let value): try container.encode(value)
        case .bool(let value): try container.encode(value)
        case .array(let value): try container.encode(value)
        case .dictionary(let value): try container.encode(value)
        case .null: try container.encodeNil()
        }
    }

}
