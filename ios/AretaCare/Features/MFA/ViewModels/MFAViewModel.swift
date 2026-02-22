import Foundation
import Observation

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

    func enableMFA(method: String = "totp") async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

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

    func deleteTOTP() async {
        errorMessage = nil

        do {
            try await APIClient.shared.delete(APIEndpoints.MFA.totpDelete)
            successMessage = "Authenticator app removed."
            await fetchStatus()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Backup Codes

    func generateBackupCodes() async {
        errorMessage = nil

        do {
            let response: BackupCodesResponse = try await APIClient.shared.post(
                APIEndpoints.MFA.generateBackupCodes
            )
            backupCodes = response.codes
            backupCodesRemaining = response.count
        } catch {
            errorMessage = error.localizedDescription
        }
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

    func deletePasskey(id: String) async {
        errorMessage = nil

        do {
            try await APIClient.shared.delete(APIEndpoints.MFA.deletePasskey(id))
            passkeys.removeAll { $0.id == id }
            successMessage = "Passkey removed."
            await fetchStatus()
        } catch {
            errorMessage = error.localizedDescription
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

    func dismissMessages() {
        errorMessage = nil
        successMessage = nil
    }
}
