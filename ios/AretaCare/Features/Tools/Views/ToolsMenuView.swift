import SwiftUI

struct ToolsMenuView: View {
    let sessionVM: SessionViewModel

    private var sessionId: String {
        sessionVM.currentSession?.id ?? ""
    }

    var body: some View {
        Form {
            if sessionId.isEmpty {
                Section {
                    Text("Select a session to access tools.")
                        .foregroundStyle(.secondary)
                }
            } else {
                Section("Journal") {
                    NavigationLink {
                        JournalView(sessionId: sessionId)
                    } label: {
                        toolRow(icon: "book", title: "Care Journal", subtitle: "View and manage journal entries")
                    }
                }

                Section("Content") {
                    NavigationLink {
                        DocumentsListView(sessionId: sessionId)
                    } label: {
                        toolRow(icon: "doc.text", title: "Document Manager", subtitle: "Upload and manage medical documents")
                    }

                    NavigationLink {
                        AudioRecordingsView(sessionId: sessionId)
                    } label: {
                        toolRow(icon: "mic", title: "Audio Recordings", subtitle: "Record and review voice memos")
                    }
                }

                Section("Health") {
                    NavigationLink {
                        ProfileView(sessionId: sessionId)
                    } label: {
                        toolRow(icon: "heart.text.clipboard", title: "Health Profile", subtitle: "View your AI-generated health summary")
                    }
                }

                Section("AI Assistants") {
                    NavigationLink {
                        JargonTranslatorView(sessionId: sessionId)
                    } label: {
                        toolRow(icon: "character.book.closed", title: "Jargon Translator", subtitle: "Understand complex medical terminology")
                    }

                    NavigationLink {
                        ConversationCoachView(sessionId: sessionId)
                    } label: {
                        toolRow(icon: "bubble.left.and.text.bubble.right", title: "Conversation Coach", subtitle: "Prepare for healthcare conversations")
                    }
                }
            }
        }
        .navigationTitle("Tools")
    }

    // MARK: - Row Helper

    private func toolRow(icon: String, title: String, subtitle: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundStyle(Color.accentColor)
                .frame(width: 28)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.subheadline.weight(.medium))
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }
}
