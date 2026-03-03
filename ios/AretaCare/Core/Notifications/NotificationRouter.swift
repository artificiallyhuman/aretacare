import Foundation

@Observable
final class NotificationRouter {
    static let shared = NotificationRouter()

    /// Session ID to navigate to (set on notification tap, consumed by MainTabView).
    var pendingSessionId: String?

    /// Notification type for routing decisions.
    var pendingNotificationType: String?

    private init() {}

    /// Parse notification userInfo and store routing intent.
    func handleNotificationTap(userInfo: [AnyHashable: Any]) {
        let sessionId = userInfo["session_id"] as? String
        let notificationType = userInfo["notification_type"] as? String

        #if DEBUG
        print("[Push] Tap — type: \(notificationType ?? "nil"), session: \(sessionId ?? "nil")")
        #endif

        pendingSessionId = sessionId
        pendingNotificationType = notificationType
    }

    /// Clear the pending route after it has been consumed.
    func clearPendingRoute() {
        pendingSessionId = nil
        pendingNotificationType = nil
    }
}
