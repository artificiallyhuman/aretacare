import SwiftUI

struct ProfilePendingChangesView: View {
    let sessionId: String
    let viewModel: ProfileViewModel

    @Environment(\.dismiss) private var dismiss
    @State private var decisions: [String: Bool] = [:]

    var body: some View {
        List {
            if viewModel.pendingChanges.isEmpty {
                Text("No pending changes to review.")
                    .foregroundStyle(.secondary)
            } else {
                Section {
                    HStack(spacing: 12) {
                        Button("Accept All") {
                            for change in viewModel.pendingChanges {
                                decisions[change.id] = true
                            }
                        }
                        .font(.subheadline)
                        .foregroundStyle(.green)

                        Button("Reject All") {
                            for change in viewModel.pendingChanges {
                                decisions[change.id] = false
                            }
                        }
                        .font(.subheadline)
                        .foregroundStyle(.red)

                        if !decisions.isEmpty {
                            Button("Clear") {
                                decisions.removeAll()
                            }
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        }
                    }
                    .buttonStyle(.plain)
                }

                ForEach(viewModel.pendingChanges) { change in
                    VStack(alignment: .leading, spacing: 10) {
                        // Header: type badge + section + item name
                        HStack {
                            Text(change.changeType.rawValue.capitalized)
                                .font(.caption2.weight(.semibold))
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(changeTypeColor(change.changeType).opacity(0.15))
                                .foregroundStyle(changeTypeColor(change.changeType))
                                .clipShape(Capsule())

                            Text(change.section.replacingOccurrences(of: "_", with: " ").capitalized)
                                .font(.subheadline.weight(.semibold))

                            if let name = itemName(change) {
                                Text("— \(name)")
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                            }
                        }

                        // Change details
                        changeDetailView(change)

                        // Reasoning
                        HStack(alignment: .top, spacing: 4) {
                            Text("Reasoning:")
                                .font(.caption.weight(.medium))
                                .foregroundStyle(.secondary)
                            Text(change.reasoning)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }

                        Text(change.fieldPath)
                            .font(.caption2)
                            .foregroundStyle(.tertiary)

                        // Accept / Reject buttons
                        HStack(spacing: 12) {
                            Button {
                                decisions[change.id] = true
                            } label: {
                                Label("Accept", systemImage: "checkmark")
                                    .font(.subheadline)
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 6)
                                    .background(decisions[change.id] == true ? Color.green.opacity(0.2) : Color(.systemGray5))
                                    .clipShape(Capsule())
                            }

                            Button {
                                decisions[change.id] = false
                            } label: {
                                Label("Reject", systemImage: "xmark")
                                    .font(.subheadline)
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 6)
                                    .background(decisions[change.id] == false ? Color.red.opacity(0.2) : Color(.systemGray5))
                                    .clipShape(Capsule())
                            }
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(.vertical, 4)
                }
            }
        }
        .navigationTitle("Pending Changes")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel") { dismiss() }
            }
            ToolbarItem(placement: .confirmationAction) {
                Button("Submit") {
                    submitDecisions()
                }
                .disabled(decisions.count < viewModel.pendingChanges.count)
            }
        }
    }

    // MARK: - Change Detail View

    @ViewBuilder
    private func changeDetailView(_ change: PendingChange) -> some View {
        switch change.changeType {
        case .add:
            if let newValue = change.newValue {
                VStack(alignment: .leading, spacing: 4) {
                    Text("New item to add:")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(.green)
                    ForEach(dictionaryEntries(newValue), id: \.key) { entry in
                        HStack(alignment: .top, spacing: 4) {
                            Text("\u{2022}")
                                .font(.caption)
                                .foregroundStyle(.green)
                            Text("\(formatKey(entry.key)):")
                                .font(.caption.weight(.medium))
                                .foregroundStyle(Color(.label))
                            Text(entry.value)
                                .font(.caption)
                                .foregroundStyle(.green)
                        }
                    }
                }
                .padding(8)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.green.opacity(0.08))
                .clipShape(RoundedRectangle(cornerRadius: 8))
            }

        case .edit:
            if let oldValue = change.oldValue, let newValue = change.newValue {
                let oldEntries = dictionaryMap(oldValue)
                let newEntries = dictionaryMap(newValue)

                if !oldEntries.isEmpty || !newEntries.isEmpty {
                    // Object edit — show changed fields
                    let allKeys = Array(Set(Array(oldEntries.keys) + Array(newEntries.keys)))
                        .filter { $0 != "id" }
                        .sorted()
                    VStack(alignment: .leading, spacing: 4) {
                        ForEach(allKeys, id: \.self) { key in
                            let oldVal = oldEntries[key]
                            let newVal = newEntries[key]
                            if oldVal != newVal, oldVal != nil || newVal != nil {
                                HStack(alignment: .top, spacing: 4) {
                                    Text("\(formatKey(key)):")
                                        .font(.caption.weight(.medium))
                                        .foregroundStyle(Color(.label))
                                    if let old = oldVal {
                                        Text(old)
                                            .font(.caption)
                                            .strikethrough()
                                            .foregroundStyle(.red)
                                    }
                                    Text("\u{2192}")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                    Text(newVal ?? "(removed)")
                                        .font(.caption)
                                        .foregroundStyle(.green)
                                }
                            }
                        }
                    }
                    .padding(8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color(.systemGray6))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                } else {
                    // Simple value edit
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(spacing: 4) {
                            Text("Current:")
                                .font(.caption.weight(.medium))
                                .foregroundStyle(.red)
                            Text(displayString(oldValue))
                                .font(.caption)
                                .foregroundStyle(.red)
                        }
                        .padding(6)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.red.opacity(0.08))
                        .clipShape(RoundedRectangle(cornerRadius: 6))

                        HStack(spacing: 4) {
                            Text("Proposed:")
                                .font(.caption.weight(.medium))
                                .foregroundStyle(.green)
                            Text(displayString(newValue))
                                .font(.caption)
                                .foregroundStyle(.green)
                        }
                        .padding(6)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.green.opacity(0.08))
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                    }
                }
            }

        case .delete:
            if let oldValue = change.oldValue {
                VStack(alignment: .leading, spacing: 4) {
                    Text("To delete:")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(.red)
                    let entries = dictionaryEntries(oldValue)
                    if !entries.isEmpty {
                        ForEach(entries, id: \.key) { entry in
                            HStack(alignment: .top, spacing: 4) {
                                Text("\u{2022}")
                                    .font(.caption)
                                    .foregroundStyle(.red)
                                Text("\(formatKey(entry.key)):")
                                    .font(.caption.weight(.medium))
                                    .foregroundStyle(Color(.label))
                                Text(entry.value)
                                    .font(.caption)
                                    .foregroundStyle(.red)
                            }
                        }
                    } else {
                        Text(displayString(oldValue))
                            .font(.caption)
                            .foregroundStyle(.red)
                    }
                }
                .padding(8)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.red.opacity(0.08))
                .clipShape(RoundedRectangle(cornerRadius: 8))
            }
        }
    }

    // MARK: - Helpers

    private func submitDecisions() {
        var codableDecisions: [String: AnyCodableValue] = [:]
        for (id, accepted) in decisions {
            codableDecisions[id] = .string(accepted ? "accept" : "reject")
        }
        Task {
            await viewModel.reviewPendingChanges(sessionId: sessionId, decisions: codableDecisions)
            await viewModel.fetchProfile(sessionId: sessionId)
            dismiss()
        }
    }

    private func changeTypeColor(_ type: ChangeType) -> Color {
        switch type {
        case .add: return .green
        case .edit: return .orange
        case .delete: return .red
        }
    }

    private func itemName(_ change: PendingChange) -> String? {
        if let name = extractString(change.newValue, key: "name") { return name }
        if let name = extractString(change.oldValue, key: "name") { return name }
        if let name = extractString(change.newValue, key: "substance") { return name }
        if let name = extractString(change.oldValue, key: "substance") { return name }
        return nil
    }

    private func extractString(_ value: AnyCodableValue?, key: String) -> String? {
        guard case .dictionary(let dict) = value,
              case .string(let str) = dict[key] else { return nil }
        return str.isEmpty ? nil : str
    }

    private func displayString(_ value: AnyCodableValue) -> String {
        switch value {
        case .string(let s): return s
        case .int(let i): return String(i)
        case .double(let d): return String(d)
        case .bool(let b): return b ? "true" : "false"
        case .null: return "(none)"
        case .array, .dictionary: return "(complex value)"
        }
    }

    private func dictionaryEntries(_ value: AnyCodableValue) -> [(key: String, value: String)] {
        guard case .dictionary(let dict) = value else {
            return []
        }
        return dict.compactMap { key, val in
            guard key != "id" else { return nil }
            let str = displayString(val)
            guard !str.isEmpty, str != "(none)" else { return nil }
            return (key: key, value: str)
        }.sorted { $0.key < $1.key }
    }

    private func dictionaryMap(_ value: AnyCodableValue) -> [String: String] {
        guard case .dictionary(let dict) = value else { return [:] }
        var result: [String: String] = [:]
        for (key, val) in dict {
            guard key != "id" else { continue }
            let str = displayString(val)
            if !str.isEmpty, str != "(none)" {
                result[key] = str
            }
        }
        return result
    }

    private func formatKey(_ key: String) -> String {
        key.replacingOccurrences(of: "_", with: " ")
    }
}
