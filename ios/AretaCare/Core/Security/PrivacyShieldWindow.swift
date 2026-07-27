import SwiftUI
import UIKit

/// Hosts the biometric lock and the app-switcher privacy shield in a dedicated
/// window above `.alert` level. SwiftUI sheets and full-screen covers present
/// in a UIKit layer above the root view's overlays, so an in-hierarchy overlay
/// cannot cover them — a sheet (e.g. the collaboration awareness popup firing
/// while sessions load on cold launch) would render on top of the Face ID lock
/// and expose health data before unlock. A separate high-level window covers
/// every presented view controller.

/// Window that swallows all touches while lock/shield content is visible and
/// passes every touch through to the app window otherwise. Interception is
/// driven by app state per-touch, not by view-hierarchy inspection: on iOS 18
/// `_UIHostingView.hitTest` can return the hosting view itself even when real
/// content (the Unlock button) is under the touch, so the classic
/// "hit view == root view → nil" idiom would leak taps into the locked app.
final class PassthroughWindow: UIWindow {
    var shouldIntercept: () -> Bool = { false }

    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        guard shouldIntercept() else { return nil }
        // Always consume the touch while overlay content is up, regardless of
        // SwiftUI hit-testing quirks.
        return super.hitTest(point, with: event) ?? rootViewController?.view
    }

    override var canBecomeKey: Bool { false }
}

/// Owns the overlay window(s) and mirrors the scene's active state.
/// `scenePhase` is fed in from `AretaCareApp` because `@Environment(\.scenePhase)`
/// is not reliably updated inside a manually created `UIHostingController`.
@MainActor
@Observable
final class PrivacyWindowManager {
    static let shared = PrivacyWindowManager()
    private init() {}

    /// Mirrors `scenePhase == .active`. Defaults false so the shield covers
    /// the launch frames until the scene activates.
    private(set) var isSceneActive = false

    @ObservationIgnored
    private var windows: [ObjectIdentifier: PassthroughWindow] = [:]

    var overlayContentVisible: Bool {
        (AuthManager.shared.isAuthenticated && BiometricManager.shared.isLocked)
            || !isSceneActive
    }

    func update(phase: ScenePhase) {
        isSceneActive = (phase == .active)
        attachIfNeeded()
    }

    /// Idempotent; re-run on every scene phase transition as a self-healing
    /// backstop. Single-scene app, so pruning against `connectedScenes`
    /// replaces a disconnect observer.
    func attachIfNeeded() {
        let connected = UIApplication.shared.connectedScenes
        let connectedIDs = Set(connected.map(ObjectIdentifier.init))
        windows = windows.filter { connectedIDs.contains($0.key) }

        for scene in connected {
            guard let windowScene = scene as? UIWindowScene else { continue }
            let id = ObjectIdentifier(windowScene)
            guard windows[id] == nil else { continue }

            let window = PassthroughWindow(windowScene: windowScene)
            window.windowLevel = .alert + 1
            window.backgroundColor = .clear
            let host = UIHostingController(rootView: PrivacyOverlayRoot())
            host.view.backgroundColor = .clear
            window.rootViewController = host
            window.shouldIntercept = { PrivacyWindowManager.shared.overlayContentVisible }
            // Never makeKey() — the main window must stay key so text input
            // and ASAuthorization presentation anchoring keep working.
            window.isHidden = false
            windows[id] = window
        }
    }
}

/// Content of the overlay window. Empty when the app is active and unlocked.
struct PrivacyOverlayRoot: View {
    private let manager = PrivacyWindowManager.shared
    private let authManager = AuthManager.shared
    private let biometricManager = BiometricManager.shared

    var body: some View {
        ZStack {
            if authManager.isAuthenticated && biometricManager.isLocked {
                BiometricLockView()
                    .transition(.identity)
            }
            // Declared second = on top: Face ID evaluation drives the scene
            // .inactive, and the shield must cover the lock while the system
            // Face ID dialog is up.
            if !manager.isSceneActive {
                PrivacyShieldView()
                    .transition(.identity)
            }
        }
        // Confine VoiceOver to this window while visible — a presented sheet
        // is outside ContentView's subtree, so its .accessibilityHidden alone
        // can't stop VoiceOver from reading sheet content under the lock.
        .accessibilityAddTraits(.isModal)
        .onChange(of: manager.overlayContentVisible) { _, visible in
            if visible {
                // The keyboard lives in its own window far above .alert + 1;
                // dismiss it so it can't float over the lock/shield.
                UIApplication.shared.sendAction(
                    #selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
            }
        }
    }
}
