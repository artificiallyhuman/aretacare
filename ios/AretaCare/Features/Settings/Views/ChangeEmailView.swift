import SwiftUI

struct ChangeEmailView: View {
    let viewModel: SettingsViewModel

    @Environment(\.dismiss) private var dismiss

    @State private var newEmail: String = ""
    @State private var password: String = ""
    @State private var isSaving = false
    @State private var localError: String?

    private var isValid: Bool {
        let trimmed = newEmail.trimmingCharacters(in: .whitespacesAndNewlines)
        return !trimmed.isEmpty && trimmed.contains("@") && !password.isEmpty
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
                    TextField("New Email", text: $newEmail)
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
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
