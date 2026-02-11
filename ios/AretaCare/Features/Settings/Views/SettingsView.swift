import SwiftUI

struct SettingsView: View {
    @State private var viewModel = SettingsViewModel()

    @AppStorage("biometricLockEnabled") private var biometricLockEnabled = false
    @State private var showChangeName = false
    @State private var showChangeEmail = false
    @State private var showChangePassword = false
    @State private var showLogoutEverywhereConfirmation = false
    @State private var showDeleteAccountAlert = false
    @State private var deleteAccountPassword = ""
    @State private var showDeleteAccountPasswordPrompt = false
    @State private var isDeletingAccount = false

    // Session management (detail view handles rename/color/delete)

    var body: some View {
        Form {
            accountSection
            securitySection
            sessionsSection
            dangerZoneSection
            aboutSection
        }
        .navigationTitle("Settings")
        .task {
            async let sessions: () = viewModel.fetchSessions()
            async let devices: () = viewModel.fetchDevicesCount()
            _ = await (sessions, devices)
        }
        .sheet(isPresented: $showChangeName) {
            ChangeNameView(viewModel: viewModel)
        }
        .sheet(isPresented: $showChangeEmail) {
            ChangeEmailView(viewModel: viewModel)
        }
        .sheet(isPresented: $showChangePassword) {
            ChangePasswordView(viewModel: viewModel)
        }
        .alert("Log Out Everywhere", isPresented: $showLogoutEverywhereConfirmation) {
            Button("Log Out All Devices", role: .destructive) {
                Task { await viewModel.logoutEverywhere() }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This will log you out of all devices and sessions, including this one.")
        }
        .alert("Delete Account", isPresented: $showDeleteAccountAlert) {
            Button("Continue", role: .destructive) {
                showDeleteAccountPasswordPrompt = true
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This will permanently delete your account and all associated data. This action cannot be undone.")
        }
        .alert("Confirm Password", isPresented: $showDeleteAccountPasswordPrompt) {
            SecureField("Password", text: $deleteAccountPassword)
            Button("Delete My Account", role: .destructive) {
                Task {
                    isDeletingAccount = true
                    _ = await viewModel.deleteAccount(password: deleteAccountPassword)
                    isDeletingAccount = false
                    deleteAccountPassword = ""
                }
            }
            .disabled(deleteAccountPassword.isEmpty)
            Button("Cancel", role: .cancel) {
                deleteAccountPassword = ""
            }
        } message: {
            Text("Enter your password to confirm account deletion.")
        }
        .overlay(alignment: .top) {
            if let error = viewModel.errorMessage {
                ErrorBannerView(message: error) {
                    viewModel.dismissError()
                }
                .padding(.top, 8)
            }
        }
        .overlay(alignment: .top) {
            if let success = viewModel.successMessage {
                successBanner(success)
                    .padding(.top, 8)
            }
        }
        .disabled(isDeletingAccount)
    }

    // MARK: - Account Section

    private var accountSection: some View {
        Section("Account") {
            // Name
            HStack {
                Label("Name", systemImage: "person")
                Spacer()
                Text(viewModel.user?.name ?? "")
                    .foregroundStyle(.secondary)
                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
            .contentShape(Rectangle())
            .onTapGesture { showChangeName = true }

            // Email
            HStack {
                Label("Email", systemImage: "envelope")
                Spacer()
                Text(viewModel.user?.email ?? "")
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
            .contentShape(Rectangle())
            .onTapGesture { showChangeEmail = true }

            // Pending email change
            if let pendingEmail = viewModel.user?.pendingEmail {
                HStack(spacing: 6) {
                    Image(systemName: "clock")
                        .font(.caption)
                        .foregroundStyle(.orange)
                    Text("Pending: \(pendingEmail)")
                        .font(.caption)
                        .foregroundStyle(.orange)
                }
            }

            // Password
            HStack {
                Label("Password", systemImage: "lock")
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
            .contentShape(Rectangle())
            .onTapGesture { showChangePassword = true }
        }
    }

    // MARK: - Security Section

    private var securitySection: some View {
        Section("Security") {
            NavigationLink {
                MFASetupView()
            } label: {
                Label("Multi-Factor Authentication", systemImage: "lock.shield")
            }

            if BiometricManager.shared.isAvailable {
                Toggle(isOn: $biometricLockEnabled) {
                    Label(biometricLockLabel, systemImage: biometricLockIcon)
                }
            }

            Button {
                showLogoutEverywhereConfirmation = true
            } label: {
                HStack {
                    Label("Log Out Everywhere", systemImage: "rectangle.portrait.and.arrow.right")
                    Spacer()
                    if viewModel.devicesCount > 0 {
                        Text("\(viewModel.devicesCount) \(viewModel.devicesCount == 1 ? "device" : "devices")")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .tint(.primary)
        }
    }

    private var biometricLockLabel: String {
        switch BiometricManager.shared.biometricType {
        case .faceID: return "Lock with Face ID"
        case .touchID: return "Lock with Touch ID"
        case .none: return "Biometric Lock"
        }
    }

    private var biometricLockIcon: String {
        switch BiometricManager.shared.biometricType {
        case .faceID: return "faceid"
        case .touchID: return "touchid"
        case .none: return "lock"
        }
    }

    // MARK: - Sessions Section

    private var sessionsSection: some View {
        Section {
            if viewModel.sessions.isEmpty {
                Text("No sessions")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(viewModel.sessions.filter(\.isOwner)) { session in
                    sessionRow(session)
                }
            }
        } header: {
            Text("Sessions")
        } footer: {
            Text("You own \(viewModel.sessions.filter(\.isOwner).count) of \(AppConstants.maxOwnedSessions) sessions.")
        }
    }

    private func sessionRow(_ session: SessionResponse) -> some View {
        NavigationLink {
            SessionDetailView(sessionId: session.id, viewModel: viewModel)
        } label: {
            HStack(spacing: 12) {
                // Color swatch
                Circle()
                    .fill(sessionSwatchColor(session))
                    .frame(width: 24, height: 24)

                VStack(alignment: .leading, spacing: 2) {
                    Text(session.name)
                        .lineLimit(1)

                    if let stats = viewModel.sessionStatistics[session.id] {
                        HStack(spacing: 8) {
                            statisticLabel(count: stats.messageCount, icon: "bubble.left")
                            statisticLabel(count: stats.journalEntryCount, icon: "book")
                            statisticLabel(count: stats.documentCount, icon: "doc")
                            statisticLabel(count: stats.audioRecordingCount, icon: "mic")
                        }
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                    }
                }

                Spacer()

                if !session.collaborators.isEmpty {
                    HStack(spacing: 2) {
                        Image(systemName: "person.2")
                            .font(.caption2)
                        Text("\(session.collaborators.count)")
                            .font(.caption2)
                    }
                    .foregroundStyle(.secondary)
                }
            }
        }
        .task {
            if viewModel.sessionStatistics[session.id] == nil {
                await viewModel.fetchStatistics(sessionId: session.id)
            }
        }
    }

    // MARK: - Danger Zone

    private var dangerZoneSection: some View {
        Section {
            Button(role: .destructive) {
                showDeleteAccountAlert = true
            } label: {
                HStack {
                    Label("Delete Account", systemImage: "trash")
                    Spacer()
                }
            }
        } header: {
            Text("Danger Zone")
        } footer: {
            Text("Permanently deletes your account and all data.")
        }
    }

    // MARK: - About Section

    private var aboutSection: some View {
        Section("About") {
            HStack {
                Label("Version", systemImage: "info.circle")
                Spacer()
                Text(appVersion)
                    .foregroundStyle(.secondary)
            }

            NavigationLink {
                FeedbackView()
            } label: {
                Label("Send Feedback", systemImage: "envelope")
            }
        }
    }

    // MARK: - Helpers

    private var appVersion: String {
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
        let build = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"
        return "\(version) (\(build))"
    }

    private func sessionSwatchColor(_ session: SessionResponse) -> Color {
        if let colorKey = session.colorKey,
           let sessionColor = SessionColors.color(forKey: colorKey) {
            return sessionColor.swatchLight
        }
        return Color(.systemGray4)
    }

    private func statisticLabel(count: Int, icon: String) -> some View {
        HStack(spacing: 2) {
            Image(systemName: icon)
            Text("\(count)")
        }
    }

    private func successBanner(_ message: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: "checkmark.circle.fill")
                .foregroundStyle(.white)
                .font(.subheadline)
            Text(message)
                .font(.subheadline)
                .foregroundStyle(.white)
            Spacer()
            Button {
                viewModel.dismissSuccess()
            } label: {
                Image(systemName: "xmark")
                    .font(.caption.bold())
                    .foregroundStyle(.white.opacity(0.8))
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Color.green.opacity(0.9))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .padding(.horizontal)
    }
}

#Preview {
    NavigationStack {
        SettingsView()
    }
}
