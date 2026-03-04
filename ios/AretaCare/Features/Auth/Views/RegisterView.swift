import SwiftUI

struct RegisterView: View {
    @State private var viewModel = AuthViewModel()
    @State private var showPassword = false
    @State private var showConfirmPassword = false
    @FocusState private var focusedField: Field?
    @Environment(\.dismiss) private var dismiss

    var invitationToken: String?

    private enum Field: Hashable {
        case name, email, password, confirmPassword
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                // Header
                AuthHeaderView()
                    .padding(.top, 16)

                // Invitation Notice
                if invitationToken != nil {
                    invitationBanner
                }

                // Waitlist mode message
                if viewModel.signupModeChecked && viewModel.isInvitationOnly {
                    waitlistMessage
                } else if viewModel.registrationSuccess {
                    successMessage
                } else {
                    registrationForm
                }

                // Already have an account divider
                if !viewModel.registrationSuccess {
                    HStack {
                        Rectangle().fill(Color(.separator)).frame(height: 1)
                        Text("Already have an account?")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .fixedSize()
                        Rectangle().fill(Color(.separator)).frame(height: 1)
                    }

                    Button("Sign in to your account") {
                        dismiss()
                    }
                    .font(.subheadline.weight(.medium))

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
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 32)
        }
        .navigationTitle("Sign Up")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            viewModel.invitationToken = invitationToken
            await viewModel.checkSignupMode()
        }
    }

    // MARK: - Invitation Banner

    private var invitationBanner: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "envelope.fill")
                .foregroundStyle(.blue)
                .font(.body)

            Text("You've been invited to join a session on AretaCare. Create your account to get started.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 8)
                .fill(Color.blue.opacity(0.08))
        )
        .overlay(alignment: .leading) {
            RoundedRectangle(cornerRadius: 8)
                .fill(Color.blue)
                .frame(width: 4)
        }
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    // MARK: - Waitlist Message

    private var waitlistMessage: some View {
        VStack(spacing: 16) {
            Image(systemName: "clock.badge.checkmark")
                .font(.system(size: 48))
                .foregroundStyle(.blue)
                .padding(.top, 16)

            Text("Registration is by invitation only")
                .font(.headline)

            Text("AretaCare is currently available by invitation. Join the waitlist to be notified when a spot opens up.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            NavigationLink("Join Waitlist") {
                WaitlistView()
            }
            .font(.headline)
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding()
            .background(Color.blue)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .padding(.top, 8)
        }
    }

    // MARK: - Success Message

    private var successMessage: some View {
        VStack(spacing: 16) {
            Image(systemName: "envelope.badge.shield.half.filled")
                .font(.system(size: 48))
                .foregroundStyle(.green)
                .padding(.top, 16)

            Text("Check your email")
                .font(.headline)

            Text("We've sent a verification link to your email address. Please verify your account to get started.")
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
            .padding(.top, 8)
        }
    }

    // MARK: - Registration Form

    private var registrationForm: some View {
        VStack(spacing: 24) {
            // Error Banner
            if viewModel.showError, let message = viewModel.errorMessage {
                ErrorBannerView(message: message)
            }

            // Fields
            VStack(spacing: 16) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Full name")
                        .font(.subheadline.weight(.medium))

                    TextField("Your full name", text: $viewModel.name)
                        .textContentType(.name)
                        .textInputAutocapitalization(.words)
                        .focused($focusedField, equals: .name)
                        .submitLabel(.next)
                        .onSubmit { focusedField = .email }
                        .padding()
                        .background(Color(.secondarySystemBackground))
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                }

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

                VStack(alignment: .leading, spacing: 6) {
                    Text("Password")
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
                    Text("Confirm password")
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
                        .submitLabel(.done)
                        .onSubmit { focusedField = nil }

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

            // Consents
            VStack(spacing: 12) {
                Text("Acknowledgments")
                    .font(.headline)
                    .frame(maxWidth: .infinity, alignment: .leading)

                ConsentCheckbox(
                    isChecked: $viewModel.consentNotMedicalAdvice,
                    text: "I understand that AretaCare is not a medical professional and does not provide medical advice, diagnosis, or treatment. I will consult qualified healthcare professionals for medical decisions and emergencies."
                )

                ConsentCheckbox(
                    isChecked: $viewModel.consentHipaa,
                    text: "I understand that AretaCare is a consumer tool, not a HIPAA-covered service, and is not a medical record system. I will not rely on it as my sole repository for critical health information."
                )

                LinkedConsentCheckbox(
                    isChecked: $viewModel.consentDataProcessing,
                    markdown: "I consent to the collection, storage, and processing of my information as described in the [Privacy Policy](\(AppConstants.privacyURL)), including processing by AI systems to help organize, summarize, and interpret content."
                )

                LinkedConsentCheckbox(
                    isChecked: $viewModel.consentTerms,
                    markdown: "I agree to the [Terms of Service](\(AppConstants.termsURL)) and [Privacy Policy](\(AppConstants.privacyURL))."
                )

                ConsentCheckbox(
                    isChecked: $viewModel.consentAgeUse,
                    text: "I am at least 18 years old, reside in the United States, and will use AretaCare only for lawful, personal purposes within the United States."
                )
            }

            // Register Button
            Button(action: attemptRegister) {
                ZStack {
                    Text("Create Account")
                        .opacity(viewModel.isLoading ? 0 : 1)
                    ProgressView()
                        .opacity(viewModel.isLoading ? 1 : 0)
                }
                .font(.headline)
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .padding()
                .background(viewModel.canRegister ? Color.blue : Color.gray)
                .clipShape(RoundedRectangle(cornerRadius: 10))
            }
            .disabled(!viewModel.canRegister || viewModel.isLoading)
        }
    }

    private func attemptRegister() {
        focusedField = nil
        Task {
            await viewModel.register()
        }
    }
}

// MARK: - Consent Checkbox

struct ConsentCheckbox: View {
    @Binding var isChecked: Bool
    let text: String

    var body: some View {
        Button {
            isChecked.toggle()
        } label: {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: isChecked ? "checkmark.square.fill" : "square")
                    .foregroundStyle(isChecked ? .blue : .secondary)
                    .font(.title3)

                Text(text)
                    .font(.subheadline)
                    .foregroundStyle(.primary)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// Consent checkbox with inline tappable links (markdown). The checkbox icon
/// toggles the binding; links in the text open in the browser.
struct LinkedConsentCheckbox: View {
    @Binding var isChecked: Bool
    let markdown: String

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: isChecked ? "checkmark.square.fill" : "square")
                .foregroundStyle(isChecked ? .blue : .secondary)
                .font(.title3)
                .onTapGesture { isChecked.toggle() }

            Group {
                if let attributed = try? AttributedString(markdown: markdown) {
                    Text(attributed)
                } else {
                    Text(markdown)
                }
            }
            .font(.subheadline)
            .foregroundStyle(.primary)
            .multilineTextAlignment(.leading)
            .fixedSize(horizontal: false, vertical: true)
            .tint(Color.accentColor)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

#Preview {
    NavigationStack {
        RegisterView()
    }
}
