import Foundation
@preconcurrency import KeychainAccess

final class KeychainManager: Sendable {
    static let shared = KeychainManager()

    private let keychain: Keychain

    private enum Keys {
        static let refreshToken = "refresh_token"
        static let trustedDeviceToken = "trusted_device_token"
    }

    private init() {
        self.keychain = Keychain(service: "com.aretacare.ios")
            .accessibility(.afterFirstUnlock)
    }

    // MARK: - Refresh Token

    var refreshToken: String? {
        get {
            do {
                return try keychain.get(Keys.refreshToken)
            } catch {
                #if DEBUG
                print("[Keychain] Failed to read refresh token: \(error)")
                #endif
                return nil
            }
        }
        set {
            do {
                if let value = newValue {
                    try keychain.set(value, key: Keys.refreshToken)
                } else {
                    try keychain.remove(Keys.refreshToken)
                }
            } catch {
                #if DEBUG
                print("[Keychain] Failed to write refresh token: \(error)")
                #endif
            }
        }
    }

    // MARK: - Trusted Device Token

    var trustedDeviceToken: String? {
        get {
            do {
                return try keychain.get(Keys.trustedDeviceToken)
            } catch {
                #if DEBUG
                print("[Keychain] Failed to read trusted device token: \(error)")
                #endif
                return nil
            }
        }
        set {
            do {
                if let value = newValue {
                    try keychain.set(value, key: Keys.trustedDeviceToken)
                } else {
                    try keychain.remove(Keys.trustedDeviceToken)
                }
            } catch {
                #if DEBUG
                print("[Keychain] Failed to write trusted device token: \(error)")
                #endif
            }
        }
    }

    // MARK: - Clear All

    func clearAll() {
        do {
            try keychain.removeAll()
        } catch {
            #if DEBUG
            print("[Keychain] Failed to clear all: \(error)")
            #endif
        }
    }
}
