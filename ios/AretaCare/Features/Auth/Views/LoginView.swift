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

                Text("A platform for patients and caregivers navigating the healthcare system.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)

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

                // Sign Up / Waitlist / Learn More
                VStack(spacing: 10) {
                    if viewModel.controlSignups {
                        NavigationLink {
                            WaitlistView()
                        } label: {
                            Text("Join the waitlist")
                                .font(.subheadline.weight(.semibold))
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 12)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 10)
                                        .strokeBorder(Color(.separator), lineWidth: 1)
                                )
                        }
                    } else {
                        NavigationLink {
                            RegisterView()
                        } label: {
                            Text("Create a free account")
                                .font(.subheadline.weight(.semibold))
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 12)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 10)
                                        .strokeBorder(Color(.separator), lineWidth: 1)
                                )
                        }
                    }

                    Link(destination: AppConstants.aboutURL) {
                        Text("Learn more")
                            .font(.subheadline.weight(.semibold))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .overlay(
                                RoundedRectangle(cornerRadius: 10)
                                    .strokeBorder(Color(.separator), lineWidth: 1)
                            )
                    }
                }

                // Terms, Privacy & Contact
                HStack(spacing: 4) {
                    Link("Terms of Service", destination: AppConstants.termsURL)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text("\u{00B7}")
                        .foregroundStyle(.secondary)
                    Link("Privacy Policy", destination: AppConstants.privacyURL)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text("\u{00B7}")
                        .foregroundStyle(.secondary)
                    Link("Contact Us", destination: AppConstants.contactURL)
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
