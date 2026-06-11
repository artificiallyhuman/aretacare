import Foundation

@Observable
final class NotificationRouter {
    static let shared = NotificationRouter()

    /// Session ID to navigate to (set on notification tap, consumed by MainTabView).
    var pendingSessionId: String?

    /// Notification type for routing decisions.
    var pendingNotificationType: String?

    /// Notification types the app knows how to route (mirrors the backend
    /// NotificationType enum). Unknown types are ignored.
    private static let allowedTypes: Set<String> = [
        "new_message", "session_shared", "daily_digest_ready"
    ]

    private init() {}

    /// Parse notification userInfo and store routing intent.
    /// Payload fields are validated before use so an unexpected payload can't
    /// drive navigation to an invalid state.
    func handleNotificationTap(userInfo: [AnyHashable: Any]) {
        let rawType = userInfo["notification_type"] as? String
        let rawSessionId = userInfo["session_id"] as? String

        #if DEBUG
        print("[Push] Tap — type: \(rawType ?? "nil"), session: \(rawSessionId ?? "nil")")
        #endif

        guard let notificationType = rawType,
              Self.allowedTypes.contains(notificationType) else {
            return
        }

        // session_id is optional (e.g. session_shared has none), but when
        // present it must be a valid session UUID.
        var validatedSessionId: String?
        if let rawSessionId {
            guard UUID(uuidString: rawSessionId) != nil else { return }
            validatedSessionId = rawSessionId
        }

        pendingNotificationType = notificationType
        pendingSessionId = validatedSessionId
    }

    /// Clear the pending route after it has been consumed.
    func clearPendingRoute() {
        pendingSessionId = nil
        pendingNotificationType = nil
    }
}
