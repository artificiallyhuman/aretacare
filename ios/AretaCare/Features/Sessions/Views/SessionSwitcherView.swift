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
                    ForEach(sessionVM.sessions.filter(\.isOwner)) { session in
                        sessionRow(session)
                    }
                } header: {
                    Text("Your Care Sessions")
                } footer: {
                    Text("Rename, share, and delete care sessions in Settings.")
                }

                if !sessionVM.sessions.filter({ !$0.isOwner }).isEmpty {
                    Section("Shared with You") {
                        ForEach(sessionVM.sessions.filter { !$0.isOwner }) { session in
                            sessionRow(session)
                        }
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
                        Label("New Care Session", systemImage: "plus.circle")
                    }
                }

                Section {
                    Button {
                        showLogoutConfirmation = true
                    } label: {
                        HStack {
                            Label("Logout", systemImage: "rectangle.portrait.and.arrow.right")
                            Spacer()
                        }
                    }
                    .tint(.red)
                } footer: {
                    Text("Logout from this device only.")
                }
            }
            .navigationTitle("Care Sessions")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
            .alert("New Care Session", isPresented: $showingNewSession) {
                TextField("Care session name", text: $newSessionName)
                Button("Cancel", role: .cancel) { newSessionName = "" }
                Button("Create") {
                    let name = newSessionName.trimmingCharacters(in: .whitespacesAndNewlines)
                    newSessionName = ""
                    Task {
                        guard !sessionVM.isLoading else { return }
                        await sessionVM.createSession(name: name.isEmpty ? nil : name)
                        dismiss()
                    }
                }
            } message: {
                Text("Enter a name for your new care session (max \(AppConstants.sessionNameMaxLength) characters).")
            }
            .alert("Care Session Limit", isPresented: $showingSessionLimit) {
                Button("OK", role: .cancel) {}
            } message: {
                Text("You've reached the maximum number of owned care sessions (\(AppConstants.maxOwnedSessions)). Delete a care session to create a new one.")
            }
            .alert("Logout", isPresented: $showLogoutConfirmation) {
                Button("Logout", role: .destructive) {
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
                        .accessibilityHidden(true)
                } else {
                    Circle()
                        .fill(Color.secondary.opacity(0.3))
                        .frame(width: 24, height: 24)
                        .accessibilityHidden(true)
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
                        .accessibilityHidden(true)
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
