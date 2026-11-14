import Sentry
import UIKit
import UserNotifications

class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        startSentry()
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    /// Crash/error reporting. Skipped when no DSN is configured (simulator
    /// without Secrets.xcconfig). PHI is on screen throughout the app, so
    /// screenshots and view hierarchy are never attached, and request query
    /// strings are scrubbed from breadcrumbs, spans and events.
    private func startSentry() {
        guard let dsn = AppConstants.sentryDSN else { return }
        SentrySDK.start { options in
            options.dsn = dsn
            options.environment = AppConstants.sentryEnvironment
            options.sendDefaultPii = false
            options.tracesSampleRate = 0.1
            options.attachScreenshot = false
            options.attachViewHierarchy = false
            // Query strings and fragments carry presigned S3 signatures, verification tokens
            // and search text (which can be health terms). The SDK strips them from "url"
            // but copies them into separate fields on network breadcrumbs ("http.query",
            // "http.fragment"), network spans (same keys) and failed-request events
            // (request.queryString / fragment). Scrub all three; keep scheme://host/path.
            options.beforeBreadcrumb = { crumb in
                if crumb.type == "http" {
                    crumb.setData(value: nil, key: "http.query")
                    crumb.setData(value: nil, key: "http.fragment")
                    if let url = crumb.data?["url"] as? String {
                        crumb.setData(value: Self.withoutQuery(url), key: "url")
                    }
                }
                return crumb
            }
            options.beforeSendSpan = { span in
                span.removeData(key: "http.query")
                span.removeData(key: "http.fragment")
                return span
            }
            options.beforeSend = { event in
                if let request = event.request {
                    request.queryString = nil
                    request.fragment = nil
                    if let url = request.url {
                        request.url = Self.withoutQuery(url)
                    }
                }
                return event
            }
        }
    }

    /// scheme://host/path of a URL string, without its query or fragment.
    nonisolated private static func withoutQuery(_ url: String) -> String {
        guard let cut = url.firstIndex(where: { $0 == "?" || $0 == "#" }) else { return url }
        return String(url[..<cut])
    }

    // MARK: - Remote Notification Registration

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationManager.shared.didRegisterForRemoteNotifications(deviceToken: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        #if DEBUG
        print("[Push] Failed to register for remote notifications: \(error)")
        #endif
    }

    // MARK: - UNUserNotificationCenterDelegate

    /// Show banner + sound even when the app is in the foreground.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound, .badge])

        // Notify in-app observers so they can refresh state (e.g. digest badge).
        let userInfo = notification.request.content.userInfo
        NotificationCenter.default.post(name: .pushNotificationReceived, object: nil, userInfo: userInfo)
    }

    /// Handle notification tap — route to the relevant session/tab.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let userInfo = response.notification.request.content.userInfo
        NotificationRouter.shared.handleNotificationTap(userInfo: userInfo)
        completionHandler()
    }
}
