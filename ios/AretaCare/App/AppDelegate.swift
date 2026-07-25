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
    /// screenshots and view hierarchy are never attached, and network
    /// breadcrumb URLs are stripped of query strings.
    private func startSentry() {
        guard let dsn = AppConstants.sentryDSN else { return }
        SentrySDK.start { options in
            options.dsn = dsn
            options.environment = AppConstants.sentryEnvironment
            options.sendDefaultPii = false
            options.tracesSampleRate = 0.1
            options.attachScreenshot = false
            options.attachViewHierarchy = false
            options.beforeBreadcrumb = { crumb in
                // Presigned S3 links and reset/verify tokens live in query
                // strings — keep scheme://host/path only.
                if crumb.type == "http",
                   let url = crumb.data?["url"] as? String,
                   let q = url.firstIndex(of: "?") {
                    crumb.data?["url"] = String(url[url.startIndex..<q])
                }
                return crumb
            }
        }
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
