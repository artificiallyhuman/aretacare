import SwiftUI

struct LoginView: View {
    @State private var viewModel = AuthViewModel()
    @State private var showPassword = false
    @FocusState private var focusedField: Field?

    private enum Field: Hashable {
        case email, password
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                // Header
                AuthHeaderView()
                    .padding(.top, 40)

                // Medical Disclaimer
                MedicalDisclaimerBanner()

                // Error Banner
                if viewModel.showError, let message = viewModel.errorMessage {
                    ErrorBannerView(message: message)
                }

                // Form
                VStack(spacing: 16) {
                    // Email Field
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Email address")
                            .font(.subheadline.weight(.medium))

                        TextField("your@email.com", text: $viewModel.email)
                            .textContentType(.emailAddress)
                            .keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .focused($focusedField, equals: .email)
                            .submitLabel(.next)
                            .onSubmit { focusedField = .password }
                            .tint(.primary)
                            .padding()
                            .background(Color(.secondarySystemBackground))
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                    }

                    // Password Field
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text("Password")
                                .font(.subheadline.weight(.medium))
                            Spacer()
                            NavigationLink("Forgot Password?") {
                                ForgotPasswordView()
                            }
                            .font(.subheadline)
                        }

                        HStack {
                            Group {
                                if showPassword {
                                    TextField("Enter your password", text: $viewModel.password)
                                        .textContentType(.password)
                                } else {
                                    SecureField("Enter your password", text: $viewModel.password)
                                        .textContentType(.password)
                                }
                            }
                            .focused($focusedField, equals: .password)
                            .submitLabel(.go)
                            .onSubmit { attemptLogin() }

                            Button { showPassword.toggle() } label: {
                                Image(systemName: showPassword ? "eye.slash" : "eye")
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .padding()
                        .background(Color(.secondarySystemBackground))
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                }

                // Login Button
                Button(action: attemptLogin) {
                    ZStack {
                        Text("Log In")
                            .opacity(viewModel.isLoading ? 0 : 1)
                        ProgressView()
                            .opacity(viewModel.isLoading ? 1 : 0)
                    }
                    .font(.headline)
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(viewModel.canLogin ? Color.blue : Color.gray)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                }
                .disabled(!viewModel.canLogin || viewModel.isLoading)

                // Divider
                HStack {
                    Rectangle().fill(Color(.separator)).frame(height: 1)
                    Text("New to AretaCare?")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize()
                    Rectangle().fill(Color(.separator)).frame(height: 1)
                }

                // Sign Up / Waitlist Links
                VStack(spacing: 12) {
                    NavigationLink {
                        RegisterView()
                    } label: {
                        Text("Create a free account")
                            .font(.subheadline.weight(.medium))
                    }

                    if viewModel.controlSignups {
                        NavigationLink {
                            WaitlistView()
                        } label: {
                            Text("Join the waitlist")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                // Terms & Privacy
                HStack(spacing: 4) {
                    Link("Terms of Service", destination: AppConstants.termsURL)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text("\u{00B7}")
                        .foregroundStyle(.secondary)
                    Link("Privacy Policy", destination: AppConstants.privacyURL)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 32)
        }
        .task { await viewModel.checkSignupMode() }
        .navigationBarBackButtonHidden(true)
        .navigationDestination(item: $viewModel.mfaNavigationData) { data in
            MFAVerifyView(mfaToken: data.token, mfaMethods: data.methods)
        }
    }

    private func attemptLogin() {
        focusedField = nil
        Task {
            await viewModel.login()
        }
    }
}

#Preview {
    NavigationStack {
        LoginView()
    }
}
