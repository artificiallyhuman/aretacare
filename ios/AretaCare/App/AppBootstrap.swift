import Foundation

/// App startup that doesn't depend on which screen launched the app. iOS can launch
/// AretaCare for the CarPlay screen alone, with no phone window, so startup can't live
/// only in the phone's view tree. Both the phone window (`AretaCareApp`) and the CarPlay
/// scene call `start()`; whichever comes first does the work, and the other waits for it.
@MainActor
final class AppBootstrap {
    static let shared = AppBootstrap()

    private var didRunOncePerProcessWork = false
    private var didStartAuth = false
    private var authTask: Task<Void, Never>?

    private init() {}

    /// Idempotent. Restores the session from the stored refresh token once per process, and
    /// joins a restore already in progress instead of starting a second one. Later calls
    /// retry only after a transient failure (offline launch): re-running it while signed out
    /// would tear down a sign-in or MFA screen in progress on the phone, and during a sign-out
    /// could restore the session being ended.
    func start() async {
        if !didRunOncePerProcessWork {
            didRunOncePerProcessWork = true
            TempFileCleanup.sweepAtLaunch()
            SubscriptionManager.shared.configure()
        }
        if let authTask {
            await authTask.value
            return
        }
        let auth = AuthManager.shared
        if didStartAuth {
            guard !auth.isAuthenticated, auth.startupErrorMessage != nil, auth.hasStoredSession else { return }
        }
        didStartAuth = true
        let task = Task { await AuthManager.shared.initAuth() }
        authTask = task
        await task.value
        authTask = nil
    }
}
