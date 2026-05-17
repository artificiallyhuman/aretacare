import SwiftUI
import CoreImage.CIFilterBuiltins

struct MFASetupView: View {
    @State private var viewModel = MFAViewModel()
    @State private var showingDisableConfirm = false
    @State private var disablePassword = ""
    @State private var totpCode = ""
    @State private var showingTOTPSetup = false
    @State private var showingBackupCodes = false
    @State private var showingPasskeySetup = false

    var body: some View {
        List {
            // MFA Status
            Section {
                HStack {
                    Text("Multi-Factor Authentication")
                        .font(.subheadline.weight(.medium))
                    Spacer()
                    Text(viewModel.isMFAEnabled ? "Enabled" : "Disabled")
                        .font(.subheadline)
                        .foregroundStyle(viewModel.isMFAEnabled ? .green : .secondary)
                }

                if viewModel.isMFAEnabled {
                    Button(role: .destructive) {
                        showingDisableConfirm = true
                    } label: {
                        Label("Disable MFA", systemImage: "lock.open")
                    }
                } else {
                    Button {
                        Task { await viewModel.enableMFA() }
                    } label: {
                        Label("Enable MFA", systemImage: "lock.shield")
                    }
                    .disabled(viewModel.isLoading)
                }
            } header: {
                Text("Status")
            } footer: {
                Text("MFA adds an extra layer of security to your account by requiring a second form of verification when signing in.")
            }

            // Messages
            if let error = viewModel.errorMessage {
                Section {
                    ErrorBannerView(message: error) { viewModel.dismissMessages() }
                }
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())
            }

            if let success = viewModel.successMessage {
                Section {
                    HStack {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(.green)
                        Text(success)
                            .font(.subheadline)
                    }
                }
            }

            // TOTP Section
            Section("Authenticator App") {
                if viewModel.mfaStatus?.hasTotp == true {
                    HStack {
                        Label("Authenticator configured", systemImage: "checkmark.circle.fill")
                            .foregroundStyle(.green)
                        Spacer()
                        Button("Remove", role: .destructive) {
                            Task { await viewModel.deleteTOTP() }
                        }
                        .font(.subheadline)
                        .disabled(viewModel.isLoading)
                    }
                } else {
                    Button {
                        Task {
                            await viewModel.setupTOTP()
                            if viewModel.totpSecret != nil {
                                showingTOTPSetup = true
                            }
                        }
                    } label: {
                        Label("Set Up Authenticator App", systemImage: "qrcode")
                    }
                    .disabled(viewModel.isLoading)
                }
            }

            // Passkeys Section
            Section("Passkeys") {
                if viewModel.passkeys.isEmpty {
                    Text("No passkeys registered.")
                        .foregroundStyle(.secondary)
                        .font(.subheadline)
                } else {
                    ForEach(viewModel.passkeys) { passkey in
                        PasskeyRow(passkey: passkey, viewModel: viewModel)
                    }
                }

                Button {
                    showingPasskeySetup = true
                } label: {
                    Label("Register New Passkey", systemImage: "person.badge.key")
                }
            }

            // Backup Codes Section
            Section {
                HStack {
                    Label("Backup Codes", systemImage: "key")
                    Spacer()
                    Text("\(viewModel.backupCodesRemaining) remaining")
                        .font(.subheadline)
                        .foregroundStyle(viewModel.backupCodesRemaining <= 2 ? .red : .secondary)
                }

                Button {
                    Task {
                        await viewModel.generateBackupCodes()
                        if !viewModel.backupCodes.isEmpty {
                            showingBackupCodes = true
                        }
                    }
                } label: {
                    Text(viewModel.backupCodesRemaining > 0 ? "Regenerate Backup Codes" : "Generate Backup Codes")
                }
                .disabled(viewModel.isLoading)
            } header: {
                Text("Backup Codes")
            } footer: {
                Text("Backup codes can be used when you cannot access your authenticator app or passkey. Store them in a safe place.")
            }

            // Trusted Devices Section
            Section("Trusted Devices") {
                if viewModel.trustedDevices.isEmpty {
                    Text("No trusted devices.")
                        .foregroundStyle(.secondary)
                        .font(.subheadline)
                } else {
                    ForEach(viewModel.trustedDevices) { device in
                        TrustedDeviceRow(device: device, viewModel: viewModel)
                    }

                    if viewModel.trustedDevices.count > 1 {
                        Button(role: .destructive) {
                            Task { await viewModel.revokeAllTrustedDevices() }
                        } label: {
                            Label("Revoke All Trusted Devices", systemImage: "xmark.circle")
                        }
                        .disabled(viewModel.isLoading)
                    }
                }
            }

        }
        .listStyle(.insetGrouped)
        .navigationTitle("MFA Setup")
        // Disable MFA
        .alert("Disable MFA", isPresented: $showingDisableConfirm) {
            SecureField("Password", text: $disablePassword)
            Button("Disable", role: .destructive) {
                Task {
                    await viewModel.disableMFA(password: disablePassword)
                    disablePassword = ""
                }
            }
            Button("Cancel", role: .cancel) { disablePassword = "" }
        } message: {
            Text("Enter your password to disable multi-factor authentication.")
        }
        // TOTP Setup sheet
        .sheet(isPresented: $showingTOTPSetup) {
            NavigationStack {
                TOTPSetupSheet(viewModel: viewModel, code: $totpCode)
            }
        }
        // Backup Codes sheet
        .sheet(isPresented: $showingBackupCodes) {
            NavigationStack {
                BackupCodesSheet(codes: viewModel.backupCodes)
            }
        }
        // Passkey Setup sheet
        .sheet(isPresented: $showingPasskeySetup) {
            NavigationStack {
                PasskeySetupSheet(viewModel: viewModel)
            }
        }
        .task {
            await viewModel.fetchStatus()
            await viewModel.listPasskeys()
            await viewModel.listTrustedDevices()
            await viewModel.fetchBackupCodesCount()
        }
    }
}

// MARK: - Passkey Row

private struct PasskeyRow: View {
    let passkey: PasskeyInfo
    let viewModel: MFAViewModel

    @State private var showDeleteConfirmation = false

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(passkey.deviceName)
                    .font(.subheadline.weight(.medium))
                Text("Added \(passkey.createdAt)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                if let lastUsed = passkey.lastUsedAt {
                    Text("Last used \(lastUsed)")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
            }
            Spacer()
            Button {
                showDeleteConfirmation = true
            } label: {
                Image(systemName: "trash")
                    .font(.caption)
                    .foregroundStyle(.red)
            }
            .accessibilityLabel("Delete passkey")
        }
        .swipeActions {
            Button {
                showDeleteConfirmation = true
            } label: {
                Label("Delete", systemImage: "trash")
            }
            .tint(.red)
        }
        .confirmationDialog("Delete Passkey", isPresented: $showDeleteConfirmation, titleVisibility: .visible) {
            Button("Delete", role: .destructive) {
                Task { await viewModel.deletePasskey(id: passkey.id) }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Remove \"\(passkey.deviceName)\" passkey? You cannot undo this.")
        }
    }
}

// MARK: - Trusted Device Row

private struct TrustedDeviceRow: View {
    let device: TrustedDeviceInfo
    let viewModel: MFAViewModel

    @State private var showRevokeConfirmation = false

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(device.deviceName ?? "Unknown Device")
                    .font(.subheadline.weight(.medium))
                if let ip = device.ipAddress {
                    Text("IP: \(ip)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Text("Expires: \(device.trustedUntil)")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
            Spacer()
            Button {
                showRevokeConfirmation = true
            } label: {
                Image(systemName: "xmark.circle")
                    .font(.caption)
                    .foregroundStyle(.red)
            }
            .accessibilityLabel("Revoke device")
        }
        .swipeActions {
            Button {
                showRevokeConfirmation = true
            } label: {
                Label("Revoke", systemImage: "xmark.circle")
            }
            .tint(.red)
        }
        .confirmationDialog("Revoke Trusted Device", isPresented: $showRevokeConfirmation, titleVisibility: .visible) {
            Button("Revoke", role: .destructive) {
                Task { await viewModel.revokeTrustedDevice(id: device.id) }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Revoke \"\(device.deviceName ?? "this device")\"? You will need to verify MFA again on this device.")
        }
    }
}

// MARK: - TOTP Setup Sheet

private struct TOTPSetupSheet: View {
    let viewModel: MFAViewModel
    @Binding var code: String

    @Environment(\.dismiss) private var dismiss
    @State private var isVerifying = false

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                Text("Scan this QR code with your authenticator app (e.g., Google Authenticator, Authy).")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)

                if let uri = viewModel.totpProvisioningUri, let image = generateQRCode(from: uri) {
                    Image(uiImage: image)
                        .interpolation(.none)
                        .resizable()
                        .scaledToFit()
                        .frame(width: 200, height: 200)
                        .padding()
                        .background(Color.white)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }

                if let secret = viewModel.totpSecret {
                    VStack(spacing: 4) {
                        Text("Manual entry key:")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Text(secret)
                            .font(.system(.footnote, design: .monospaced))
                            .textSelection(.enabled)
                    }
                }

                Divider()

                VStack(spacing: 12) {
                    Text("Enter the 6-digit code from your authenticator app:")
                        .font(.subheadline)

                    TextField("000000", text: $code)
                        .keyboardType(.numberPad)
                        .multilineTextAlignment(.center)
                        .font(.title2.monospaced())
                        .frame(maxWidth: 160)
                        .textFieldStyle(.roundedBorder)

                    Button {
                        isVerifying = true
                        Task {
                            let success = await viewModel.verifyTOTPSetup(code: code)
                            isVerifying = false
                            if success {
                                code = ""
                                dismiss()
                            }
                        }
                    } label: {
                        if isVerifying {
                            ProgressView()
                                .frame(maxWidth: .infinity)
                        } else {
                            Text("Verify")
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(code.count != 6 || isVerifying)

                    if let error = viewModel.errorMessage {
                        Text(error)
                            .font(.caption)
                            .foregroundStyle(.red)
                    }
                }
            }
            .padding()
        }
        .navigationTitle("Set Up Authenticator")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel") { dismiss() }
            }
        }
    }

    private func generateQRCode(from string: String) -> UIImage? {
        let context = CIContext()
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(string.utf8)
        filter.correctionLevel = "M"

        guard let outputImage = filter.outputImage else { return nil }
        let scale = 10.0
        let scaledImage = outputImage.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
        guard let cgImage = context.createCGImage(scaledImage, from: scaledImage.extent) else { return nil }
        return UIImage(cgImage: cgImage)
    }
}

// MARK: - Passkey Setup Sheet

private struct PasskeySetupSheet: View {
    let viewModel: MFAViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var deviceName = UIDevice.current.name
    @State private var isRegistering = false

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                Image(systemName: "person.badge.key.fill")
                    .font(.largeTitle)
                    .imageScale(.large)
                    .foregroundStyle(.blue)
                    .accessibilityHidden(true)

                Text("Register a passkey to use Face ID or Touch ID for two-factor authentication.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)

                VStack(alignment: .leading, spacing: 8) {
                    Text("Passkey Name")
                        .font(.subheadline.weight(.medium))

                    TextField("e.g., iPhone, iPad", text: $deviceName)
                        .textFieldStyle(.roundedBorder)
                        .onChange(of: deviceName) { _, newValue in
                            if newValue.count > 100 {
                                deviceName = String(newValue.prefix(100))
                            }
                        }

                    Text("A name to help you identify this passkey later.")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }

                Button {
                    isRegistering = true
                    Task {
                        await viewModel.registerPasskey(deviceName: deviceName.trimmingCharacters(in: .whitespaces))
                        isRegistering = false
                        if viewModel.successMessage != nil {
                            dismiss()
                        }
                    }
                } label: {
                    if isRegistering {
                        ProgressView()
                            .frame(maxWidth: .infinity)
                    } else {
                        Text("Register Passkey")
                            .frame(maxWidth: .infinity)
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(deviceName.trimmingCharacters(in: .whitespaces).isEmpty || isRegistering)

                if let error = viewModel.errorMessage {
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(.red)
                }
            }
            .padding()
        }
        .navigationTitle("Register Passkey")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel") { dismiss() }
            }
        }
    }
}

// MARK: - Backup Codes Sheet

private struct BackupCodesSheet: View {
    let codes: [String]

    @Environment(\.dismiss) private var dismiss
    @State private var confirmed = false
    @State private var showCopiedToast = false

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                Text("Save these backup codes in a safe place. Each code can only be used once.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)

                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                    ForEach(codes, id: \.self) { code in
                        Text(code)
                            .font(.system(.body, design: .monospaced))
                            .padding(.vertical, 8)
                            .frame(maxWidth: .infinity)
                            .background(Color(.systemGray6))
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                }
                .padding(.horizontal)

                Button {
                    ClipboardHelper.copyPlain(codes.joined(separator: "\n"))
                    withAnimation { showCopiedToast = true }
                } label: {
                    Label(
                        showCopiedToast ? "Copied" : "Copy All Codes",
                        systemImage: showCopiedToast ? "checkmark" : "doc.on.doc"
                    )
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .padding(.horizontal)

                // Warning banner
                HStack(alignment: .top, spacing: 10) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundStyle(.orange)

                    Text("Store these codes in a secure location like a password manager. If you lose access to your authenticator and these codes, you may be locked out of your account.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(12)
                .background(
                    RoundedRectangle(cornerRadius: 8)
                        .fill(Color.orange.opacity(0.08))
                )
                .padding(.horizontal)

                // Confirmation checkbox
                Button {
                    confirmed.toggle()
                } label: {
                    HStack(alignment: .top, spacing: 12) {
                        Image(systemName: confirmed ? "checkmark.square.fill" : "square")
                            .foregroundStyle(confirmed ? .blue : .secondary)
                            .font(.title3)

                        Text("I have saved these backup codes in a secure location")
                            .font(.subheadline)
                            .foregroundStyle(.primary)
                            .multilineTextAlignment(.leading)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .padding(.horizontal)
            }
            .padding(.top)
            .padding(.bottom, 32)
        }
        .toast("Codes copied to clipboard", icon: "doc.on.doc", isPresented: $showCopiedToast)
        .navigationTitle("Backup Codes")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("Done") { dismiss() }
                    .disabled(!confirmed)
            }
        }
    }
}
