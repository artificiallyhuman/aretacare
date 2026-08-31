import Foundation

// MARK: - User

struct UserResponse: Codable, Identifiable, Sendable {
    let id: String
    let name: String
    let email: String
    let isActive: Bool
    let createdAt: Date?
    let lastActiveSessionId: String?
    let pendingEmail: String?
    let hasAiDataSharingConsent: Bool?
}

// MARK: - Login

struct LoginRequest: Codable {
    let email: String
    let password: String
}

struct LoginResponse: Codable {
    let accessToken: String?
    let tokenType: String?
    let user: UserResponse?
    let requiresMfa: Bool?
    let mfaToken: String?
    let mfaMethods: [String]?
    let refreshToken: String?
    let trustedDeviceToken: String?
}

// MARK: - Token

struct TokenResponse: Codable {
    let accessToken: String
    let tokenType: String
    let user: UserResponse
    let refreshToken: String?
}

struct RefreshTokenRequest: Codable {
    let refreshToken: String?
}

// MARK: - Registration

struct UserRegister: Codable {
    let name: String
    let email: String
    let password: String
    let acknowledgeNotMedicalAdvice: Bool
    let acknowledgeHipaa: Bool
    let acknowledgeAiProcessing: Bool
    let agreeToTerms: Bool
    let acknowledgeAgeAndUse: Bool
    let invitationToken: String?
}

struct RegistrationResponse: Codable {
    let message: String
    let email: String
}

struct ResendVerificationRequest: Codable {
    let email: String
}

// MARK: - Account Management

struct UpdateNameRequest: Codable {
    let name: String
    let currentPassword: String
}

struct UpdateEmailRequest: Codable {
    let email: String
    let currentPassword: String
}

struct UpdatePasswordRequest: Codable {
    let currentPassword: String
    let newPassword: String
}

struct DeleteAccountRequest: Codable {
    let password: String
}

/// Reply to an email or password change. The backend revokes every refresh token
/// on both and answers `logout: true`; the client has to end the session itself,
/// otherwise the user keeps browsing on a still-valid access token and is thrown
/// out without explanation whenever it expires.
struct SensitiveChangeResponse: Decodable {
    let message: String?
    let logout: Bool?

    var requiresLogout: Bool { logout ?? false }
}

// MARK: - Password Reset

struct PasswordResetRequestBody: Codable {
    let email: String
}

struct PasswordResetBody: Codable {
    let token: String
    let newPassword: String
}

// MARK: - Session Validity

struct SessionValidResponse: Codable {
    let valid: Bool
}

struct DevicesCountResponse: Codable {
    let count: Int
}

// MARK: - Email Preferences (product-update emails only — never transactional)

struct EmailPreferencesResponse: Codable {
    let productUpdates: Bool
}

struct UpdateEmailPreferencesRequest: Codable {
    let productUpdates: Bool
}

// MARK: - Empty Response (for endpoints with no meaningful body)

struct EmptyResponse: Decodable {}
