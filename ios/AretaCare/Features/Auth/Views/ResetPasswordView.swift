import SwiftUI

struct ResetPasswordView: View {
    let token: String

    @State private var viewModel = AuthViewModel()
    @State private var showPassword = false
    @State private var showConfirmPassword = false
    @Environment(\.dismiss) private var dismiss
    @FocusState private var focusedField: Field?

    private enum Field: Hashable {
        case password, confirmPassword
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                // Header
                AuthHeaderView(compact: true)
                    .padding(.top, 24)

                VStack(spacing: 8) {
                    Text("Set New Password")
                        .font(.title2)
                        .fontWeight(.bold)

                    Text("Enter your new password below.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                if viewModel.passwordResetSuccess {
                    // Success State
                    VStack(spacing: 16) {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 48))
                            .foregroundStyle(.green)

                        Text("Password Reset Successfully")
                            .font(.headline)

                        Text("You can now log in with your new password.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)

                        Button("Return to Login") {
                            dismiss()
                        }
                        .font(.headline)
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.blue)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                } else {
                    // Error Banner
                    if viewModel.showError, let message = viewModel.errorMessage {
                        ErrorBannerView(message: message)
                    }

                    // Password Fields
                    VStack(spacing: 16) {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("New password")
                                .font(.subheadline.weight(.medium))

                            HStack {
                                Group {
                                    if showPassword {
                                        TextField("Min 8 characters", text: $viewModel.password)
                                            .textContentType(.newPassword)
                                    } else {
                                        SecureField("Min 8 characters", text: $viewModel.password)
                                            .textContentType(.newPassword)
                                    }
                                }
                                .focused($focusedField, equals: .password)
                                .submitLabel(.next)
                                .onSubmit { focusedField = .confirmPassword }

                                Button { showPassword.toggle() } label: {
                                    Image(systemName: showPassword ? "eye.slash" : "eye")
                                        .foregroundStyle(.secondary)
                                }
                            }
                            .padding()
                            .background(Color(.secondarySystemBackground))
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                        }

                        VStack(alignment: .leading, spacing: 6) {
                            Text("Confirm new password")
                                .font(.subheadline.weight(.medium))

                            HStack {
                                Group {
                                    if showConfirmPassword {
                                        TextField("Re-enter your password", text: $viewModel.confirmPassword)
                                            .textContentType(.newPassword)
                                    } else {
                                        SecureField("Re-enter your password", text: $viewModel.confirmPassword)
                                            .textContentType(.newPassword)
                                    }
                                }
                                .focused($focusedField, equals: .confirmPassword)
                                .submitLabel(.go)
                                .onSubmit { attemptReset() }

                                Button { showConfirmPassword.toggle() } label: {
                                    Image(systemName: showConfirmPassword ? "eye.slash" : "eye")
                                        .foregroundStyle(.secondary)
                                }
                            }
                            .padding()
                            .background(Color(.secondarySystemBackground))
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                        }

                        if !viewModel.confirmPassword.isEmpty && !viewModel.passwordsMatch {
                            Text("Passwords do not match")
                                .font(.caption)
                                .foregroundStyle(.red)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }

                    // Submit Button
                    Button(action: attemptReset) {
                        ZStack {
                            Text("Reset Password")
                                .opacity(viewModel.isLoading ? 0 : 1)
                            ProgressView()
                                .opacity(viewModel.isLoading ? 1 : 0)
                        }
                        .font(.headline)
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(viewModel.canResetPassword ? Color.blue : Color.gray)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                    .disabled(!viewModel.canResetPassword || viewModel.isLoading)
                }
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 32)
        }
        .navigationTitle("Reset Password")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func attemptReset() {
        focusedField = nil
        Task {
            await viewModel.resetPassword(token: token)
        }
    }
}

#Preview {
    NavigationStack {
        ResetPasswordView(token: "preview-token")
    }
}
