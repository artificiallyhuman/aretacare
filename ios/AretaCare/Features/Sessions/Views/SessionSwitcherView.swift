import SwiftUI

struct SessionSwitcherView: View {
    @Bindable var sessionVM: SessionViewModel
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dismiss) private var dismiss

    @State private var showingNewSession = false
    @State private var showingSessionLimit = false
    @State private var newSessionName = ""
    @State private var showLogoutConfirmation = false

    var body: some View {
        NavigationStack {
            List {
                Section {
                    ForEach(sessionVM.sessions) { session in
                        sessionRow(session)
                    }
                }

                Section {
                    Button {
                        if sessionVM.canCreateSession {
                            showingNewSession = true
                        } else {
                            showingSessionLimit = true
                        }
                    } label: {
                        Label("New Session", systemImage: "plus.circle")
                    }
                }

                Section {
                    Button {
                        showLogoutConfirmation = true
                    } label: {
                        HStack {
                            Label("Log Out", systemImage: "rectangle.portrait.and.arrow.right")
                            Spacer()
                        }
                    }
                    .tint(.red)
                } footer: {
                    Text("Log out of this device only.")
                }
            }
            .navigationTitle("Sessions")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
            .alert("New Session", isPresented: $showingNewSession) {
                TextField("Session name", text: $newSessionName)
                Button("Cancel", role: .cancel) { newSessionName = "" }
                Button("Create") {
                    let name = newSessionName.trimmingCharacters(in: .whitespacesAndNewlines)
                    newSessionName = ""
                    Task {
                        await sessionVM.createSession(name: name.isEmpty ? nil : name)
                        dismiss()
                    }
                }
            } message: {
                Text("Enter a name for your new session (max \(AppConstants.sessionNameMaxLength) characters).")
            }
            .alert("Session Limit", isPresented: $showingSessionLimit) {
                Button("OK", role: .cancel) {}
            } message: {
                Text("You've reached the maximum number of owned sessions (\(AppConstants.maxOwnedSessions)). Delete a session to create a new one.")
            }
            .alert("Log Out", isPresented: $showLogoutConfirmation) {
                Button("Log Out", role: .destructive) {
                    Task { await AuthManager.shared.logout() }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("Are you sure you want to log out of this device?")
            }
        }
    }

    // MARK: - Session Row

    @ViewBuilder
    private func sessionRow(_ session: SessionResponse) -> some View {
        Button {
            sessionVM.switchSession(to: session)
            dismiss()
        } label: {
            HStack(spacing: 12) {
                // Color swatch
                if let sessionColor = SessionColors.color(forKey: session.colorKey) {
                    Circle()
                        .fill(sessionColor.swatch(for: colorScheme))
                        .frame(width: 24, height: 24)
                } else {
                    Circle()
                        .fill(Color.secondary.opacity(0.3))
                        .frame(width: 24, height: 24)
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text(session.name)
                        .font(.body)
                        .foregroundStyle(.primary)

                    HStack(spacing: 8) {
                        if !session.isOwner {
                            Text("Shared by \(session.ownerName)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        if !session.collaborators.isEmpty {
                            Label("\(session.collaborators.count + 1)", systemImage: "person.2")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                Spacer()

                if session.id == sessionVM.currentSession?.id {
                    Image(systemName: "checkmark")
                        .font(.body.weight(.semibold))
                        .foregroundStyle(Color.accentColor)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

#Preview {
    SessionSwitcherView(sessionVM: SessionViewModel())
}
