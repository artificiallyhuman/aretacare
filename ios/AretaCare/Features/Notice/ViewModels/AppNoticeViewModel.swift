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

    private static let dismissedKey = "dismissedAppNoticeId"
    private static let refreshInterval: TimeInterval = 10 * 60

    init() {
        let stored = UserDefaults.standard.integer(forKey: Self.dismissedKey)
        dismissedId = stored == 0 ? nil : stored
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
        do {
            let response: CurrentAppNoticeResponse = try await APIClient.shared.get(APIEndpoints.Notices.current)
            notice = response.notice
        } catch {
            // Keep whatever is showing; the next foreground return tries again.
        }
    }

    func dismiss() {
        guard let notice else { return }
        dismissedId = notice.id
        UserDefaults.standard.set(notice.id, forKey: Self.dismissedKey)
    }

    /// Signed out: forget the notice so the next account fetches its own.
    func reset() {
        notice = nil
        lastFetch = nil
        // Logout resets UserDefaults, so re-read: the dismissal doesn't carry across sign-ins.
        let stored = UserDefaults.standard.integer(forKey: Self.dismissedKey)
        dismissedId = stored == 0 ? nil : stored
    }
}
