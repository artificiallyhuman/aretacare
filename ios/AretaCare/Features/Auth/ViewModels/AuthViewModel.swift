import Foundation
import SwiftUI

@Observable @MainActor
final class AuthViewModel {
    // MARK: - Fields

    var email = ""
    var password = ""
    var confirmPassword = ""
    var name = ""

    // MARK: - State

    var isLoading = false
    var errorMessage: String?
    var showError = false

    // Login result
    var mfaToken: String?
    var mfaMethods: [String] = []
    var navigateToMFA = false
    var mfaNavigationData: MFANavigationData?

    // Registration
    var registrationSuccess = false
    var invitationToken: String?

    // Consents
    var consentNotMedicalAdvice = false
    var consentHipaa = false
    var consentDataProcessing = false
    var consentTerms = false
    var consentAgeUse = false

    // Signup mode
    var controlSignups = false
    var signupModeChecked = false

    // Password reset
    var passwordResetRequested = false
    var passwordResetSuccess = false
    var resetToken: String?

    // Email verification
    var emailVerificationStatus: VerificationStatus = .pending

    enum VerificationStatus {
        case pending
        case verifying
        case success
        case failed(String)
    }

    private let authManager = AuthManager.shared

    // MARK: - Validation

    var isValidEmail: Bool {
        let pattern = #"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$"#
        return email.range(of: pattern, options: .regularExpression) != nil
    }

    var isValidPassword: Bool {
        password.count >= 8
    }

    var passwordsMatch: Bool {
        password == confirmPassword
    }

    var isValidName: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty
    }

    var allConsentsChecked: Bool {
        consentNotMedicalAdvice && consentHipaa && consentDataProcessing && consentTerms && consentAgeUse
    }

    var canLogin: Bool {
        isValidEmail && !password.isEmpty
    }

    var canRegister: Bool {
        isValidName && isValidEmail && isValidPassword && passwordsMatch && allConsentsChecked
    }

    var canResetPassword: Bool {
        isValidPassword && passwordsMatch
    }

    // MARK: - Signup Mode

    func checkSignupMode() async {
        guard !signupModeChecked else { return }
        do {
            let response: SignupModeResponse = try await APIClient.shared.get(APIEndpoints.Waitlist.signupMode)
            controlSignups = response.controlSignups
            signupModeChecked = true
        } catch {
            // Default to open signups if check fails
            controlSignups = false
            signupModeChecked = true
        }
    }

    var isInvitationOnly: Bool {
        controlSignups && invitationToken == nil
    }

    // MARK: - Login

    func login() async {
        guard canLogin else { return }
        isLoading = true
        clearError()

        do {
            let result = try await authManager.login(
                email: email.trimmingCharacters(in: .whitespaces).lowercased(),
                password: password
            )
            switch result {
            case .success:
                break
            case .mfaRequired(let token, let methods):
                mfaToken = token
                mfaMethods = methods
                navigateToMFA = true
                mfaNavigationData = MFANavigationData(token: token, methods: methods)
            }
        } catch let error as APIError {
            setError(error.errorDescription ?? "Login failed. Please try again.")
        } catch {
            setError("An unexpected error occurred. Please try again.")
        }

        isLoading = false
    }

    // MARK: - Register

    func register() async {
        guard canRegister else { return }
        isLoading = true
        clearError()

        let consents = RegistrationConsents(
            notMedicalAdvice: consentNotMedicalAdvice,
            hipaa: consentHipaa,
            aiProcessing: consentDataProcessing,
            terms: consentTerms,
            ageAndUse: consentAgeUse
        )

        do {
            try await authManager.register(
                name: name.trimmingCharacters(in: .whitespaces),
                email: email.trimmingCharacters(in: .whitespaces).lowercased(),
                password: password,
                consents: consents,
                invitationToken: invitationToken
            )
            registrationSuccess = true
        } catch let error as APIError {
            setError(error.errorDescription ?? "Registration failed. Please try again.")
        } catch {
            setError("An unexpected error occurred. Please try again.")
        }

        isLoading = false
    }

    // MARK: - Password Reset Request

    func requestPasswordReset() async {
        guard isValidEmail else { return }
        isLoading = true
        clearError()

        do {
            let body = PasswordResetRequestBody(email: email.trimmingCharacters(in: .whitespaces).lowercased())
            let _: EmptyResponse = try await APIClient.shared.post(
                APIEndpoints.Auth.passwordResetRequest,
                body: body
            )
        } catch {
            // Silently succeed for anti-enumeration
        }

        passwordResetRequested = true
        isLoading = false
    }

    // MARK: - Password Reset

    func resetPassword(token: String) async {
        guard canResetPassword else { return }
        isLoading = true
        clearError()

        do {
            let body = PasswordResetBody(token: token, newPassword: password)
            let _: EmptyResponse = try await APIClient.shared.post(
                APIEndpoints.Auth.passwordResetReset,
                body: body
            )
            passwordResetSuccess = true
        } catch let error as APIError {
            setError(error.errorDescription ?? "Password reset failed. Please try again.")
        } catch {
            setError("An unexpected error occurred. Please try again.")
        }

        isLoading = false
    }

    // MARK: - Email Verification

    func verifyEmail(token: String) async {
        emailVerificationStatus = .verifying

        do {
            let _: EmptyResponse = try await APIClient.shared.get(
                APIEndpoints.Auth.verifyEmail,
                queryItems: [URLQueryItem(name: "token", value: token)]
            )
            emailVerificationStatus = .success
        } catch let error as APIError {
            emailVerificationStatus = .failed(error.errorDescription ?? "Verification failed.")
        } catch {
            emailVerificationStatus = .failed("An unexpected error occurred.")
        }
    }

    // MARK: - MFA Verification

    func verifyMFA(mfaToken token: String, code: String, method: String, trustDevice: Bool) async {
        isLoading = true
        clearError()

        do {
            try await authManager.verifyMFALogin(
                mfaToken: token,
                code: code,
                method: method,
                trustedDevice: trustDevice
            )
            mfaToken = nil
            navigateToMFA = false
        } catch let error as APIError {
            setError(error.errorDescription ?? "Verification failed. Please try again.")
        } catch {
            setError("An unexpected error occurred. Please try again.")
        }

        isLoading = false
    }

    func verifyMFAWithPasskey(mfaToken token: String, trustDevice: Bool) async {
        isLoading = true
        clearError()

        do {
            // Step 1: Get passkey authentication options from backend
            let optionsRequest = MFAPasskeyOptionsRequest(mfaToken: token)
            let optionsResponse: PasskeyAuthenticationOptionsResponse = try await APIClient.shared.post(
                APIEndpoints.Auth.loginMFAPasskeyOptions,
                body: optionsRequest
            )

            // Step 2: Present system passkey prompt
            let passkeyManager = PasskeyAuthManager()
            let credential = try await passkeyManager.authenticate(options: optionsResponse.options)

            // Step 3: Send credential to backend for verification
            try await authManager.verifyMFALogin(
                mfaToken: token,
                method: "passkey",
                credential: credential,
                trustedDevice: trustDevice
            )
            mfaToken = nil
            navigateToMFA = false
        } catch let error as PasskeyError {
            if case .cancelled = error {
                // User cancelled — don't show error, just stop loading
            } else {
                setError(error.errorDescription ?? "Passkey authentication failed.")
            }
        } catch let error as APIError {
            setError(error.errorDescription ?? "Verification failed. Please try again.")
        } catch {
            setError("An unexpected error occurred. Please try again.")
        }

        isLoading = false
    }

    // MARK: - Helpers

    func clearError() {
        errorMessage = nil
        showError = false
    }

    private func setError(_ message: String) {
        errorMessage = message
        showError = true
    }

    func resetFields() {
        email = ""
        password = ""
        confirmPassword = ""
        name = ""
        consentNotMedicalAdvice = false
        consentHipaa = false
        consentDataProcessing = false
        consentTerms = false
        consentAgeUse = false
        registrationSuccess = false
        passwordResetRequested = false
        passwordResetSuccess = false
    }
}

struct MFANavigationData: Hashable {
    let token: String
    let methods: [String]
}
