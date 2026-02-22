import SwiftUI

struct JournalEntryEditorView: View {
    let sessionId: String
    let viewModel: JournalViewModel
    var existingEntry: JournalEntryResponse?

    @Environment(\.dismiss) private var dismiss

    @State private var title: String = ""
    @State private var content: String = ""
    @State private var entryType: EntryType = .other
    @State private var entryDate: Date = Date()
    @State private var isSaving = false
    @State private var initialTitle = ""
    @State private var initialContent = ""

    private var isEditing: Bool { existingEntry != nil }

    private var hasChanges: Bool {
        title != initialTitle || content != initialContent
    }

    private var isValid: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Entry Type") {
                    Picker("Type", selection: $entryType) {
                        ForEach(EntryType.allCases, id: \.self) { type in
                            Label(type.displayName, systemImage: type.systemImage)
                                .tag(type)
                        }
                    }
                }

                Section("Date") {
                    DatePicker("Entry Date", selection: $entryDate, displayedComponents: .date)
                }

                Section("Title") {
                    TextField("Entry title", text: $title)
                        .textInputAutocapitalization(.sentences)
                }

                Section {
                    TextEditor(text: $content)
                        .frame(minHeight: 150)
                        .textInputAutocapitalization(.sentences)
                } header: {
                    HStack {
                        Text("Content")
                        Spacer()
                        Text("\(content.count) characters")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .navigationTitle(isEditing ? "Edit Entry" : "New Entry")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isEditing ? "Save" : "Create") {
                        Task { await save() }
                    }
                    .disabled(!isValid || isSaving)
                }
            }
            .disabled(isSaving)
            .overlay {
                if isSaving {
                    Color.black.opacity(0.1)
                        .ignoresSafeArea()
                    ProgressView("Saving...")
                        .padding()
                        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
                }
            }
            .onAppear {
                if let entry = existingEntry {
                    title = entry.title
                    content = entry.content
                    entryType = entry.entryType
                    if let date = Date.fromAPIDateString(entry.entryDate) {
                        entryDate = date
                    }
                }
                initialTitle = title
                initialContent = content
            }
            .interactiveDismissDisabled(hasChanges)
        }
    }

    // MARK: - Save

    private func save() async {
        isSaving = true
        defer { isSaving = false }

        let dateString = entryDate.apiDateString

        if let entry = existingEntry {
            await viewModel.updateEntry(
                sessionId: sessionId,
                entryId: entry.id,
                title: title.trimmingCharacters(in: .whitespacesAndNewlines),
                content: content.trimmingCharacters(in: .whitespacesAndNewlines),
                entryType: entryType,
                entryDate: dateString
            )
        } else {
            await viewModel.createEntry(
                sessionId: sessionId,
                title: title.trimmingCharacters(in: .whitespacesAndNewlines),
                content: content.trimmingCharacters(in: .whitespacesAndNewlines),
                entryType: entryType,
                entryDate: dateString
            )
        }

        if viewModel.errorMessage == nil {
            dismiss()
        }
    }
}

#Preview {
    JournalEntryEditorView(
        sessionId: "preview-session",
        viewModel: JournalViewModel()
    )
}
