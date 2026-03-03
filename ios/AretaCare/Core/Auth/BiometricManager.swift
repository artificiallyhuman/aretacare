import Foundation
import LocalAuthentication
import Observation

@Observable
final class BiometricManager {
    static let shared = BiometricManager()

    private(set) var biometricType: BiometricType = .none
    private(set) var isAvailable = false
    private(set) var isLocked = false

    private var backgroundDate: Date?

    enum BiometricType {
        case none
        case faceID
        case touchID
    }

    private init() {
        checkAvailability()
    }

    // MARK: - Availability

    func checkAvailability() {
        let context = LAContext()
        var error: NSError?

        if context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) {
            isAvailable = true
            switch context.biometryType {
            case .faceID:
                biometricType = .faceID
            case .touchID:
                biometricType = .touchID
            default:
                biometricType = .none
                isAvailable = false
            }
        } else {
            isAvailable = false
            biometricType = .none
        }
    }

    // MARK: - Biometric Authentication

    func authenticate(reason: String = "Authenticate to continue") async -> Bool {
        let context = LAContext()
        context.localizedCancelTitle = "Cancel"

        do {
            return try await context.evaluatePolicy(
                .deviceOwnerAuthenticationWithBiometrics,
                localizedReason: reason
            )
        } catch {
            #if DEBUG
            print("[Biometric] Authentication failed: \(error)")
            #endif
            return false
        }
    }

    // MARK: - App Lock

    /// User preference for biometric lock. Stored in UserDefaults (not security-sensitive).
    var isBiometricLockEnabled: Bool {
        get { UserDefaults.standard.bool(forKey: "biometricLockEnabled") }
        set { UserDefaults.standard.set(newValue, forKey: "biometricLockEnabled") }
    }

    /// Called when the app enters the background.
    func appDidEnterBackground() {
        guard isBiometricLockEnabled else { return }
        backgroundDate = Date()
    }

    /// Called when the app returns to the foreground.
    /// If backgrounded for >= biometricReauthSeconds, engages the lock.
    func appWillEnterForeground() {
        guard isBiometricLockEnabled,
              let backgroundDate,
              Date().timeIntervalSince(backgroundDate) >= AppConstants.biometricReauthSeconds
        else {
            self.backgroundDate = nil
            return
        }
        self.backgroundDate = nil
        isLocked = true
    }

    /// Attempts biometric auth with device passcode fallback. On success, unlocks.
    func unlock() async -> Bool {
        let context = LAContext()
        context.localizedCancelTitle = "Cancel"

        do {
            let success = try await context.evaluatePolicy(
                .deviceOwnerAuthentication,
                localizedReason: "Unlock AretaCare to access your health information"
            )
            if success {
                isLocked = false
            }
            return success
        } catch {
            #if DEBUG
            print("[Biometric] Unlock failed: \(error)")
            #endif
            return false
        }
    }

    /// Force-clear the lock (e.g., on logout).
    func clearLock() {
        isLocked = false
        backgroundDate = nil
    }
}
