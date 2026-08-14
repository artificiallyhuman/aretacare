import Foundation
import Network
import Observation

@Observable @MainActor
final class NetworkMonitor {
    static let shared = NetworkMonitor()

    private(set) var isConnected = true
    private(set) var connectionType: NWInterface.InterfaceType?
    // `nonisolated` so `deinit` can cancel the monitor. The value is only ever
    // read, never reassigned, and NWPathMonitor is internally thread-safe.
    private nonisolated let monitor = NWPathMonitor()
    private nonisolated let queue = DispatchQueue(label: "com.aretacare.networkmonitor")

    private init() {
        monitor.pathUpdateHandler = { [weak self] path in
            Task { @MainActor in
                self?.isConnected = path.status == .satisfied
                self?.connectionType = path.availableInterfaces.first?.type
            }
        }
        monitor.start(queue: queue)
    }

    deinit {
        monitor.cancel()
    }
}
