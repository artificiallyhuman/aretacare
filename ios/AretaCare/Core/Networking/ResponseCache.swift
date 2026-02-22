import Foundation

/// Generic in-memory cache with per-entry TTL and size limits.
final class ResponseCache<Value>: @unchecked Sendable {
    private struct Entry {
        let value: Value
        let expiry: Date
    }

    private var storage: [String: Entry] = [:]
    private let lock = NSLock()
    private let ttl: TimeInterval
    private let countLimit: Int
    private var accessCount = 0

    /// - Parameters:
    ///   - ttl: Time-to-live in seconds for cached entries.
    ///   - countLimit: Maximum number of entries before eviction (0 = unlimited).
    init(ttl: TimeInterval, countLimit: Int = 50) {
        self.ttl = ttl
        self.countLimit = countLimit
    }

    func get(_ key: String) -> Value? {
        lock.lock()
        defer { lock.unlock() }
        guard let entry = storage[key], entry.expiry > Date() else {
            storage.removeValue(forKey: key)
            return nil
        }
        accessCount += 1
        // Sweep expired entries every 20 accesses
        if accessCount >= 20 {
            sweepExpired()
            accessCount = 0
        }
        return entry.value
    }

    func set(_ value: Value, for key: String) {
        lock.lock()
        defer { lock.unlock() }
        storage[key] = Entry(value: value, expiry: Date().addingTimeInterval(ttl))
        // Evict if over limit
        if countLimit > 0, storage.count > countLimit {
            sweepExpired()
            // If still over limit after sweep, remove oldest entries
            if storage.count > countLimit {
                let sorted = storage.sorted { $0.value.expiry < $1.value.expiry }
                let excess = storage.count - countLimit
                for entry in sorted.prefix(excess) {
                    storage.removeValue(forKey: entry.key)
                }
            }
        }
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

    /// Remove all expired entries. Must be called while lock is held.
    private func sweepExpired() {
        let now = Date()
        storage = storage.filter { $0.value.expiry > now }
    }
}
