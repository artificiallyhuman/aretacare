import Foundation

/// Fetches the admin-published in-app notice and remembers which one the user dismissed.
/// Shown on every signed-in screen, including the AI consent gate and the paywall: a breach
/// notice has to reach every account holder, subscribed or not.
@Observable
@MainActor
final class AppNoticeViewModel {
    private(set) var notice: AppNotice?
    private var dismissedId: Int?
    private var lastFetch: Date?

    private static let refreshInterval: TimeInterval = 10 * 60

    init() {
        // Dismissals used to be one device-wide value, so a notice one person dismissed
        // stayed hidden for the next account signed in on the phone.
        UserDefaults.standard.removeObject(forKey: "dismissedAppNoticeId")
    }

    /// The notice to show, or nil when there is none or the user dismissed it.
    var visibleNotice: AppNotice? {
        guard let notice, notice.id != dismissedId else { return nil }
        return notice
    }

    /// Fetches the current notice. With `force == false` it runs at most every 10 minutes
    /// (foreground returns); sign-in always fetches.
    func refresh(force: Bool = false) async {
        if !force, let lastFetch, Date().timeIntervalSince(lastFetch) < Self.refreshInterval {
            return
        }
        lastFetch = Date()
        dismissedId = storedDismissal()
        do {
            let response: CurrentAppNoticeResponse = try await APIClient.shared.get(APIEndpoints.Notices.current)
            notice = response.notice
        } catch {
            // Keep whatever is showing; the next foreground return tries again.
        }
    }

    func dismiss() {
        guard let notice, let key = Self.dismissedKey() else { return }
        dismissedId = notice.id
        UserDefaults.standard.set(notice.id, forKey: key)
    }

    /// Signed out: forget the notice so the next account fetches its own, and its own
    /// dismissal (read on that account's first refresh).
    func reset() {
        notice = nil
        lastFetch = nil
        dismissedId = nil
    }

    /// Per account: someone else signing in on this phone still sees a notice this
    /// person dismissed.
    private static func dismissedKey() -> String? {
        AuthManager.shared.currentUser.map { "dismissedAppNoticeId.\($0.id)" }
    }

    private func storedDismissal() -> Int? {
        guard let key = Self.dismissedKey() else { return nil }
        let stored = UserDefaults.standard.integer(forKey: key)
        return stored == 0 ? nil : stored
    }
}
