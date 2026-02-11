import SwiftUI

struct MFAVerifyView: View {
    let mfaToken: String

    @State private var viewModel = AuthViewModel()
    @State private var selectedMethod: MFAMethod = .totp
    @State private var code = ""
    @State private var backupCode = ""
    @State private var trustDevice = false
    @FocusState private var codeFieldFocused: Bool

    private enum MFAMethod: String, CaseIterable {
        case totp
        case backupCode = "backup_code"

        var displayName: String {
            switch self {
            case .totp: return "Authenticator"
            case .backupCode: return "Backup Code"
            }
        }
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

                    Text("Enter your verification code to continue")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .padding(.top, 24)

                // Error Banner
                if viewModel.showError, let message = viewModel.errorMessage {
                    ErrorBannerView(message: message)
                }

                // Method Picker
                Picker("Method", selection: $selectedMethod) {
                    ForEach(MFAMethod.allCases, id: \.self) { method in
                        Text(method.displayName).tag(method)
                    }
                }
                .pickerStyle(.segmented)

                // Input based on method
                switch selectedMethod {
                case .totp:
                    totpInput
                case .backupCode:
                    backupCodeInput
                }

                // Trust Device Toggle
                Toggle("Trust this device for 30 days", isOn: $trustDevice)
                    .font(.subheadline)
                    .padding(.horizontal, 4)

                // Verify Button
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
            .padding(.horizontal, 24)
            .padding(.bottom, 32)
        }
        .navigationTitle("Verification")
        .navigationBarTitleDisplayMode(.inline)
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

    // MARK: - Logic

    private var canVerify: Bool {
        switch selectedMethod {
        case .totp:
            return code.count == 6
        case .backupCode:
            return !backupCode.trimmingCharacters(in: .whitespaces).isEmpty
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
}

#Preview {
    NavigationStack {
        MFAVerifyView(mfaToken: "preview-token")
    }
}
