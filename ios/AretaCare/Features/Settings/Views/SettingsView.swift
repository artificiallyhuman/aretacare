import SwiftUI

struct SettingsView: View {
    @State private var viewModel = SettingsViewModel()
    @State private var subscriptionManager = SubscriptionManager.shared

    @Environment(\.openURL) private var openURL
    @AppStorage("biometricLockEnabled") private var biometricLockEnabled = false
    @State private var showChangeName = false
    @State private var showChangeEmail = false
    @State private var showChangePassword = false
    @State private var showLogoutEverywhereConfirmation = false
    @State private var showDeleteAccountSheet = false
    @State private var deleteConfirmationText = ""
    @State private var deletePassword = ""
    @State private var isDeletingAccount = false

    // Session management (detail view handles rename/color/delete)

    var body: some View {
        Form {
            accountSection
            securitySection
            sessionsSection
            supportSection
            dangerZoneSection
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
        .sheet(isPresented: $showDeleteAccountSheet) {
            deleteAccountSheet
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
                    .accessibilityHidden(true)
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
                    .accessibilityHidden(true)
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
                    .accessibilityHidden(true)
            }
            .contentShape(Rectangle())
            .onTapGesture { showChangePassword = true }

            // Subscription
            NavigationLink {
                SubscriptionView()
            } label: {
                HStack {
                    Label("Subscription", systemImage: "creditcard")
                    Spacer()
                    Text(subscriptionManager.currentPlanDescription)
                        .foregroundStyle(.secondary)
                }
            }
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
                VStack(alignment: .leading, spacing: 4) {
                    Toggle(isOn: $biometricLockEnabled) {
                        Label(biometricLockLabel, systemImage: biometricLockIcon)
                    }
                    if biometricLockEnabled {
                        Text("Disables automatic logout after inactivity.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .padding(.leading, 36)
                    }
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
            .confirmationDialog("Log Out Everywhere", isPresented: $showLogoutEverywhereConfirmation, titleVisibility: .visible) {
                Button("Log Out All Devices", role: .destructive) {
                    Task {
                        guard !viewModel.isLoading else { return }
                        await viewModel.logoutEverywhere()
                    }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("This will log you out of all devices and sessions, including this one.")
            }
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

    // MARK: - Session Management

    private var sessionsSection: some View {
        Group {
            Section {
                if viewModel.sessions.filter(\.isOwner).isEmpty {
                    Text("No care sessions")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(viewModel.sessions.filter(\.isOwner)) { session in
                        sessionRow(session)
                    }
                }
            } header: {
                Text("Your Care Sessions (\(viewModel.sessions.filter(\.isOwner).count) of \(AppConstants.maxOwnedSessions))")
            }

            if !viewModel.sessions.filter({ !$0.isOwner }).isEmpty {
                Section("Shared with You (\(viewModel.sessions.filter { !$0.isOwner }.count))") {
                    ForEach(viewModel.sessions.filter { !$0.isOwner }) { session in
                        sessionRow(session)
                    }
                }
            }
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
                    .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: 2) {
                    Text(session.name)
                        .lineLimit(1)

                    if let stats = viewModel.sessionStatistics[session.id] {
                        HStack(spacing: 8) {
                            statisticLabel(count: stats.conversations, icon: "bubble.left")
                            statisticLabel(count: stats.journalEntries, icon: "book")
                            statisticLabel(count: stats.documents, icon: "doc")
                            statisticLabel(count: stats.audioRecordings, icon: "mic")
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
                showDeleteAccountSheet = true
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

    // MARK: - Support Section

    private var supportSection: some View {
        Section("Support") {
            HStack {
                Image(systemName: "info.circle")
                    .foregroundStyle(Color.accentColor)
                Text("About AretaCare")
            }
            .onTapGesture { openURL(AppConstants.aboutURL) }

            HStack {
                Image(systemName: "doc.text")
                    .foregroundStyle(Color.accentColor)
                Text("Terms of Service")
            }
            .onTapGesture { openURL(AppConstants.termsURL) }

            HStack {
                Image(systemName: "hand.raised")
                    .foregroundStyle(Color.accentColor)
                Text("Privacy Policy")
            }
            .onTapGesture { openURL(AppConstants.privacyURL) }

            NavigationLink {
                FeedbackView()
            } label: {
                Label("Contact Us", systemImage: "envelope")
            }

            HStack {
                Label("Version", systemImage: "app.badge")
                Spacer()
                Text(appVersion)
                    .foregroundStyle(.secondary)
            }
        }
    }

    // MARK: - Delete Account Sheet

    private var deleteAccountSheet: some View {
        NavigationStack {
            ScrollView {
            VStack(spacing: 24) {
                // Warning header
                VStack(spacing: 12) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.system(size: 40))
                        .foregroundStyle(.red)

                    Text("Delete Account")
                        .font(.title2.weight(.bold))

                    Text("This action is permanent and cannot be undone.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
                .padding(.top, 8)

                VStack(alignment: .leading, spacing: 16) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Type \"delete my account\" to confirm")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        TextField("delete my account", text: $deleteConfirmationText)
                            .textFieldStyle(.roundedBorder)
                            .autocorrectionDisabled()
                            .textInputAutocapitalization(.never)
                    }

                    VStack(alignment: .leading, spacing: 6) {
                        Text("Enter your password")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        SecureField("Password", text: $deletePassword)
                            .textFieldStyle(.roundedBorder)
                    }
                }

                Button(role: .destructive) {
                    Task {
                        isDeletingAccount = true
                        _ = await viewModel.deleteAccount(password: deletePassword)
                        isDeletingAccount = false
                        deleteConfirmationText = ""
                        deletePassword = ""
                        showDeleteAccountSheet = false
                    }
                } label: {
                    if isDeletingAccount {
                        ProgressView()
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                    } else {
                        Text("Delete My Account")
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                    }
                }
                .buttonStyle(.borderedProminent)
                .tint(.red)
                .disabled(
                    deleteConfirmationText.lowercased() != "delete my account"
                    || deletePassword.isEmpty
                    || isDeletingAccount
                )
            }
            .padding()
            }
            .scrollDismissesKeyboard(.interactively)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        deleteConfirmationText = ""
                        deletePassword = ""
                        showDeleteAccountSheet = false
                    }
                }
            }
        }
        .presentationDetents([.medium])
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
