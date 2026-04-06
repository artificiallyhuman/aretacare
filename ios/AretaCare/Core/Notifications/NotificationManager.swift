import Foundation
import UIKit

@Observable
final class NotificationManager {
    static let shared = NotificationManager()

    private(set) var isAuthorized = false
    private var currentToken: String?
    private var retryTask: Task<Void, Never>?

    private static let pendingTokenKey = "pendingPushToken"

    private init() {}

    // MARK: - Authorization

    /// Request notification permission and register for remote notifications.
    func requestAuthorization() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { [weak self] granted, error in
            if let error {
                #if DEBUG
                print("[Push] Authorization error: \(error)")
                #endif
                return
            }
            DispatchQueue.main.async {
                self?.isAuthorized = granted
                if granted {
                    UIApplication.shared.registerForRemoteNotifications()
                }
            }
        }
    }

    // MARK: - Token Management

    /// Called by AppDelegate when APNs returns a device token.
    func didRegisterForRemoteNotifications(deviceToken: Data) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        #if DEBUG
        print("[Push] Device token: \(token)")
        #endif

        guard token != currentToken else { return }
        currentToken = token
        registerTokenWithServer(token)
    }

    /// Unregister the device token from the server (called on logout).
    func unregisterToken() async {
        guard let token = currentToken else { return }
        currentToken = nil

        struct UnregisterTokenRequest: Encodable {
            let token: String
            let platform: String
        }

        do {
            try await APIClient.shared.delete(
                APIEndpoints.Notifications.unregisterToken,
                body: UnregisterTokenRequest(token: token, platform: "ios")
            )
        } catch {
            #if DEBUG
            print("[Push] Failed to unregister token: \(error)")
            #endif
        }
    }

    // MARK: - Badge

    /// Clear the app badge count.
    func clearBadge() {
        UNUserNotificationCenter.current().setBadgeCount(0) { error in
            if let error {
                #if DEBUG
                print("[Push] Failed to clear badge: \(error)")
                #endif
            }
        }
    }

    // MARK: - Private

    /// Retry registering any pending token that failed previously.
    /// Call on app foreground to recover from transient failures.
    func retryPendingRegistration() {
        guard let pending = UserDefaults.standard.string(forKey: Self.pendingTokenKey) else { return }
        registerTokenWithServer(pending)
    }

    private func registerTokenWithServer(_ token: String) {
        // Persist token so we can retry on failure or app relaunch
        UserDefaults.standard.set(token, forKey: Self.pendingTokenKey)

        retryTask?.cancel()
        retryTask = Task {
            let delays: [UInt64] = [0, 5, 15, 45, 120, 300] // seconds
            for (attempt, delay) in delays.enumerated() {
                if attempt > 0 {
                    do {
                        try await Task.sleep(for: .seconds(delay))
                    } catch { return } // cancelled
                }
                guard !Task.isCancelled else { return }

                do {
                    struct RegisterTokenRequest: Encodable {
                        let token: String
                        let platform: String
                        let appVersion: String?
                    }
                    let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String
                    let request = RegisterTokenRequest(token: token, platform: "ios", appVersion: version)

                    try await APIClient.shared.post(APIEndpoints.Notifications.registerToken, body: request)
                    // Success — clear pending token
                    UserDefaults.standard.removeObject(forKey: Self.pendingTokenKey)
                    #if DEBUG
                    print("[Push] Token registered with server (attempt \(attempt + 1))")
                    #endif
                    return
                } catch {
                    #if DEBUG
                    print("[Push] Registration attempt \(attempt + 1) failed: \(error)")
                    #endif
                }
            }
            // All retries exhausted — pending token remains in UserDefaults for next foreground retry
        }
    }
}
