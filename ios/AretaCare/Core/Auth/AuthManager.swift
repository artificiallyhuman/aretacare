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
    private(set) var hasAcceptedAIDataSharing = false

    /// Set when launch-time session restore failed for a transient reason. The
    /// stored refresh token is still intact, so the login screen offers a retry
    /// instead of pretending the user was signed out.
    private(set) var startupErrorMessage: String?

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
        startupErrorMessage = nil

        let outcome = (try? await AuthInterceptor.shared.refreshAccessToken()) ?? .transient

        switch outcome {
        case .rejected:
            // No stored token, or the server rejected it — a real logged-out state.
            KeychainManager.shared.clearAll()
            handleLogout()
            isLoading = false
            return
        case .transient:
            // Couldn't reach the server (offline launch, backend 5xx). Keep the
            // refresh token — wiping it here would destroy the trusted-device
            // token and force a fresh MFA challenge for a temporary outage.
            // Deliberately not `handleLogout()`: this isn't a logout, and that
            // path clears the cold-launch biometric lock and the remembered
            // care session. Nothing is authenticated yet, so there is no
            // session state to tear down.
            isAuthenticated = false
            startupErrorMessage = APIError.sessionRefreshUnavailable.localizedDescription
            isLoading = false
            return
        case .success(let newToken):
            await AuthInterceptor.shared.setAccessToken(newToken)
        }

        do {
            try await fetchCurrentUser()
            isAuthenticated = true
            isLoading = false
            startIdleTimer()
            NotificationManager.shared.requestAuthorization()
            if let userId = currentUser?.id {
                await SubscriptionManager.shared.login(appUserID: userId)
            }
        } catch let error as APIError where error.requiresLogout {
            KeychainManager.shared.clearAll()
            handleLogout()
            isLoading = false
        } catch {
            // The refresh succeeded, so the session is valid — only the profile
            // fetch failed. Don't destroy credentials (or the cold-launch
            // biometric lock) over it; offer the retry instead.
            isAuthenticated = false
            startupErrorMessage = error.localizedDescription
            isLoading = false
        }
    }

    /// Retries the launch-time session restore after a transient failure.
    func retryInitAuth() async {
        await initAuth()
    }

    /// True when a refresh token is still on the device — the session may just
    /// be unreachable rather than over.
    var hasStoredSession: Bool {
        KeychainManager.shared.refreshToken != nil
    }

    /// Dismisses the offline/retry state and falls through to the login screen.
    func dismissStartupError() {
        startupErrorMessage = nil
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

        startupErrorMessage = nil

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
        hasAcceptedAIDataSharing = user.hasAiDataSharingConsent ?? false
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
        hasAcceptedAIDataSharing = response.user.hasAiDataSharingConsent ?? false
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

    // MARK: - AI Data Sharing Consent

    func acceptAIDataSharing() async throws {
        let _: EmptyResponse = try await APIClient.shared.post(APIEndpoints.Auth.consentAIDataSharing)
        hasAcceptedAIDataSharing = true
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

        // Biometric lock preference is a per-user setting, so it is cleared on
        // explicit logout only. It must survive handleLogout()'s other call
        // sites (forceLogout, initAuth failure) — a transient network error
        // must not silently disable the lock.
        UserDefaults.standard.removeObject(forKey: "biometricLockEnabled")

        // Now safe to clear tokens — views are dismounting.
        startupErrorMessage = nil
        await AuthInterceptor.shared.clearAccessToken()

        // The refresh token has to be read before the Keychain is wiped and
        // handed to the server, otherwise it stays valid for its full 7-day
        // life: iOS holds it in the Keychain and never sends the HttpOnly
        // cookie the endpoint used to rely on. `defer` keeps the local wipe
        // unconditional — a failed request must never leave the token behind.
        let refreshToken = KeychainManager.shared.refreshToken
        defer { KeychainManager.shared.clearAll() }

        // Best-effort server call (no auth required for /logout)
        do {
            struct LogoutRequest: Encodable {
                let refreshToken: String?
            }
            try await APIClient.shared.post(
                APIEndpoints.Auth.logout,
                body: LogoutRequest(refreshToken: refreshToken)
            )
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
        hasAcceptedAIDataSharing = false
        stopIdleTimer()
        BiometricManager.shared.clearLock()
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
        hasAcceptedAIDataSharing = user.hasAiDataSharingConsent ?? false
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
                // Skip idle timeout entirely when biometric lock is enabled
                // (biometric re-auth + 7-day token expiry provide sufficient security)
                // Also pause while biometric lock screen is actively showing
                guard !BiometricManager.shared.isBiometricLockEnabled,
                      !BiometricManager.shared.isLocked else {
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
    /// Posted when the server reports the user no longer has access to a care
    /// session (owner revoked sharing). Not a logout — the session list reloads.
    static let sessionAccessRevoked = Notification.Name("sessionAccessRevoked")
    /// Posted when a push notification is received while the app is in the foreground.
    static let pushNotificationReceived = Notification.Name("pushNotificationReceived")
}
