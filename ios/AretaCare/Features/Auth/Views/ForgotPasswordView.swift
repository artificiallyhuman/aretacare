import SwiftUI

struct ForgotPasswordView: View {
    @State private var viewModel = AuthViewModel()
    @FocusState private var emailFocused: Bool

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                // Header
                AuthHeaderView(compact: true)
                    .padding(.top, 24)

                VStack(spacing: 8) {
                    Text("Reset Password")
                        .font(.title2)
                        .fontWeight(.bold)

                    Text("Enter your email address and we'll send you a link to reset your password.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }

                if viewModel.passwordResetRequested {
                    // Success State
                    VStack(spacing: 16) {
                        Image(systemName: "envelope.circle.fill")
                            .font(.system(size: 48))
                            .foregroundStyle(.green)

                        Text("If an account exists with that email, we've sent a password reset link.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)

                        Text("Check your email and follow the instructions to reset your password.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                } else {
                    // Error Banner
                    if viewModel.showError, let message = viewModel.errorMessage {
                        ErrorBannerView(message: message)
                    }

                    // Email Field
                    TextField("Email", text: $viewModel.email)
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .focused($emailFocused)
                        .submitLabel(.go)
                        .onSubmit { attemptReset() }
                        .tint(.primary)
                        .padding()
                        .background(Color(.secondarySystemBackground))
                        .clipShape(RoundedRectangle(cornerRadius: 10))

                    // Submit Button
                    Button(action: attemptReset) {
                        ZStack {
                            Text("Send Reset Link")
                                .opacity(viewModel.isLoading ? 0 : 1)
                            ProgressView()
                                .opacity(viewModel.isLoading ? 1 : 0)
                        }
                        .font(.headline)
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(viewModel.isValidEmail ? Color.blue : Color.gray)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                    .disabled(!viewModel.isValidEmail || viewModel.isLoading)
                }
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 32)
            .frame(maxWidth: 500)
            .frame(maxWidth: .infinity)
        }
        .navigationTitle("Forgot Password")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { emailFocused = true }
    }

    private func attemptReset() {
        emailFocused = false
        Task {
            await viewModel.requestPasswordReset()
        }
    }
}

#Preview {
    NavigationStack {
        ForgotPasswordView()
    }
}
