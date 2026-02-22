import SwiftUI

struct LoginView: View {
    @State private var viewModel = AuthViewModel()
    @State private var showPassword = false
    @FocusState private var focusedField: Field?

    private enum Field: Hashable {
        case email, password
    }

    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 0)

            // Medical disclaimer
            MedicalDisclaimerBanner()

            Spacer(minLength: 0)

            // Header
            AuthHeaderView(compact: true)

            Text("A platform for patients and caregivers navigating the healthcare system.")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.top, 4)

            // Error Banner
            if viewModel.showError, let message = viewModel.errorMessage {
                ErrorBannerView(message: message)
                    .padding(.top, 8)
            }

            // Grouped fields card (iOS Settings style)
            VStack(spacing: 0) {
                TextField("Email address", text: $viewModel.email)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .focused($focusedField, equals: .email)
                    .submitLabel(.next)
                    .onSubmit { focusedField = .password }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)

                Divider()
                    .padding(.leading, 16)

                HStack {
                    Group {
                        if showPassword {
                            TextField("Password", text: $viewModel.password)
                                .textContentType(.password)
                        } else {
                            SecureField("Password", text: $viewModel.password)
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
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
            }
            .background(Color(.secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .padding(.top, 16)

            // Forgot Password
            HStack {
                Spacer()
                NavigationLink("Forgot Password?") {
                    ForgotPasswordView()
                }
                .font(.footnote)
            }
            .padding(.top, 6)

            // Log In button (system style)
            Button(action: attemptLogin) {
                if viewModel.isLoading {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                } else {
                    Text("Log In")
                        .frame(maxWidth: .infinity)
                }
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(!viewModel.canLogin || viewModel.isLoading)
            .padding(.top, 14)

            // New to AretaCare?
            HStack {
                Rectangle().fill(Color(.separator)).frame(height: 1)
                Text("New to AretaCare?")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize()
                Rectangle().fill(Color(.separator)).frame(height: 1)
            }
            .padding(.top, 16)

            // Secondary button
            if viewModel.controlSignups {
                NavigationLink {
                    WaitlistView()
                } label: {
                    Text("Join the waitlist")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .controlSize(.large)
                .padding(.top, 10)
            } else {
                NavigationLink {
                    RegisterView()
                } label: {
                    Text("Create a free account")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .controlSize(.large)
                .padding(.top, 10)
            }

            Link("Learn more", destination: AppConstants.aboutURL)
                .font(.body)
                .padding(.top, 8)

            Spacer(minLength: 0)

            // Footer
            HStack(spacing: 4) {
                Link("Terms", destination: AppConstants.termsURL)
                Text("\u{00B7}")
                Link("Privacy", destination: AppConstants.privacyURL)
                Text("\u{00B7}")
                Link("Contact", destination: AppConstants.contactURL)
            }
            .font(.caption)
            .foregroundStyle(.secondary)
            .padding(.bottom, 8)
        }
        .padding(.horizontal, 24)
        .background(Color(.systemGroupedBackground))
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
