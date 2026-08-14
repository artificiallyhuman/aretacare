import Foundation
import Observation

/// Actions the backend gates behind a fresh MFA verification (`X-MFA-Action-Token`).
/// Removing a factor — or minting ten new backup codes — weakens the account, so a
/// stolen access token alone must not be enough to do it. The same gate covers the
/// account-level changes in Settings: taking over the login email, the password, or
/// deleting everything.
enum SensitiveMFAAction: Identifiable, Equatable {
    case removeAuthenticatorApp
    case removePasskey(id: String)
    case regenerateBackupCodes
    case changeEmail
    case changePassword
    case deleteAccount

    var id: String {
        switch self {
        case .removeAuthenticatorApp: return "totp"
        case .removePasskey(let id): return "passkey-\(id)"
        case .regenerateBackupCodes: return "backup-codes"
        case .changeEmail: return "change-email"
        case .changePassword: return "change-password"
        case .deleteAccount: return "delete-account"
        }
    }

    /// Completes the sentence "To …, verify your identity."
    var prompt: String {
        switch self {
        case .removeAuthenticatorApp: return "remove your authenticator app"
        case .removePasskey: return "remove this passkey"
        case .regenerateBackupCodes: return "generate new backup codes"
        case .changeEmail: return "change your email address"
        case .changePassword: return "change your password"
        case .deleteAccount: return "delete your account"
        }
    }
}

@Observable @MainActor
final class MFAViewModel {
    private(set) var mfaStatus: MFAStatusResponse?
    private(set) var passkeys: [PasskeyInfo] = []
    private(set) var trustedDevices: [TrustedDeviceInfo] = []
    private(set) var backupCodes: [String] = []
    private(set) var backupCodesRemaining = 0
    private(set) var isLoading = false
    private(set) var errorMessage: String?
    private(set) var successMessage: String?

    /// Non-nil when the server demanded MFA step-up for an action the user just
    /// asked for. The view presents `MFAStepUpSheet`; on success the action is
    /// replayed with the resulting action token.
    var pendingStepUp: SensitiveMFAAction?

    // TOTP setup state
    private(set) var totpSecret: String?
    private(set) var totpProvisioningUri: String?

    var isMFAEnabled: Bool {
        mfaStatus?.mfaEnabled ?? false
    }

    // MARK: - Fetch Status

    func fetchStatus() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            let status: MFAStatusResponse = try await APIClient.shared.get(APIEndpoints.MFA.status)
            mfaStatus = status
            backupCodesRemaining = status.backupCodesRemaining
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Enable / Disable MFA

    func enableMFA() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        // Pick preferred method based on what's configured
        let method: String
        if mfaStatus?.hasPasskeys == true {
            method = "passkey"
        } else if mfaStatus?.hasTotp == true {
            method = "totp"
        } else {
            errorMessage = "Please configure at least one MFA method first."
            return
        }

        do {
            let request = EnableMFARequest(preferredMethod: method)
            let response: EnableMFAResponse = try await APIClient.shared.post(
                APIEndpoints.MFA.enableMFA,
                body: request
            )
            successMessage = response.message
            await fetchStatus()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func disableMFA(password: String) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            let request = DisableMFARequest(password: password)
            let response: DisableMFAResponse = try await APIClient.shared.post(
                APIEndpoints.MFA.disableMFA,
                body: request
            )
            successMessage = response.message
            await fetchStatus()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - TOTP

    func setupTOTP() async {
        errorMessage = nil

        do {
            let response: TOTPSetupResponse = try await APIClient.shared.post(
                APIEndpoints.MFA.totpSetup
            )
            totpSecret = response.secret
            totpProvisioningUri = response.provisioningUri
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func verifyTOTPSetup(code: String) async -> Bool {
        errorMessage = nil

        do {
            let request = TOTPVerifyRequest(code: code)
            let response: TOTPVerifyResponse = try await APIClient.shared.post(
                APIEndpoints.MFA.totpVerifySetup,
                body: request
            )
            if response.success {
                successMessage = response.message
                totpSecret = nil
                totpProvisioningUri = nil
                await fetchStatus()
                return true
            } else {
                errorMessage = response.message
                return false
            }
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func deleteTOTP(actionToken: String? = nil) async {
        errorMessage = nil

        do {
            try await APIClient.shared.delete(
                APIEndpoints.MFA.totpDelete,
                headers: Self.actionTokenHeader(actionToken)
            )
            successMessage = "Authenticator app removed."
            await fetchStatus()
        } catch {
            handleSensitiveActionFailure(error, action: .removeAuthenticatorApp)
        }
    }

    // MARK: - Backup Codes

    func generateBackupCodes(actionToken: String? = nil) async {
        errorMessage = nil
        isLoading = true

        do {
            let response: BackupCodesResponse = try await APIClient.shared.post(
                APIEndpoints.MFA.generateBackupCodes,
                headers: Self.actionTokenHeader(actionToken)
            )
            backupCodes = response.codes
            backupCodesRemaining = response.count
        } catch {
            handleSensitiveActionFailure(error, action: .regenerateBackupCodes)
        }

        isLoading = false
    }

    func fetchBackupCodesCount() async {
        do {
            let response: BackupCodesCountResponse = try await APIClient.shared.get(
                APIEndpoints.MFA.backupCodesCount
            )
            backupCodesRemaining = response.remaining
        } catch {
            // Non-fatal
        }
    }

    // MARK: - Passkeys

    func listPasskeys() async {
        do {
            let response: PasskeyListResponse = try await APIClient.shared.get(
                APIEndpoints.MFA.passkeys
            )
            passkeys = response.passkeys
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func registerPasskey(deviceName: String) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            // Step 1: Get registration options from server
            let optionsResponse: PasskeyRegistrationOptionsResponse = try await APIClient.shared.post(
                APIEndpoints.MFA.passkeyRegisterOptions
            )

            // Step 2: Perform platform WebAuthn registration ceremony
            let credential = try await PasskeyAuthManager().register(options: optionsResponse.options)

            // Step 3: Verify with server
            let verifyRequest = PasskeyRegistrationVerifyRequest(
                credential: credential,
                deviceName: deviceName
            )
            let response: PasskeyRegistrationVerifyResponse = try await APIClient.shared.post(
                APIEndpoints.MFA.passkeyRegisterVerify,
                body: verifyRequest
            )

            if response.success {
                successMessage = "Passkey registered successfully."
                await listPasskeys()
                await fetchStatus()
            } else {
                errorMessage = "Failed to register passkey. Please try again."
            }
        } catch PasskeyError.cancelled {
            // User cancelled — don't show error
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func deletePasskey(id: String, actionToken: String? = nil) async {
        errorMessage = nil

        do {
            try await APIClient.shared.delete(
                APIEndpoints.MFA.deletePasskey(id),
                headers: Self.actionTokenHeader(actionToken)
            )
            passkeys.removeAll { $0.id == id }
            successMessage = "Passkey removed."
            await fetchStatus()
        } catch {
            handleSensitiveActionFailure(error, action: .removePasskey(id: id))
        }
    }

    // MARK: - Trusted Devices

    func listTrustedDevices() async {
        do {
            let response: TrustedDeviceListResponse = try await APIClient.shared.get(
                APIEndpoints.MFA.trustedDevices
            )
            trustedDevices = response.devices
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func revokeTrustedDevice(id: String) async {
        errorMessage = nil

        do {
            let _: TrustedDeviceRevokeResponse = try await APIClient.shared.delete(
                APIEndpoints.MFA.revokeTrustedDevice(id)
            )
            trustedDevices.removeAll { $0.id == id }
            await fetchStatus()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func revokeAllTrustedDevices() async {
        errorMessage = nil

        do {
            let response: TrustedDeviceRevokeResponse = try await APIClient.shared.delete(
                APIEndpoints.MFA.trustedDevices
            )
            trustedDevices.removeAll()
            successMessage = response.message
            await fetchStatus()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Sensitive Action Step-Up

    /// Methods the user can verify with right now, in the order the UI offers them.
    var availableStepUpMethods: [MFAStepUpMethod] {
        guard let status = mfaStatus else { return [] }
        var methods: [MFAStepUpMethod] = []
        if status.hasPasskeys { methods.append(.passkey) }
        if status.hasTotp { methods.append(.totp) }
        if status.backupCodesRemaining > 0 { methods.append(.backupCode) }
        return methods
    }

    /// Exchanges a fresh MFA proof for a short-lived action token.
    func verifyForAction(
        method: MFAStepUpMethod,
        code: String? = nil,
        credential: [String: AnyCodableValue]? = nil
    ) async throws -> String {
        let request = VerifyForActionRequest(method: method.rawValue, code: code, credential: credential)
        let response: VerifyForActionResponse = try await APIClient.shared.post(
            APIEndpoints.MFA.verifyForAction,
            body: request
        )
        guard response.success, let token = response.actionToken else {
            throw APIError.validationError(message: response.message)
        }
        return token
    }

    /// Runs the WebAuthn assertion used to satisfy step-up with a passkey.
    func passkeyStepUpCredential() async throws -> [String: AnyCodableValue] {
        let optionsResponse: PasskeyAuthenticationOptionsResponse = try await APIClient.shared.post(
            APIEndpoints.MFA.passkeyAuthOptions
        )
        return try await PasskeyAuthManager().authenticate(options: optionsResponse.options)
    }

    /// Replays the action the server rejected, this time carrying the action token.
    /// The action is passed in rather than read from `pendingStepUp`, which the
    /// sheet's own dismissal has already cleared by the time this runs.
    func completeStepUp(_ action: SensitiveMFAAction, actionToken: String) async {
        pendingStepUp = nil

        switch action {
        case .removeAuthenticatorApp:
            await deleteTOTP(actionToken: actionToken)
        case .removePasskey(let id):
            await deletePasskey(id: id, actionToken: actionToken)
        case .regenerateBackupCodes:
            await generateBackupCodes(actionToken: actionToken)
        case .changeEmail, .changePassword, .deleteAccount:
            // Owned by Settings, which drives the sheet itself and replays via its
            // own `onVerified` closure — this view model never sees those requests.
            break
        }
    }

    func cancelStepUp() {
        pendingStepUp = nil
    }

    private static func actionTokenHeader(_ token: String?) -> [String: String]? {
        guard let token else { return nil }
        return [AppConstants.mfaActionTokenHeader: token]
    }

    /// Routes a failed sensitive action: a step-up demand opens the verification
    /// sheet, anything else (notably the 400 refusing to remove the last factor)
    /// goes to the error banner so the user sees what to do instead.
    private func handleSensitiveActionFailure(_ error: Error, action: SensitiveMFAAction) {
        if case APIError.forbidden(let code) = error,
           code == "MFA_REQUIRED" || code == "MFA_INVALID" {
            pendingStepUp = action
            return
        }
        errorMessage = error.localizedDescription
    }

    func dismissMessages() {
        errorMessage = nil
        successMessage = nil
    }
}

/// The three ways a user can prove identity for a step-up. Raw values are the
/// `method` strings the backend's `/mfa/verify-for-action` expects.
enum MFAStepUpMethod: String, Identifiable, CaseIterable {
    case passkey
    case totp
    case backupCode = "backup_code"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .passkey: return "Passkey"
        case .totp: return "Authenticator App"
        case .backupCode: return "Backup Code"
        }
    }

    var systemImage: String {
        switch self {
        case .passkey: return "person.badge.key"
        case .totp: return "qrcode"
        case .backupCode: return "key"
        }
    }

    var codeLength: Int {
        self == .totp ? 6 : 8
    }
}
