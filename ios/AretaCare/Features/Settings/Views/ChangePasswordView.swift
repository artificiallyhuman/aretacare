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

    private var passwordStrength: PasswordStrength {
        PasswordStrength.evaluate(newPassword)
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
                    VStack(alignment: .leading, spacing: 6) {
                        validationRow(
                            label: "At least 8 characters",
                            isValid: newPassword.isEmpty || passwordLongEnough
                        )
                        validationRow(
                            label: "Passwords match",
                            isValid: confirmPassword.isEmpty || passwordsMatch
                        )

                        if !newPassword.isEmpty {
                            HStack(spacing: 4) {
                                ForEach(0..<3, id: \.self) { index in
                                    RoundedRectangle(cornerRadius: 2)
                                        .fill(index < passwordStrength.bars ? passwordStrength.color : Color(.systemGray4))
                                        .frame(height: 4)
                                }
                            }
                            .padding(.top, 4)

                            Text("Strength: \(passwordStrength.label)")
                                .font(.caption2)
                                .foregroundStyle(passwordStrength.color)
                        }
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

// MARK: - Password Strength

private enum PasswordStrength {
    case weak, fair, strong

    var label: String {
        switch self {
        case .weak: "Weak"
        case .fair: "Fair"
        case .strong: "Strong"
        }
    }

    var bars: Int {
        switch self {
        case .weak: 1
        case .fair: 2
        case .strong: 3
        }
    }

    var color: Color {
        switch self {
        case .weak: .red
        case .fair: .orange
        case .strong: .green
        }
    }

    static func evaluate(_ password: String) -> PasswordStrength {
        var score = 0
        if password.count >= 8 { score += 1 }
        if password.count >= 12 { score += 1 }
        if password.range(of: "[A-Z]", options: .regularExpression) != nil { score += 1 }
        if password.range(of: "[a-z]", options: .regularExpression) != nil { score += 1 }
        if password.range(of: "[0-9]", options: .regularExpression) != nil { score += 1 }
        if password.range(of: "[^A-Za-z0-9]", options: .regularExpression) != nil { score += 1 }

        if score <= 2 { return .weak }
        if score <= 4 { return .fair }
        return .strong
    }
}

#Preview {
    ChangePasswordView(viewModel: SettingsViewModel())
}
