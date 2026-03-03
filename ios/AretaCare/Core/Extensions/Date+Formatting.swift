import Foundation

extension Date {
    // MARK: - ISO 8601

    /// Full ISO 8601 date-time string (e.g., "2026-02-09T14:30:00Z").
    var iso8601String: String {
        ISO8601DateFormatter().string(from: self)
    }

    // MARK: - Display Formats

    /// Short date (e.g., "Feb 9, 2026").
    var shortDateString: String {
        Self.shortDateFormatter.string(from: self)
    }

    /// Medium date (e.g., "February 9, 2026").
    var mediumDateString: String {
        Self.mediumDateFormatter.string(from: self)
    }

    /// Time only (e.g., "2:30 PM").
    var timeString: String {
        Self.timeFormatter.string(from: self)
    }

    /// Date and time (e.g., "Feb 9, 2026 at 2:30 PM").
    var dateTimeString: String {
        Self.dateTimeFormatter.string(from: self)
    }

    /// Relative description (e.g., "2 hours ago", "Yesterday").
    var relativeString: String {
        Self.relativeFormatter.localizedString(for: self, relativeTo: Date())
    }

    /// YYYY-MM-DD format for API date parameters.
    var apiDateString: String {
        Self.apiDateFormatter.string(from: self)
    }

    // MARK: - Parsing

    /// Parse a YYYY-MM-DD string into a Date.
    static func fromAPIDateString(_ string: String) -> Date? {
        apiDateFormatter.date(from: string)
    }

    /// Weekday with date (e.g., "Monday, Feb 10, 2026").
    var weekdayDateString: String {
        Self.weekdayDateFormatter.string(from: self)
    }

    /// Chat-style date label (e.g., "Today", "Yesterday", "Feb 18").
    var chatDateLabel: String {
        if isToday { return "Today" }
        if isYesterday { return "Yesterday" }
        let cal = Calendar.current
        if cal.isDate(self, equalTo: Date(), toGranularity: .year) {
            return Self.chatDateSameYearFormatter.string(from: self)
        }
        return shortDateString
    }

    // MARK: - Helpers

    /// Whether this date is today.
    var isToday: Bool {
        Calendar.current.isDateInToday(self)
    }

    /// Whether this date is yesterday.
    var isYesterday: Bool {
        Calendar.current.isDateInYesterday(self)
    }

    /// Start of this date's day.
    var startOfDay: Date {
        Calendar.current.startOfDay(for: self)
    }

    // MARK: - Shared Formatters (cached)

    private static let shortDateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .medium
        f.timeStyle = .none
        return f
    }()

    private static let mediumDateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .long
        f.timeStyle = .none
        return f
    }()

    private static let timeFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .none
        f.timeStyle = .short
        return f
    }()

    private static let dateTimeFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .medium
        f.timeStyle = .short
        return f
    }()

    private static let relativeFormatter: RelativeDateTimeFormatter = {
        let f = RelativeDateTimeFormatter()
        f.unitsStyle = .full
        return f
    }()

    private static let weekdayDateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "EEEE, MMM d, yyyy"
        return f
    }()

    private static let chatDateSameYearFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "MMM d"
        return f
    }()

    private static let apiDateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone.current
        return f
    }()
}

// MARK: - JSON Date Decoding Strategy

extension JSONDecoder {
    /// Decoder configured for the AretaCare backend API.
    /// Handles ISO 8601 dates with fractional seconds.
    static let apiDecoder: JSONDecoder = {
        let decoder = JSONDecoder()
        let isoFormatter = ISO8601DateFormatter()
        isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        let isoFormatterNoFrac = ISO8601DateFormatter()
        isoFormatterNoFrac.formatOptions = [.withInternetDateTime]

        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let string = try container.decode(String.self)

            if let date = isoFormatter.date(from: string) {
                return date
            }
            if let date = isoFormatterNoFrac.date(from: string) {
                return date
            }
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Cannot decode date: \(string)"
            )
        }
        return decoder
    }()
}

extension JSONEncoder {
    /// Encoder configured for the AretaCare backend API.
    static let apiEncoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }()
}
