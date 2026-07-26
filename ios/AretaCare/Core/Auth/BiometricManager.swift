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

    /// Persisted copy of `backgroundDate` so a cold relaunch (iOS jetsams the
    /// suspended process) can still honor the re-auth window instead of
    /// bypassing the lock entirely.
    private static let backgroundDateKey = "biometricBackgroundDate"

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
        let now = Date()
        backgroundDate = now
        UserDefaults.standard.set(now.timeIntervalSince1970, forKey: Self.backgroundDateKey)
    }

    /// Called when the app returns to the foreground.
    /// If backgrounded for >= biometricReauthSeconds, engages the lock.
    func appWillEnterForeground() {
        defer {
            backgroundDate = nil
            UserDefaults.standard.removeObject(forKey: Self.backgroundDateKey)
        }
        guard isBiometricLockEnabled,
              let backgroundDate,
              Date().timeIntervalSince(backgroundDate) >= AppConstants.biometricReauthSeconds
        else { return }
        isLocked = true
    }

    /// Called once at app launch, before auth state resolves. The in-memory
    /// lock state dies with the process, so without this a cold relaunch would
    /// skip the biometric challenge entirely and land on the last open screen.
    /// Locks unless the persisted background timestamp proves the app left the
    /// foreground less than the re-auth window ago; crashes and unknown states
    /// fail locked.
    func lockOnColdLaunchIfNeeded() {
        guard isBiometricLockEnabled else { return }
        defer { UserDefaults.standard.removeObject(forKey: Self.backgroundDateKey) }
        let persisted = UserDefaults.standard.double(forKey: Self.backgroundDateKey)
        if persisted > 0,
           Date().timeIntervalSince(Date(timeIntervalSince1970: persisted)) < AppConstants.biometricReauthSeconds {
            return
        }
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
        UserDefaults.standard.removeObject(forKey: Self.backgroundDateKey)
    }
}
