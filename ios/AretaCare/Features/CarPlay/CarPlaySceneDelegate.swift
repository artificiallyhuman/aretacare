import CarPlay
import UIKit

/// The CarPlay screen (Info.plist: `CPTemplateApplicationSceneSessionRoleApplication`).
/// AretaCare is a CarPlay voice-based conversational app: the car's screen offers Talk and
/// its one-tap starts, and every answer is spoken. No health information is ever shown: the
/// only text is fixed labels and care-session names.
///
/// iOS may launch the app for this scene alone, with the phone locked and no phone window,
/// so the coordinator starts the app itself (`AppBootstrap`).
final class CarPlaySceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate {
    /// A `CarPlayCoordinator`. The category needs iOS 26.4, and a stored property can't be
    /// marked with a newer availability than its type.
    private var coordinator: AnyObject?

    func templateApplicationScene(
        _ templateApplicationScene: CPTemplateApplicationScene,
        didConnect interfaceController: CPInterfaceController
    ) {
        // The category doesn't exist before 26.4. Checked first: "connected" pauses the idle
        // sign-out and refuses recording on the phone, which only a working car screen justifies.
        guard #available(iOS 26.4, *) else { return }
        CarPlayConnection.shared.setConnected(true)
        // Recording isn't allowed while CarPlay is active: a recording on the phone pauses.
        AudioRecorderManager.pauseForCarPlay()
        AuthManager.shared.recordActivity()
        let coordinator = CarPlayCoordinator(interfaceController: interfaceController)
        self.coordinator = coordinator
        coordinator.connect()
    }

    func templateApplicationScene(
        _ templateApplicationScene: CPTemplateApplicationScene,
        didDisconnectInterfaceController interfaceController: CPInterfaceController
    ) {
        CarPlayConnection.shared.setConnected(false)
        AudioRecorderManager.carPlayDisconnected()
        if #available(iOS 26.4, *) {
            (coordinator as? CarPlayCoordinator)?.disconnect()
        }
        coordinator = nil
    }

    func sceneWillEnterForeground(_ scene: UIScene) {
        AuthManager.shared.recordActivity()
        if #available(iOS 26.4, *) {
            (coordinator as? CarPlayCoordinator)?.refresh()
        }
    }
}
