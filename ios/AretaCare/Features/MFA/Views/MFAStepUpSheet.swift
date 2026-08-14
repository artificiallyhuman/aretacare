import SwiftUI

/// Re-verification prompt for actions the backend gates behind a fresh MFA proof
/// (removing a factor, regenerating backup codes). Mirrors the web app's
/// `SensitiveActionModal`: pick a method, verify, hand the resulting action token
/// back to the caller, which replays the original request with it.
struct MFAStepUpSheet: View {
    let viewModel: MFAViewModel
    let action: SensitiveMFAAction
    /// Called with the action token once verification succeeds.
    let onVerified: (String) -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var selectedMethod: MFAStepUpMethod?
    @State private var code = ""
    @State private var isVerifying = false
    @State private var errorMessage: String?
    @FocusState private var isCodeFocused: Bool

    private var methods: [MFAStepUpMethod] {
        viewModel.availableStepUpMethods
    }

    var body: some View {
        Form {
            Section {
                Text("To \(action.prompt), verify your identity.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            if let errorMessage {
                Section {
                    ErrorBannerView(message: errorMessage) { self.errorMessage = nil }
                }
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())
            }

            if methods.isEmpty {
                Section {
                    Text("No verification method is available on this account. Add a passkey or authenticator app first.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            } else if let selectedMethod {
                methodSection(for: selectedMethod)

                if methods.count > 1 {
                    Section {
                        Button("Use a different method") {
                            self.selectedMethod = nil
                            code = ""
                            errorMessage = nil
                        }
                        .font(.subheadline)
                    }
                }
            } else {
                Section("Choose a method") {
                    ForEach(methods) { method in
                        Button {
                            select(method)
                        } label: {
                            Label(method.label, systemImage: method.systemImage)
                        }
                    }
                }
            }
        }
        .navigationTitle("Verify Your Identity")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel") {
                    viewModel.cancelStepUp()
                    dismiss()
                }
            }
        }
        .interactiveDismissDisabled(isVerifying)
        .onAppear {
            // One method available: skip the picker entirely.
            if selectedMethod == nil, methods.count == 1, let only = methods.first {
                select(only)
            }
        }
    }

    // MARK: - Method Sections

    @ViewBuilder
    private func methodSection(for method: MFAStepUpMethod) -> some View {
        switch method {
        case .passkey:
            Section {
                Button {
                    Task { await verifyWithPasskey() }
                } label: {
                    HStack {
                        Label(isVerifying ? "Waiting for passkey…" : "Use Passkey", systemImage: "person.badge.key")
                        Spacer()
                        if isVerifying { ProgressView() }
                    }
                }
                .disabled(isVerifying)
            } footer: {
                Text("Use your passkey to confirm it's you.")
            }

        case .totp, .backupCode:
            Section {
                TextField(method == .totp ? "000000" : "XXXXXXXX", text: $code)
                    .font(.system(.title3, design: .monospaced))
                    .multilineTextAlignment(.center)
                    .keyboardType(method == .totp ? .numberPad : .asciiCapable)
                    .textContentType(.oneTimeCode)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                    .focused($isCodeFocused)
                    .disabled(isVerifying)

                Button {
                    Task { await verifyWithCode(method: method) }
                } label: {
                    HStack {
                        Text(isVerifying ? "Verifying…" : "Verify")
                        Spacer()
                        if isVerifying { ProgressView() }
                    }
                }
                .disabled(isVerifying || code.count < method.codeLength)
            } header: {
                Text(method == .totp ? "Authenticator Code" : "Backup Code")
            } footer: {
                Text(method == .totp
                     ? "Enter the 6-digit code from your authenticator app."
                     : "Enter one of the backup codes you saved.")
            }
        }
    }

    // MARK: - Actions

    private func select(_ method: MFAStepUpMethod) {
        selectedMethod = method
        errorMessage = nil
        code = ""
        if method == .passkey {
            Task { await verifyWithPasskey() }
        } else {
            isCodeFocused = true
        }
    }

    private func verifyWithPasskey() async {
        isVerifying = true
        errorMessage = nil
        defer { isVerifying = false }

        do {
            let credential = try await viewModel.passkeyStepUpCredential()
            let token = try await viewModel.verifyForAction(method: .passkey, credential: credential)
            finish(with: token)
        } catch PasskeyError.cancelled {
            // User dismissed the system sheet — leave them on the picker.
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func verifyWithCode(method: MFAStepUpMethod) async {
        isVerifying = true
        errorMessage = nil
        defer { isVerifying = false }

        do {
            let token = try await viewModel.verifyForAction(method: method, code: code)
            finish(with: token)
        } catch {
            errorMessage = error.localizedDescription
            code = ""
        }
    }

    private func finish(with token: String) {
        isCodeFocused = false
        onVerified(token)
        dismiss()
    }
}
