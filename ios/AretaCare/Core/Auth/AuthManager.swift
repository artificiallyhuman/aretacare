import Foundation
import SwiftUI

@Observable @MainActor
final class AuthManager {
    static let shared = AuthManager()

    private(set) var isAuthenticated = false
    private(set) var currentUser: UserResponse?
    private(set) var isLoading = true
    private(set) var mfaToken: String?
    private(set) var mfaMethods: [String] = []

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

        do {
            guard let newToken = try await AuthInterceptor.shared.refreshAccessToken() else {
                KeychainManager.shared.clearAll()
                handleLogout()
                isLoading = false
                return
            }
            await AuthInterceptor.shared.setAccessToken(newToken)
            try await fetchCurrentUser()
            isAuthenticated = true
            isLoading = false
            startIdleTimer()
            NotificationManager.shared.requestAuthorization()
            if let userId = currentUser?.id {
                await SubscriptionManager.shared.login(appUserID: userId)
            }
        } catch {
            KeychainManager.shared.clearAll()
            handleLogout()
            isLoading = false
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
            let mfaMethods: [String]?
        }

        let response: LoginResponse = try await APIClient.shared.post(
            APIEndpoints.Auth.login,
            body: LoginRequest(email: email, password: password)
        )

        if response.requiresMfa == true, let mfaToken = response.mfaToken {
            self.mfaToken = mfaToken
            self.mfaMethods = response.mfaMethods ?? []
            return .mfaRequired(mfaToken: mfaToken, methods: self.mfaMethods)
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
        await SubscriptionManager.shared.login(appUserID: user.id)
        return .success
    }

    // MARK: - MFA Verification

    func verifyMFALogin(mfaToken: String, code: String? = nil, method: String? = nil, credential: [String: AnyCodableValue]? = nil, trustedDevice: Bool = false) async throws {
        struct MFAVerifyRequest: Encodable {
            let mfaToken: String
            let code: String?
            let method: String?
            let credential: [String: AnyCodableValue]?
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
                credential: credential,
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
        await SubscriptionManager.shared.login(appUserID: response.user.id)
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

        // Signal logout immediately to dismount views and prevent stale requests.
        // Must happen BEFORE clearing tokens — otherwise views can fire requests
        // with no auth during the gap between token clearing and isAuthenticated
        // becoming false (causes spurious 401/403 errors in server logs).
        handleLogout()

        // Now safe to clear tokens — views are dismounting
        await AuthInterceptor.shared.clearAccessToken()
        KeychainManager.shared.clearAll()

        // Best-effort server call (no auth required for /logout)
        do {
            try await APIClient.shared.post(APIEndpoints.Auth.logout)
        } catch {
            #if DEBUG
            print("[Auth] Server logout failed: \(error)")
            #endif
        }

        await SubscriptionManager.shared.logout()
    }

    /// Force-clear local auth state without server call.
    /// Used by APIClient when token refresh fails or 403 requires logout,
    /// to avoid recursive API calls during logout.
    func forceLogout() async {
        handleLogout()
        await AuthInterceptor.shared.clearAccessToken()
        KeychainManager.shared.clearAll()
        await SubscriptionManager.shared.logout()
    }

    private func handleLogout() {
        isAuthenticated = false
        currentUser = nil
        mfaToken = nil
        mfaMethods = []
        stopIdleTimer()
        BiometricManager.shared.clearLock()
        UserDefaults.standard.removeObject(forKey: "biometricLockEnabled")
        UserDefaults.standard.removeObject(forKey: "lastSessionId")
        UserDefaults.standard.removeObject(forKey: "activeTab")

        // Clear cached data
        ConversationViewModel.clearCache()
        ImageCache.shared.clear()
        NotificationCenter.default.post(name: .userDidLogout, object: nil)
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
            Task { @MainActor in
                // Pause idle timeout while biometric lock is active
                guard !BiometricManager.shared.isLocked else {
                    self.lastActivityDate = Date()
                    return
                }

                let elapsed = Date().timeIntervalSince(self.lastActivityDate)
                if elapsed >= Self.idleTimeoutInterval {
                    await self.logout()
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
    case mfaRequired(mfaToken: String, methods: [String])
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
    /// Posted when sessions are created or deleted outside of SessionViewModel.
    static let sessionsDidChange = Notification.Name("sessionsDidChange")
    /// Posted when a push notification is received while the app is in the foreground.
    static let pushNotificationReceived = Notification.Name("pushNotificationReceived")
}
