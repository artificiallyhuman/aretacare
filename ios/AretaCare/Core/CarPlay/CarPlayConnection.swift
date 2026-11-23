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
}
