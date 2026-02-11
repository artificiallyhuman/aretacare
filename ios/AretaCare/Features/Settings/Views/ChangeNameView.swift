import SwiftUI

struct ChangeNameView: View {
    let viewModel: SettingsViewModel

    @Environment(\.dismiss) private var dismiss

    @State private var name: String = ""
    @State private var password: String = ""
    @State private var isSaving = false
    @State private var localError: String?

    private var isValid: Bool {
        !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !password.isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Name", text: $name)
                        .textContentType(.name)
                        .textInputAutocapitalization(.words)
                        .autocorrectionDisabled()
                } footer: {
                    Text("Your name as displayed in the app and to session collaborators.")
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
            .navigationTitle("Change Name")
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
            .onAppear {
                name = viewModel.user?.name ?? ""
            }
        }
    }

    private func save() async {
        isSaving = true
        localError = nil
        defer { isSaving = false }

        let success = await viewModel.updateName(
            name: name.trimmingCharacters(in: .whitespacesAndNewlines),
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
    ChangeNameView(viewModel: SettingsViewModel())
}
