import SwiftUI

struct ChangePasswordView: View {
    let viewModel: SettingsViewModel

    @Environment(\.dismiss) private var dismiss

    @State private var currentPassword: String = ""
    @State private var newPassword: String = ""
    @State private var confirmPassword: String = ""
    @State private var isSaving = false
    @State private var localError: String?

    private var passwordsMatch: Bool {
        !confirmPassword.isEmpty && newPassword == confirmPassword
    }

    private var passwordLongEnough: Bool {
        newPassword.count >= 8
    }

    private var isValid: Bool {
        !currentPassword.isEmpty && passwordLongEnough && passwordsMatch
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    SecureField("Current Password", text: $currentPassword)
                        .textContentType(.password)
                }

                Section {
                    SecureField("New Password", text: $newPassword)
                        .textContentType(.newPassword)
                    SecureField("Confirm New Password", text: $confirmPassword)
                        .textContentType(.newPassword)
                } footer: {
                    VStack(alignment: .leading, spacing: 4) {
                        validationRow(
                            label: "At least 8 characters",
                            isValid: newPassword.isEmpty || passwordLongEnough
                        )
                        validationRow(
                            label: "Passwords match",
                            isValid: confirmPassword.isEmpty || passwordsMatch
                        )
                    }
                }

                if let error = localError {
                    Section {
                        Text(error)
                            .font(.caption)
                            .foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("Change Password")
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
        }
    }

    private func validationRow(label: String, isValid: Bool) -> some View {
        HStack(spacing: 4) {
            Image(systemName: isValid ? "checkmark.circle.fill" : "xmark.circle.fill")
                .font(.caption2)
                .foregroundStyle(isValid ? .green : .red)
            Text(label)
                .font(.caption)
                .foregroundStyle(isValid ? Color.secondary : Color.red)
        }
    }

    private func save() async {
        isSaving = true
        localError = nil
        defer { isSaving = false }

        let success = await viewModel.updatePassword(
            currentPassword: currentPassword,
            newPassword: newPassword
        )

        if success {
            dismiss()
        } else {
            localError = viewModel.errorMessage
            viewModel.dismissError()
        }
    }
}

#Preview {
    ChangePasswordView(viewModel: SettingsViewModel())
}
