import Foundation

// MARK: - MFA Status

struct MFAStatusResponse: Codable {
    let mfaEnabled: Bool
    let preferredMethod: String?
    let enabledAt: String?
    let hasPasskeys: Bool
    let passkeyCount: Int
    let hasTotp: Bool
    let backupCodesRemaining: Int
    let trustedDevicesCount: Int
}

// MARK: - TOTP

struct TOTPSetupResponse: Codable {
    let secret: String
    let provisioningUri: String
}

struct TOTPVerifyRequest: Codable {
    let code: String
}

struct TOTPVerifyResponse: Codable {
    let success: Bool
    let message: String
}

// MARK: - Backup Codes

struct BackupCodesResponse: Codable {
    let codes: [String]
    let count: Int
}

struct BackupCodesCountResponse: Codable {
    let remaining: Int
}

// MARK: - Passkeys

struct PasskeyRegistrationOptionsResponse: Codable {
    let options: [String: AnyCodableValue]
}

struct PasskeyRegistrationVerifyRequest: Codable {
    let credential: [String: AnyCodableValue]
    let deviceName: String
}

struct PasskeyRegistrationVerifyResponse: Codable {
    let success: Bool
    let passkeyId: String?
    let deviceName: String?
}

struct PasskeyInfo: Codable, Identifiable {
    let id: String
    let deviceName: String
    let createdAt: String
    let lastUsedAt: String?
}

struct PasskeyListResponse: Codable {
    let passkeys: [PasskeyInfo]
}

struct PasskeyAuthenticationOptionsResponse: Codable {
    let options: [String: AnyCodableValue]
}

// MARK: - Trusted Devices

struct TrustedDeviceInfo: Codable, Identifiable {
    let id: String
    let deviceName: String?
    let ipAddress: String?
    let trustedUntil: String
    let createdAt: String
    let lastUsedAt: String?
}

struct TrustedDeviceListResponse: Codable {
    let devices: [TrustedDeviceInfo]
}

struct TrustedDeviceRevokeResponse: Codable {
    let success: Bool
    let message: String
    let revokedCount: Int?
}

// MARK: - MFA Management

struct EnableMFARequest: Codable {
    let preferredMethod: String
}

struct EnableMFAResponse: Codable {
    let success: Bool
    let message: String
}

struct DisableMFARequest: Codable {
    let password: String
}

struct DisableMFAResponse: Codable {
    let success: Bool
    let message: String
}

// MARK: - MFA Login Verification

struct MFAVerifyLoginRequest: Codable {
    let mfaToken: String
    let method: String
    let code: String?
    let credential: [String: AnyCodableValue]?
    let trustDevice: Bool

    init(mfaToken: String, method: String, code: String? = nil,
         credential: [String: AnyCodableValue]? = nil, trustDevice: Bool = false) {
        self.mfaToken = mfaToken
        self.method = method
        self.code = code
        self.credential = credential
        self.trustDevice = trustDevice
    }
}

struct MFALoginVerifyResponse: Codable {
    let accessToken: String
    let tokenType: String
    let user: UserResponse
    let refreshToken: String?
    let trustedDeviceToken: String?
}

// MARK: - Sensitive Action Verification

struct VerifyForActionRequest: Codable {
    let method: String
    let code: String?
    let credential: [String: AnyCodableValue]?

    init(method: String, code: String? = nil, credential: [String: AnyCodableValue]? = nil) {
        self.method = method
        self.code = code
        self.credential = credential
    }
}

struct VerifyForActionResponse: Codable {
    let success: Bool
    let actionToken: String?
    let message: String
}

// MARK: - Passkey Login Options

struct MFAPasskeyOptionsRequest: Codable {
    let mfaToken: String
}
