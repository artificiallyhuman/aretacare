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
    let labels: [String: String] = [
        "multiple": "Multiple Uses",
        "pain_management": "Pain Relief",
        "cardiovascular": "Heart & Blood Pressure",
        "diabetes": "Diabetes & Blood Sugar",
        "mental_health": "Mental Health",
        "antibiotics": "Infection & Antibiotics",
        "respiratory": "Breathing & Lungs",
        "gastrointestinal": "Stomach & Digestion",
        "neurological": "Brain & Nerves",
        "endocrine": "Hormones",
        "oncology": "Cancer Treatment",
        "immunosuppressant": "Immune System",
        "vitamins_supplements": "Vitamins & Supplements",
        "other": "Other"
    ]
    return labels[category.lowercased()]
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
