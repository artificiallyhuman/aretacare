import SwiftUI

struct JournalEntryDetailView: View {
    let entry: JournalEntryResponse
    let sessionId: String
    let viewModel: JournalViewModel

    @Environment(\.dismiss) private var dismiss
    @State private var showingEditor = false
    @State private var showDeleteConfirmation = false
    @State private var copyHapticTrigger = 0

    private var currentUserId: String {
        AuthManager.shared.currentUser?.id ?? ""
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                // Entry type badge
                HStack(spacing: 8) {
                    Image(systemName: entry.entryType.systemImage)
                        .font(.subheadline)
                    Text(entry.entryType.displayName)
                        .font(.subheadline.weight(.medium))
                }
                .foregroundStyle(entry.entryType.themeColor)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(
                    Capsule().fill(entry.entryType.themeColor.opacity(0.1))
                )

                // Title
                Text(entry.title)
                    .font(.title2.weight(.bold))
                    .foregroundStyle(.primary)

                // Content
                MarkdownTextView(content: entry.content)

                Divider()

                // Metadata
                VStack(alignment: .leading, spacing: 8) {
                    metadataRow(label: "Entry Date", value: formattedEntryDate)
                    metadataRow(label: "Created", value: entry.createdAt.dateTimeString)

                    if entry.updatedAt != entry.createdAt {
                        metadataRow(label: "Updated", value: entry.updatedAt.dateTimeString)
                    }
                }

                // Source tag
                if let createdByInfo = entry.createdByInfo {
                    HStack(spacing: 8) {
                        Text("Created by")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        SourceTagView(
                            sourceTag: createdByInfo,
                            currentUserId: currentUserId
                        )
                    }
                }

                if let editedByInfo = entry.lastEditedBy {
                    HStack(spacing: 8) {
                        Text("Last edited by")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        SourceTagView(
                            sourceTag: editedByInfo,
                            currentUserId: currentUserId
                        )
                    }
                }
            }
            .padding()
        }
        .navigationTitle("Journal Entry")
        .navigationBarTitleDisplayMode(.inline)
        .sensoryFeedback(.success, trigger: copyHapticTrigger)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    Button {
                        ClipboardHelper.copyFormatted(entry.content)
                        copyHapticTrigger += 1
                    } label: {
                        Label("Copy Content", systemImage: "doc.on.doc")
                    }

                    Button {
                        showingEditor = true
                    } label: {
                        Label("Edit", systemImage: "pencil")
                    }

                    Button(role: .destructive) {
                        showDeleteConfirmation = true
                    } label: {
                        Label("Delete", systemImage: "trash")
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
            }
        }
        .sheet(isPresented: $showingEditor) {
            JournalEntryEditorView(
                sessionId: sessionId,
                viewModel: viewModel,
                existingEntry: entry
            )
        }
        .alert("Delete Entry", isPresented: $showDeleteConfirmation) {
            Button("Delete", role: .destructive) {
                Task {
                    await viewModel.deleteEntry(sessionId: sessionId, entryId: entry.id)
                    dismiss()
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Are you sure you want to delete this journal entry? This cannot be undone.")
        }
    }

    // MARK: - Helpers

    private var formattedEntryDate: String {
        if let date = Date.fromAPIDateString(entry.entryDate) {
            return date.mediumDateString
        }
        return entry.entryDate
    }

    private func metadataRow(label: String, value: String) -> some View {
        HStack {
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
            Spacer()
            Text(value)
                .font(.caption)
                .foregroundStyle(.primary)
        }
    }
}

#Preview {
    NavigationStack {
        JournalEntryDetailView(
            entry: JournalEntryResponse(
                id: 1,
                sessionId: "s1",
                entryDate: "2026-02-09",
                entryType: .medicalUpdate,
                title: "Blood pressure reading",
                content: "Blood pressure was 120/80 at today's appointment. Doctor said this is within normal range.",
                createdBy: "user1",
                createdAt: Date(),
                updatedAt: Date(),
                sourceMessageIds: nil,
                entryMetadata: nil,
                createdByInfo: nil,
                lastEditedBy: nil
            ),
            sessionId: "s1",
            viewModel: JournalViewModel()
        )
    }
}
