import Foundation

/// Generic in-memory cache with per-entry TTL.
final class ResponseCache<Value>: @unchecked Sendable {
    private struct Entry {
        let value: Value
        let expiry: Date
    }

    private var storage: [String: Entry] = [:]
    private let lock = NSLock()
    private let ttl: TimeInterval

    /// - Parameter ttl: Time-to-live in seconds for cached entries.
    init(ttl: TimeInterval) {
        self.ttl = ttl
    }

    func get(_ key: String) -> Value? {
        lock.lock()
        defer { lock.unlock() }
        guard let entry = storage[key], entry.expiry > Date() else {
            storage.removeValue(forKey: key)
            return nil
        }
        return entry.value
    }

    func set(_ value: Value, for key: String) {
        lock.lock()
        defer { lock.unlock() }
        storage[key] = Entry(value: value, expiry: Date().addingTimeInterval(ttl))
    }

    func invalidate(_ key: String) {
        lock.lock()
        defer { lock.unlock() }
        storage.removeValue(forKey: key)
    }

    func invalidateAll() {
        lock.lock()
        defer { lock.unlock() }
        storage.removeAll()
    }
}
