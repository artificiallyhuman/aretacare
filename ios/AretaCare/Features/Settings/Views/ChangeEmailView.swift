import SwiftUI

struct ChangeEmailView: View {
    let viewModel: SettingsViewModel

    @Environment(\.dismiss) private var dismiss

    @State private var newEmail: String = ""
    @State private var password: String = ""
    @State private var isSaving = false
    @State private var localError: String?

    /// Owned here rather than shared with `MFASetupView` so `availableStepUpMethods`
    /// has a loaded status by the time the step-up sheet appears.
    @State private var mfaViewModel = MFAViewModel()
    @State private var pendingStepUp: SensitiveMFAAction?
    @State private var showReauthNotice = false

    private var isEmailFormatValid: Bool {
        let trimmed = newEmail.trimmingCharacters(in: .whitespacesAndNewlines)
        let pattern = #"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$"#
        return trimmed.range(of: pattern, options: .regularExpression) != nil
    }

    private var isValid: Bool {
        isEmailFormatValid && !password.isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack {
                        Text("Current")
                            .foregroundStyle(.secondary)
                        Spacer()
                        Text(viewModel.user?.email ?? "")
                            .foregroundStyle(.secondary)
                    }
                }

                Section {
                    HStack {
                        TextField("New Email", text: $newEmail)
                            .textContentType(.emailAddress)
                            .keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()

                        if !newEmail.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                            Image(systemName: isEmailFormatValid ? "checkmark.circle.fill" : "xmark.circle.fill")
                                .foregroundStyle(isEmailFormatValid ? .green : .red)
                                .font(.subheadline)
                                .accessibilityLabel(isEmailFormatValid ? "Valid email format" : "Invalid email format")
                        }
                    }
                } footer: {
                    Text("A verification email will be sent to this address. Your email will not change until you verify it.")
                }

                Section {
                    SecureField("Current Password", text: $password)
                        .textContentType(.password)
                } footer: {
                    Text("Required to verify your identity.")
                }

                if let error = localError {
                    Section {
                        Text(error)
                            .font(.caption)
                            .foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("Change Email")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        Task { await save() }
                    }
                    .disabled(!isValid || isSaving)
                }
            }
            .disabled(isSaving)
            // The server refuses this change without a fresh MFA proof. Verify, then
            // replay the save with the action token it hands back.
            .sheet(item: $pendingStepUp) { action in
                NavigationStack {
                    MFAStepUpSheet(viewModel: mfaViewModel, action: action) { actionToken in
                        Task { await save(actionToken: actionToken) }
                    }
                }
            }
            .alert("Check Your New Email", isPresented: $showReauthNotice) {
                Button("Sign In Again") {
                    Task { await viewModel.completeReauthentication() }
                }
            } message: {
                Text("A verification link was sent to \(trimmedEmail). Open it to finish the change. For your security, all devices were signed out — sign in with your current email until then.")
            }
        }
    }

    private var trimmedEmail: String {
        newEmail.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func save(actionToken: String? = nil) async {
        isSaving = true
        localError = nil
        defer { isSaving = false }

        let success = await viewModel.updateEmail(
            newEmail: trimmedEmail,
            password: password,
            actionToken: actionToken
        )

        if success {
            if viewModel.requiresReauthentication {
                showReauthNotice = true
            } else {
                dismiss()
            }
        } else if viewModel.mfaStepUpRequired {
            viewModel.clearMFAStepUpRequirement()
            await presentStepUp()
        } else {
            localError = viewModel.errorMessage
            viewModel.dismissError()
        }
    }

    /// `availableStepUpMethods` is empty until the status is loaded, which would
    /// leave the sheet on its "no verification method" dead end.
    private func presentStepUp() async {
        if mfaViewModel.mfaStatus == nil {
            await mfaViewModel.fetchStatus()
        }
        pendingStepUp = .changeEmail
    }
}

#Preview {
    ChangeEmailView(viewModel: SettingsViewModel())
}
