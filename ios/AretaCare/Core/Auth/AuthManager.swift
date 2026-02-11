import Foundation
import SwiftUI

@Observable
final class AuthManager {
    static let shared = AuthManager()

    private(set) var isAuthenticated = false
    private(set) var currentUser: UserResponse?
    private(set) var isLoading = true
    private(set) var mfaToken: String?

    // Idle timeout
    private var lastActivityDate = Date()
    private var idleTimer: Timer?
    private(set) var showIdleWarning = false

    private static let idleTimeoutInterval: TimeInterval = 30 * 60     // 30 minutes
    private static let idleWarningInterval: TimeInterval = 29 * 60     // 1 min before timeout

    private init() {}

    // MARK: - App Launch

    func initAuth() async {
        isLoading = true
        defer { isLoading = false }

        do {
            guard let newToken = try await AuthInterceptor.shared.refreshAccessToken() else {
                // Refresh returned nil (e.g. server rejected token) —
                // clear Keychain so stale tokens don't persist across launches.
                KeychainManager.shared.clearAll()
                await handleLogout()
                return
            }
            await AuthInterceptor.shared.setAccessToken(newToken)
            try await fetchCurrentUser()
            isAuthenticated = true
            startIdleTimer()
            NotificationManager.shared.requestAuthorization()
        } catch {
            // Network error or other failure — clear Keychain so stale
            // tokens don't cause repeated failures on every app launch.
            KeychainManager.shared.clearAll()
            await handleLogout()
        }
    }

    // MARK: - Login

    func login(email: String, password: String) async throws -> LoginResult {
        struct LoginRequest: Encodable {
            let email: String
            let password: String
        }
        struct LoginResponse: Decodable {
            let accessToken: String?
            let refreshToken: String?
            let user: UserResponse?
            let requiresMfa: Bool?
            let mfaToken: String?
        }

        let response: LoginResponse = try await APIClient.shared.post(
            APIEndpoints.Auth.login,
            body: LoginRequest(email: email, password: password)
        )

        if response.requiresMfa == true, let mfaToken = response.mfaToken {
            self.mfaToken = mfaToken
            return .mfaRequired(mfaToken: mfaToken)
        }

        guard let accessToken = response.accessToken, let user = response.user else {
            throw APIError.noData
        }
        await AuthInterceptor.shared.setAccessToken(accessToken)
        if let refreshToken = response.refreshToken {
            KeychainManager.shared.refreshToken = refreshToken
        }
        currentUser = user
        isAuthenticated = true
        startIdleTimer()
        NotificationManager.shared.requestAuthorization()
        return .success
    }

    // MARK: - MFA Verification

    func verifyMFALogin(mfaToken: String, code: String? = nil, method: String? = nil, trustedDevice: Bool = false) async throws {
        struct MFAVerifyRequest: Encodable {
            let mfaToken: String
            let code: String?
            let method: String?
            let trustDevice: Bool?
        }
        struct MFAVerifyResponse: Decodable {
            let accessToken: String
            let refreshToken: String?
            let user: UserResponse
            let trustedDeviceToken: String?
        }

        let response: MFAVerifyResponse = try await APIClient.shared.post(
            APIEndpoints.Auth.loginMFAVerify,
            body: MFAVerifyRequest(
                mfaToken: mfaToken,
                code: code,
                method: method,
                trustDevice: trustedDevice ? true : nil
            )
        )

        await AuthInterceptor.shared.setAccessToken(response.accessToken)
        if let refreshToken = response.refreshToken {
            KeychainManager.shared.refreshToken = refreshToken
        }
        if let trustedDeviceToken = response.trustedDeviceToken {
            KeychainManager.shared.trustedDeviceToken = trustedDeviceToken
        }
        currentUser = response.user
        isAuthenticated = true
        self.mfaToken = nil
        startIdleTimer()
        NotificationManager.shared.requestAuthorization()
    }

    // MARK: - Register

    func register(name: String, email: String, password: String, consents: RegistrationConsents, invitationToken: String? = nil) async throws {
        struct RegisterRequest: Encodable {
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

        let _: EmptyResponse = try await APIClient.shared.post(
            APIEndpoints.Auth.register,
            body: RegisterRequest(
                name: name,
                email: email,
                password: password,
                acknowledgeNotMedicalAdvice: consents.notMedicalAdvice,
                acknowledgeHipaa: consents.hipaa,
                acknowledgeAiProcessing: consents.aiProcessing,
                agreeToTerms: consents.terms,
                acknowledgeAgeAndUse: consents.ageAndUse,
                invitationToken: invitationToken
            )
        )
    }

    // MARK: - Logout

    func logout() async {
        // Unregister push token before clearing auth
        await NotificationManager.shared.unregisterToken()

        // Clear tokens immediately
        await AuthInterceptor.shared.clearAccessToken()
        KeychainManager.shared.clearAll()

        // Best-effort server call
        do {
            try await APIClient.shared.post(APIEndpoints.Auth.logout)
        } catch {
            #if DEBUG
            print("[Auth] Server logout failed: \(error)")
            #endif
        }

        await handleLogout()
    }

    /// Force-clear local auth state without server call.
    /// Used by APIClient when token refresh fails or 403 requires logout,
    /// to avoid recursive API calls during logout.
    func forceLogout() async {
        await AuthInterceptor.shared.clearAccessToken()
        KeychainManager.shared.clearAll()
        await handleLogout()
    }

    private func handleLogout() async {
        await MainActor.run {
            isAuthenticated = false
            currentUser = nil
            mfaToken = nil
            stopIdleTimer()
            BiometricManager.shared.clearLock()
            UserDefaults.standard.removeObject(forKey: "biometricLockEnabled")
            UserDefaults.standard.removeObject(forKey: "lastSessionId")
            UserDefaults.standard.removeObject(forKey: "activeTab")

            // Clear cached data
            ConversationViewModel.clearCache()
            NotificationCenter.default.post(name: .userDidLogout, object: nil)
        }
    }

    // MARK: - User

    func fetchCurrentUser() async throws {
        let user: UserResponse = try await APIClient.shared.get(APIEndpoints.Auth.me)
        currentUser = user
    }

    // MARK: - Idle Timeout

    func recordActivity() {
        lastActivityDate = Date()
        showIdleWarning = false
    }

    private func startIdleTimer() {
        stopIdleTimer()
        idleTimer = Timer.scheduledTimer(withTimeInterval: 15, repeats: true) { [weak self] _ in
            guard let self else { return }
            DispatchQueue.main.async {
                // Pause idle timeout while biometric lock is active
                guard !BiometricManager.shared.isLocked else {
                    self.lastActivityDate = Date()
                    return
                }

                let elapsed = Date().timeIntervalSince(self.lastActivityDate)
                if elapsed >= Self.idleTimeoutInterval {
                    Task { await self.logout() }
                } else if elapsed >= Self.idleWarningInterval {
                    self.showIdleWarning = true
                }
            }
        }
    }

    private func stopIdleTimer() {
        idleTimer?.invalidate()
        idleTimer = nil
        showIdleWarning = false
    }
}

// MARK: - Supporting Types

enum LoginResult {
    case success
    case mfaRequired(mfaToken: String)
}

struct RegistrationConsents {
    let notMedicalAdvice: Bool
    let hipaa: Bool
    let aiProcessing: Bool
    let terms: Bool
    let ageAndUse: Bool
}

extension Notification.Name {
    /// Posted when the user logs out. Caches should observe this to clear sensitive data.
    static let userDidLogout = Notification.Name("userDidLogout")
}
