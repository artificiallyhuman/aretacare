import SwiftUI

// MARK: - Profile Card Section

struct ProfileCardSection<Content: View>: View {
    let title: String
    let systemImage: String
    let color: Color
    let count: Int?
    var onEdit: (() -> Void)?
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            // Section header
            HStack(spacing: 10) {
                Image(systemName: systemImage)
                    .font(.subheadline)
                    .foregroundStyle(.white)
                    .frame(width: 30, height: 30)
                    .background(color.gradient)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .accessibilityHidden(true)

                Text(title)
                    .font(.headline)

                if let count {
                    Text("\(count)")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(color.opacity(0.7))
                        .clipShape(Capsule())
                }

                Spacer()

                if let onEdit {
                    Button {
                        onEdit()
                    } label: {
                        Image(systemName: "pencil")
                            .font(.subheadline)
                            .foregroundStyle(color)
                            .frame(width: 30, height: 30)
                            .background(color.opacity(0.1))
                            .clipShape(RoundedRectangle(cornerRadius: 6))
                    }
                    .accessibilityLabel("Edit \(title)")
                }
            }

            content
        }
        .padding(14)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

// MARK: - Profile Field (key-value row)

struct ProfileField: View {
    let label: String
    let value: String?

    init(_ label: String, value: String?) {
        self.label = label
        self.value = value
    }

    var body: some View {
        if let value, !value.isEmpty {
            HStack(alignment: .top) {
                Text(label)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .frame(width: 100, alignment: .leading)
                Text(value)
                    .font(.subheadline)
            }
        }
    }
}

// MARK: - Accent Card (left-bordered item)

struct AccentCard<Content: View>: View {
    let color: Color
    @ViewBuilder let content: Content

    var body: some View {
        HStack(spacing: 0) {
            RoundedRectangle(cornerRadius: 2)
                .fill(color)
                .frame(width: 4)

            VStack(alignment: .leading, spacing: 4) {
                content
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
        }
        .background(color.opacity(0.05))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}

// MARK: - Status Badge

struct StatusBadge: View {
    let text: String
    let color: Color

    var body: some View {
        Text(text)
            .font(.caption2.weight(.semibold))
            .padding(.horizontal, 7)
            .padding(.vertical, 2)
            .background(color.opacity(0.15))
            .foregroundStyle(color)
            .clipShape(Capsule())
    }
}

// MARK: - Preferences Sub-Section

struct PreferencesSubSection<Content: View>: View {
    let title: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
                .padding(.top, 4)
            content
        }
    }
}

// MARK: - Edit Section Identifier

struct ProfileEditSection: Identifiable {
    let id: String
    init(_ name: String) { self.id = name }
}

// MARK: - Section Completeness

/// Describes one profile section for both scoring and display. Built in
/// `ProfileViewModel.sectionStatuses` so the percentage, the "what's missing"
/// caption and the empty-section placeholders can never disagree. `key` matches
/// the `ProfileEditSection` name used to open the edit sheet.
struct ProfileSectionStatus: Identifiable {
    let key: String
    let label: String
    let emptyText: String
    let isComplete: Bool

    var id: String { key }
}

// MARK: - Empty Section Placeholder

/// Shown inside a section card that has no content yet, so an empty section is
/// visible rather than absent — otherwise the completeness percentage counts a
/// section the reader has no way to see. Wording matches the web client.
struct ProfileEmptyText: View {
    let text: String

    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text)
            .font(.subheadline)
            .italic()
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - Edit Row

struct ProfileEditRow: View {
    let label: String
    @Binding var text: String

    init(_ label: String, text: Binding<String>) {
        self.label = label
        self._text = text
    }

    var body: some View {
        HStack {
            Text(label)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .frame(width: 100, alignment: .leading)
            TextField(label, text: $text)
                .font(.subheadline)
        }
    }
}

// MARK: - Date Picker Row

struct ProfileDatePickerRow: View {
    let label: String
    @Binding var dateString: String

    @State private var date: Date = Date()
    @State private var hasValue: Bool = false

    init(_ label: String, dateString: Binding<String>) {
        self.label = label
        self._dateString = dateString
    }

    private static let outputFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f
    }()

    private static let parsers: [DateFormatter] = {
        let formats = [
            "yyyy-MM-dd",
            "MM/dd/yyyy",
            "M/d/yyyy",
            "MMMM d, yyyy",
            "MMM d, yyyy",
            "MMMM yyyy",
            "MMM yyyy",
            "yyyy"
        ]
        return formats.map { fmt in
            let f = DateFormatter()
            f.dateFormat = fmt
            f.locale = Locale(identifier: "en_US_POSIX")
            return f
        }
    }()

    private static func parse(_ string: String) -> Date? {
        let trimmed = string.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        for parser in parsers {
            if let d = parser.date(from: trimmed) { return d }
        }
        return nil
    }

    var body: some View {
        HStack {
            Text(label)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .frame(width: 100, alignment: .leading)

            if hasValue {
                DatePicker("", selection: $date, displayedComponents: .date)
                    .labelsHidden()

                Button {
                    hasValue = false
                    dateString = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.secondary)
                        .font(.subheadline)
                }
                .buttonStyle(.plain)
            } else {
                Button {
                    date = Self.parse(dateString) ?? Date()
                    hasValue = true
                    dateString = Self.outputFormatter.string(from: date)
                } label: {
                    Text(dateString.isEmpty ? "Set \(label)" : dateString)
                        .font(.subheadline)
                        .foregroundStyle(dateString.isEmpty ? .tertiary : .primary)
                }
                .buttonStyle(.plain)
            }
        }
        .onAppear {
            if let parsed = Self.parse(dateString) {
                date = parsed
                hasValue = true
            }
        }
        .onChange(of: date) { _, newDate in
            if hasValue {
                dateString = Self.outputFormatter.string(from: newDate)
            }
        }
    }
}

// MARK: - Add Item Button

struct ProfileAddItemButton: View {
    let label: String
    let action: () -> Void

    init(_ label: String, action: @escaping () -> Void) {
        self.label = label
        self.action = action
    }

    var body: some View {
        Button {
            action()
        } label: {
            Label(label, systemImage: "plus.circle.fill")
                .font(.subheadline)
                .foregroundStyle(Color.accentColor)
        }
    }
}

// MARK: - Color Helpers

func profileStatusColor(_ status: String) -> Color {
    switch status.lowercased() {
    case "active": return .red
    case "resolved": return .green
    case "monitoring": return .orange
    default: return .gray
    }
}

func profileSeverityColor(_ severity: String) -> Color {
    switch severity.lowercased() {
    case "severe": return .red
    case "moderate": return .orange
    case "mild": return .yellow
    default: return .gray
    }
}

func profileImportanceColor(_ importance: String) -> Color {
    switch importance.lowercased() {
    case "critical": return .red
    case "important": return .orange
    case "preferred": return .gray
    default: return .indigo
    }
}

func profileMedicationStatusColor(_ status: String) -> Color {
    switch status.lowercased() {
    case "active": return .green
    case "paused": return .yellow
    case "discontinued": return .gray
    default: return .green
    }
}

func profileMedicationCategoryLabel(_ category: String) -> String? {
    MedicationCategories.label(category)
}

/// Display-order sort for conditions (active first, then newest diagnosis).
/// Shared by ProfileView, its copy-text builder and the section editor, which
/// each carried the same comparator.
func profileSortedConditions(_ conditions: [ConditionInfo]) -> [ConditionInfo] {
    let statusOrder = ["active": 0, "monitoring": 1, "resolved": 2]
    return conditions.sorted { a, b in
        let statusA = statusOrder[(a.status ?? "").lowercased()] ?? 1
        let statusB = statusOrder[(b.status ?? "").lowercased()] ?? 1
        if statusA != statusB { return statusA < statusB }
        return (a.diagnosisDate ?? "") > (b.diagnosisDate ?? "")
    }
}

func profileCommCategoryLabel(_ category: String) -> String {
    let labels: [String: String] = [
        "medical_discussions": "Medical Discussions",
        "daily_care": "Daily Care",
        "emotional_support": "Emotional Support",
        "appointments": "Appointments",
        "updates": "Updates"
    ]
    return labels[category.lowercased()] ?? category.replacingOccurrences(of: "_", with: " ").capitalized
}

func profileGuideCategoryLabel(_ category: String) -> String {
    let labels: [String: String] = [
        "daily_routine": "Daily Routine",
        "medical_care": "Medical Care",
        "nutrition": "Nutrition",
        "mobility": "Mobility",
        "safety": "Safety",
        "comfort": "Comfort",
        "sleep": "Sleep"
    ]
    return labels[category.lowercased()] ?? category.replacingOccurrences(of: "_", with: " ").capitalized
}

func profileContextCategoryLabel(_ category: String) -> String {
    let labels: [String: String] = [
        "personality": "Personality",
        "history": "History",
        "cultural": "Cultural",
        "religious": "Religious",
        "social": "Social",
        "interests": "Interests",
        "fears": "Fears"
    ]
    return labels[category.lowercased()] ?? category.replacingOccurrences(of: "_", with: " ").capitalized
}

func profileEventTypeLabel(_ type: String) -> String {
    let labels: [String: String] = [
        "hospitalization": "Hospitalization",
        "surgery": "Surgery",
        "er_visit": "ER Visit",
        "major_diagnosis": "Major Diagnosis",
        "procedure": "Procedure",
        "other": "Other"
    ]
    return labels[type.lowercased()] ?? type.capitalized
}

func profileEventTypeColor(_ type: String?) -> Color {
    switch (type ?? "").lowercased() {
    case "hospitalization": return .red
    case "surgery": return .purple
    case "er_visit": return .orange
    case "major_diagnosis": return .pink
    case "procedure": return .blue
    default: return .blue
    }
}

// MARK: - Contact info parser (legacy contact_info string → structured fields)

struct ParsedContact {
    var phone: String?
    var email: String?
    var address: String?
}

func parseContactInfo(_ raw: String?) -> ParsedContact {
    var result = ParsedContact()
    guard let raw = raw, !raw.isEmpty else { return result }

    let labelRE = try? NSRegularExpression(pattern: #"^(phone|tel|telephone|email|e-mail|address|addr)\s*:\s*"#, options: .caseInsensitive)
    let phoneRE = try? NSRegularExpression(pattern: #"\+?\d[\d\s().\-]{6,}\d"#)
    let emailRE = try? NSRegularExpression(pattern: #"[^\s,;|]+@[^\s,;|]+\.[^\s,;|]+"#)

    func stripLabel(_ s: String) -> String {
        guard let labelRE = labelRE else { return s }
        let range = NSRange(s.startIndex..., in: s)
        return labelRE.stringByReplacingMatches(in: s, range: range, withTemplate: "")
            .trimmingCharacters(in: .whitespaces)
    }
    func firstMatch(_ re: NSRegularExpression?, in s: String) -> String? {
        guard let re = re else { return nil }
        let range = NSRange(s.startIndex..., in: s)
        guard let m = re.firstMatch(in: s, range: range), let r = Range(m.range, in: s) else { return nil }
        return String(s[r])
    }

    let pieces = raw.split(whereSeparator: { "\n;|".contains($0) })
        .map { $0.trimmingCharacters(in: .whitespaces) }
        .filter { !$0.isEmpty }

    if pieces.count > 1 {
        for piece in pieces {
            let cleaned = stripLabel(piece)
            if cleaned.isEmpty { continue }
            if result.email == nil, let m = firstMatch(emailRE, in: cleaned) { result.email = m; continue }
            if result.phone == nil, let m = firstMatch(phoneRE, in: cleaned), m.filter(\.isNumber).count >= 7 { result.phone = m.trimmingCharacters(in: .whitespaces); continue }
            if result.address == nil { result.address = cleaned }
        }
        return result
    }

    if let m = firstMatch(emailRE, in: raw) { result.email = m }
    var remaining = result.email.map { raw.replacingOccurrences(of: $0, with: "") } ?? raw
    if let m = firstMatch(phoneRE, in: remaining), m.filter(\.isNumber).count >= 7 {
        result.phone = m.trimmingCharacters(in: .whitespaces)
        remaining = remaining.replacingOccurrences(of: m, with: "")
    }
    remaining = stripLabel(remaining).replacingOccurrences(of: ",", with: " ").trimmingCharacters(in: .whitespaces)
    if !remaining.isEmpty { result.address = remaining }
    return result
}
