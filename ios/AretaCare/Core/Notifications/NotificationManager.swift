import Foundation
import UIKit

@Observable
final class NotificationManager {
    static let shared = NotificationManager()

    private(set) var isAuthorized = false
    private var currentToken: String?

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
        currentToken = nil
        do {
            try await APIClient.shared.delete(APIEndpoints.Notifications.unregisterToken)
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

    private func registerTokenWithServer(_ token: String) {
        struct RegisterTokenRequest: Encodable {
            let token: String
            let platform: String
            let appVersion: String?
        }

        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String
        let request = RegisterTokenRequest(token: token, platform: "ios", appVersion: version)

        Task {
            do {
                try await APIClient.shared.post(APIEndpoints.Notifications.registerToken, body: request)
                #if DEBUG
                print("[Push] Token registered with server")
                #endif
            } catch {
                #if DEBUG
                print("[Push] Failed to register token: \(error)")
                #endif
            }
        }
    }
}
