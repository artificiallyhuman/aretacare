import SwiftUI

struct SessionDetailView: View {
    let sessionId: String
    let viewModel: SettingsViewModel

    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme

    @State private var showRenameAlert = false
    @State private var renameText = ""
    @State private var showColorPicker = false
    @State private var showCollaboration = false
    @State private var showDeleteConfirmation = false
    @State private var saveHapticTrigger = 0
    @State private var isDeleting = false

    private var session: SessionResponse? {
        viewModel.sessions.first { $0.id == sessionId }
    }

    var body: some View {
        content
            .disabled(isDeleting)
            .overlay {
                if isDeleting {
                    UploadingOverlay(
                        message: "Deleting care session…",
                        accessibilityLabel: "Deleting care session"
                    )
                }
            }
            .overlay(alignment: .top) {
                if let error = viewModel.errorMessage {
                    ErrorBannerView(message: error) {
                        viewModel.dismissError()
                    }
                    .padding(.top, 8)
                }
            }
    }

    /// Split out of `body` so the deleting overlay and error banner stay attached
    /// even after the session disappears from the view model (see `else` branch).
    @ViewBuilder
    private var content: some View {
        if let session {
            Form {
                // Session info
                Section {
                    Button {
                        renameText = session.name
                        showRenameAlert = true
                    } label: {
                        HStack {
                            Label("Name", systemImage: "textformat")
                            Spacer()
                            Text(session.name)
                                .foregroundStyle(.secondary)
                            Image(systemName: "chevron.right")
                                .font(.caption)
                                .foregroundStyle(.tertiary)
                                .accessibilityHidden(true)
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityHint("Rename this care session")

                    Button { showColorPicker = true } label: {
                        HStack {
                            Label("Color", systemImage: "paintpalette")
                            Spacer()
                            Circle()
                                .fill(swatchColor(for: session))
                                .frame(width: 20, height: 20)
                                .accessibilityHidden(true)
                            Image(systemName: "chevron.right")
                                .font(.caption)
                                .foregroundStyle(.tertiary)
                                .accessibilityHidden(true)
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityHint("Change the color for this care session")

                    HStack {
                        Label("Created", systemImage: "calendar")
                        Spacer()
                        Text(session.createdAt, style: .date)
                            .foregroundStyle(.secondary)
                    }
                }

                // Statistics
                if let stats = viewModel.sessionStatistics[sessionId] {
                    Section("Statistics") {
                        statisticRow(label: "Messages", count: stats.conversations, icon: "bubble.left")
                        statisticRow(label: "Journal Entries", count: stats.journalEntries, icon: "book")
                        statisticRow(label: "Documents", count: stats.documents, icon: "doc")
                        statisticRow(label: "Audio Recordings", count: stats.audioRecordings, icon: "mic")
                    }
                }

                // Collaboration
                Section {
                    HStack {
                        Label("Collaboration", systemImage: "person.2")
                        Spacer()
                        if !session.collaborators.isEmpty {
                            Text("\(session.collaborators.count)")
                                .foregroundStyle(.secondary)
                        }
                        Image(systemName: "chevron.right")
                            .font(.caption)
                            .foregroundStyle(.tertiary)
                    }
                    .contentShape(Rectangle())
                    .onTapGesture {
                        showCollaboration = true
                    }
                }

                // Delete
                Section {
                    Button(role: .destructive) {
                        showDeleteConfirmation = true
                    } label: {
                        HStack {
                            Label("Delete Care Session", systemImage: "trash")
                            Spacer()
                        }
                    }
                    .confirmationDialog("Delete Care Session", isPresented: $showDeleteConfirmation, titleVisibility: .visible) {
                        Button("Delete", role: .destructive) {
                            Task {
                                isDeleting = true
                                if await viewModel.deleteSession(id: sessionId) {
                                    // Leave the overlay up through the pop so the
                                    // empty state never shows.
                                    dismiss()
                                } else {
                                    isDeleting = false
                                }
                            }
                        }
                        Button("Cancel", role: .cancel) {}
                    } message: {
                        Text("Delete \"\(session.name)\"? All conversations, journal entries, documents, and recordings in this care session will be permanently deleted.")
                    }
                } footer: {
                    Text("Permanently deletes all conversations, journal entries, documents, and recordings in this care session.")
                }
            }
            .navigationTitle(session.name)
            .navigationBarTitleDisplayMode(.inline)
            .task {
                if viewModel.sessionStatistics[sessionId] == nil {
                    await viewModel.fetchStatistics(sessionId: sessionId)
                }
            }
            .alert("Rename Care Session", isPresented: $showRenameAlert) {
                TextField("Care session name", text: $renameText)
                Button("Rename") {
                    Task {
                        await viewModel.renameSession(id: sessionId, name: renameText)
                        saveHapticTrigger += 1
                    }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("Enter a new name (max \(AppConstants.sessionNameMaxLength) characters).")
            }
            .sheet(isPresented: $showColorPicker) {
                SessionColorPickerView(session: session, viewModel: viewModel)
            }
            .sheet(isPresented: $showCollaboration) {
                NavigationStack {
                    CollaborationView(session: session)
                }
            }
            .onChange(of: showCollaboration) { _, isShowing in
                if !isShowing {
                    Task { await viewModel.fetchSessions() }
                }
            }
            .sensoryFeedback(.success, trigger: saveHapticTrigger)
        } else {
            // A successful delete removes the session from the view model before
            // `dismiss()` takes effect. Render a matching backdrop rather than
            // collapsing to nothing, which would flash blank under the overlay.
            Color(.systemGroupedBackground)
                .ignoresSafeArea()
        }
    }

    // MARK: - Helpers

    private func swatchColor(for session: SessionResponse) -> Color {
        if let colorKey = session.colorKey,
           let sessionColor = SessionColors.color(forKey: colorKey) {
            return sessionColor.swatch(for: colorScheme)
        }
        return Color(.systemGray4)
    }

    private func statisticRow(label: String, count: Int, icon: String) -> some View {
        HStack {
            Label(label, systemImage: icon)
            Spacer()
            Text("\(count)")
                .foregroundStyle(.secondary)
        }
    }
}
