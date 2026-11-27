import Foundation

/// Whether the phone is connected to a CarPlay screen with AretaCare's scene attached.
/// Set by `CarPlaySceneDelegate`; read by the idle sign-out, which pauses while driving.
@MainActor
final class CarPlayConnection {
    static let shared = CarPlayConnection()

    private(set) var isConnected = false

    private init() {}

    func setConnected(_ connected: Bool) {
        isConnected = connected
    }

    /// Connected, and the person hasn't turned AretaCare off for CarPlay: the car screen is
    /// in use (the idle sign-out pauses for this, not for a car screen that only says it's off).
    var isInUse: Bool { isConnected && CarPlaySettings.isEnabled }
}

/// The "Use in CarPlay" setting (Settings → Security). The Face ID lock covers the phone's
/// screen only, and CarPlay works while the phone is locked, so this is how someone keeps
/// people in the car from talking with AretaCare about their care sessions.
///
/// A setting for this iPhone, not the account: it survives sign-out (`AuthManager.logout`
/// removes named keys only), so someone who turned CarPlay off isn't turned back on by
/// signing in again. On by default. It is enforced in AretaCare's CarPlay scene, so it would
/// also cover HomeView if Apple ever allowed this CarPlay category there (today HomeView
/// shows only audio and video apps).
enum CarPlaySettings {
    static let enabledKey = "carPlayEnabled"
    /// Posted by the Settings toggle; the CarPlay screen follows it at once.
    static let didChangeNotification = Notification.Name("CarPlaySettings.didChange")

    static var isEnabled: Bool {
        UserDefaults.standard.object(forKey: enabledKey) as? Bool ?? true
    }
}
