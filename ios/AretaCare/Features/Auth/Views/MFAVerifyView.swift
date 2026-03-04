import SwiftUI

struct MFAVerifyView: View {
    let mfaToken: String
    let mfaMethods: [String]

    @State private var viewModel = AuthViewModel()
    @State private var selectedMethod: MFAMethod?
    @State private var code = ""
    @State private var backupCode = ""
    @State private var trustDevice = false
    @FocusState private var codeFieldFocused: Bool

    init(mfaToken: String, mfaMethods: [String] = []) {
        self.mfaToken = mfaToken
        self.mfaMethods = mfaMethods
    }

    private enum MFAMethod: String {
        case passkey
        case totp
        case backupCode = "backup_code"

        var displayName: String {
            switch self {
            case .passkey: return "Passkey"
            case .totp: return "Authenticator"
            case .backupCode: return "Backup Code"
            }
        }

        var iconName: String {
            switch self {
            case .passkey: return "person.badge.key.fill"
            case .totp: return "lock.app.dashed"
            case .backupCode: return "key"
            }
        }

        init?(rawMethod: String) {
            self.init(rawValue: rawMethod)
        }
    }

    /// Methods available based on backend response, preserving order.
    private var availableMethods: [MFAMethod] {
        let methods = mfaMethods.compactMap { MFAMethod(rawMethod: $0) }
        if methods.isEmpty {
            // Fallback if backend didn't send methods
            return [.totp, .backupCode]
        }
        return methods
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                // Header
                VStack(spacing: 8) {
                    Image(systemName: "lock.shield")
                        .font(.system(size: 48))
                        .foregroundStyle(.blue)

                    Text("Two-Factor Authentication")
                        .font(.title2)
                        .fontWeight(.bold)

                    Text(selectedMethod == nil
                         ? "Choose a verification method"
                         : "Verify your identity to continue")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .padding(.top, 24)

                // Error Banner
                if viewModel.showError, let message = viewModel.errorMessage {
                    ErrorBannerView(message: message)
                }

                // Trust Device Toggle
                Toggle("Trust this device for 30 days", isOn: $trustDevice)
                    .font(.subheadline)
                    .padding(.horizontal, 4)

                // Method selection or input
                if selectedMethod == nil {
                    methodSelection
                } else {
                    methodInput
                }
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 32)
            .frame(maxWidth: 500)
            .frame(maxWidth: .infinity)
        }
        .navigationTitle("Verification")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            let methods = availableMethods
            if methods.count == 1 {
                selectMethod(methods[0])
            }
        }
        .onChange(of: code) { _, newValue in
            // Auto-submit when 6 digits entered
            let filtered = newValue.filter(\.isNumber)
            if filtered.count > 6 {
                code = String(filtered.prefix(6))
            } else {
                code = filtered
            }
            if code.count == 6 {
                attemptVerify()
            }
        }
    }

    // MARK: - Method Selection

    private var methodSelection: some View {
        VStack(spacing: 12) {
            ForEach(availableMethods, id: \.rawValue) { method in
                Button {
                    selectMethod(method)
                } label: {
                    HStack(spacing: 14) {
                        Image(systemName: method.iconName)
                            .font(.title3)
                            .foregroundStyle(.blue)
                            .frame(width: 32)

                        VStack(alignment: .leading, spacing: 2) {
                            Text(method.displayName)
                                .font(.subheadline.weight(.medium))
                                .foregroundStyle(.primary)
                            Text(methodDescription(method))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }

                        Spacer()

                        Image(systemName: "chevron.right")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.tertiary)
                    }
                    .padding()
                    .background(Color(.secondarySystemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                }
            }
        }
    }

    // MARK: - Method Input

    @ViewBuilder
    private var methodInput: some View {
        switch selectedMethod {
        case .passkey:
            passkeyInput
        case .totp:
            totpInput

            verifyButton
        case .backupCode:
            backupCodeInput

            verifyButton
        case nil:
            EmptyView()
        }

        // Back to method selection (when multiple methods available)
        if availableMethods.count > 1 {
            Button {
                selectedMethod = nil
                viewModel.clearError()
                code = ""
                backupCode = ""
            } label: {
                Text("Use a different method")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
    }

    // MARK: - Passkey Input

    private var passkeyInput: some View {
        VStack(spacing: 16) {
            Image(systemName: "person.badge.key.fill")
                .font(.system(size: 40))
                .foregroundStyle(.blue)

            if viewModel.isLoading {
                ProgressView()
                    .controlSize(.large)
                Text("Waiting for passkey...")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            } else {
                Text("Use your passkey to verify your identity.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)

                Button(action: attemptPasskey) {
                    Text("Use Passkey")
                        .font(.headline)
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.blue)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                }
            }
        }
        .padding(.vertical, 8)
    }

    // MARK: - TOTP Input

    private var totpInput: some View {
        VStack(spacing: 8) {
            TextField("6-digit code", text: $code)
                .keyboardType(.numberPad)
                .textContentType(.oneTimeCode)
                .multilineTextAlignment(.center)
                .font(.title2.monospacedDigit())
                .focused($codeFieldFocused)
                .padding()
                .background(Color(.secondarySystemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 10))

            Text("Enter the code from your authenticator app")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .onAppear { codeFieldFocused = true }
    }

    // MARK: - Backup Code Input

    private var backupCodeInput: some View {
        VStack(spacing: 8) {
            TextField("Backup code", text: $backupCode)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .font(.body.monospaced())
                .padding()
                .background(Color(.secondarySystemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 10))

            Text("Enter one of your backup codes")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    // MARK: - Verify Button

    private var verifyButton: some View {
        Button(action: attemptVerify) {
            ZStack {
                Text("Verify")
                    .opacity(viewModel.isLoading ? 0 : 1)
                ProgressView()
                    .opacity(viewModel.isLoading ? 1 : 0)
            }
            .font(.headline)
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding()
            .background(canVerify ? Color.blue : Color.gray)
            .clipShape(RoundedRectangle(cornerRadius: 10))
        }
        .disabled(!canVerify || viewModel.isLoading)
    }

    // MARK: - Logic

    private var canVerify: Bool {
        switch selectedMethod {
        case .totp:
            return code.count == 6
        case .backupCode:
            return !backupCode.trimmingCharacters(in: .whitespaces).isEmpty
        case .passkey, nil:
            return false
        }
    }

    private func selectMethod(_ method: MFAMethod) {
        selectedMethod = method
        viewModel.clearError()
        if method == .passkey {
            attemptPasskey()
        }
    }

    private func attemptPasskey() {
        Task {
            await viewModel.verifyMFAWithPasskey(
                mfaToken: mfaToken,
                trustDevice: trustDevice
            )
        }
    }

    private func attemptVerify() {
        guard canVerify else { return }
        codeFieldFocused = false

        let verifyCode: String
        let method: String

        switch selectedMethod {
        case .totp:
            verifyCode = code
            method = "totp"
        case .backupCode:
            verifyCode = backupCode.trimmingCharacters(in: .whitespaces)
            method = "backup_code"
        default:
            return
        }

        Task {
            await viewModel.verifyMFA(
                mfaToken: mfaToken,
                code: verifyCode,
                method: method,
                trustDevice: trustDevice
            )
        }
    }

    private func methodDescription(_ method: MFAMethod) -> String {
        switch method {
        case .passkey:
            return "Use Face ID, Touch ID, or your device passkey"
        case .totp:
            return "Enter a code from your authenticator app"
        case .backupCode:
            return "Use a one-time backup code"
        }
    }
}

#Preview {
    NavigationStack {
        MFAVerifyView(mfaToken: "preview-token", mfaMethods: ["passkey", "totp", "backup_code"])
    }
}
