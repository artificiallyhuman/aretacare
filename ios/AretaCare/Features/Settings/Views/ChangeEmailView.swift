import SwiftUI

struct ChangeEmailView: View {
    let viewModel: SettingsViewModel

    @Environment(\.dismiss) private var dismiss

    @State private var newEmail: String = ""
    @State private var password: String = ""
    @State private var isSaving = false
    @State private var localError: String?

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
        }
    }

    private func save() async {
        isSaving = true
        localError = nil
        defer { isSaving = false }

        let success = await viewModel.updateEmail(
            newEmail: newEmail.trimmingCharacters(in: .whitespacesAndNewlines),
            password: password
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
    ChangeEmailView(viewModel: SettingsViewModel())
}
