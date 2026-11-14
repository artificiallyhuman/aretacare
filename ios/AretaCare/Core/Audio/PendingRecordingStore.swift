import Foundation
import Observation

/// A recording whose upload failed, kept on this device until it is uploaded or discarded.
struct PendingRecording: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let userId: String
    let sessionId: String
    let filename: String
    let recordedAt: Date
}

/// Recordings that never reached the server. A failed upload used to leave the file in the
/// temporary directory with nothing pointing at it, and the launch sweep then deleted it:
/// a caregiver who recorded an appointment on bad signal lost it.
///
/// Files live in Application Support/PendingRecordings, which `TempFileCleanup` never
/// touches, with complete file protection and excluded from device backups. A JSON sidecar
/// names each recording's user and care session; that session's Audio Recordings screen
/// offers Upload and Discard. Everything is deleted on explicit sign-out, and a recording
/// is dropped once its care session is no longer in the signed-in user's list.
@Observable @MainActor
final class PendingRecordingStore {
    static let shared = PendingRecordingStore()

    private(set) var items: [PendingRecording] = []

    @ObservationIgnored private let directory: URL
    @ObservationIgnored private let fileManager = FileManager.default

    private init() {
        let base = (try? fileManager.url(
            for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true
        )) ?? fileManager.temporaryDirectory
        directory = base.appendingPathComponent("PendingRecordings", isDirectory: true)
        reload()
    }

    /// The signed-in user's pending recordings for one care session, newest first.
    func items(for sessionId: String) -> [PendingRecording] {
        guard let userId = AuthManager.shared.currentUser?.id else { return [] }
        return items
            .filter { $0.sessionId == sessionId && $0.userId == userId }
            .sorted { $0.recordedAt > $1.recordedAt }
    }

    /// Moves a finished recording into the store. Returns false (leaving the file where it
    /// was) if it couldn't be kept.
    @discardableResult
    func keep(fileAt source: URL, sessionId: String, filename: String) -> Bool {
        guard let userId = AuthManager.shared.currentUser?.id else { return false }
        let recordedAt = (try? fileManager.attributesOfItem(atPath: source.path)[.creationDate] as? Date) ?? Date()
        let item = PendingRecording(
            id: UUID().uuidString, userId: userId, sessionId: sessionId,
            filename: filename, recordedAt: recordedAt
        )
        do {
            try prepareDirectory()
            // The sidecar holds only ids and a date. It stays readable while the phone is
            // locked (after the first unlock), so a background launch can still list the
            // recordings; the audio itself has complete protection.
            try JSONEncoder().encode(item).write(
                to: metadataURL(item),
                options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication]
            )
            do {
                try fileManager.moveItem(at: source, to: audioURL(item))
            } catch {
                try? fileManager.removeItem(at: metadataURL(item))
                throw error
            }
            try? fileManager.setAttributes([.protectionKey: FileProtectionType.complete], ofItemAtPath: audioURL(item).path)
            items.append(item)
            return true
        } catch {
            #if DEBUG
            print("[PendingRecordingStore] Could not keep recording: \(error)")
            #endif
            return false
        }
    }

    /// The recording's bytes, or nil if the file is gone or unreadable.
    func data(for item: PendingRecording) -> Data? {
        try? Data(contentsOf: audioURL(item))
    }

    func remove(_ item: PendingRecording) {
        try? fileManager.removeItem(at: audioURL(item))
        try? fileManager.removeItem(at: metadataURL(item))
        items.removeAll { $0.id == item.id }
    }

    /// Explicit sign-out: health data must not stay on a device someone may hand over.
    func removeAll() {
        try? fileManager.removeItem(at: directory)
        items = []
    }

    /// Drops recordings that can no longer be uploaded: another user's, or one whose care
    /// session the signed-in user no longer has (deleted, or access removed). Call with a
    /// complete, freshly fetched session list only.
    func prune(userId: String, validSessionIds: Set<String>) {
        for item in items where item.userId != userId || !validSessionIds.contains(item.sessionId) {
            remove(item)
        }
    }

    // MARK: - Storage

    private func audioURL(_ item: PendingRecording) -> URL {
        directory.appendingPathComponent("\(item.id).\(AppConstants.audioFileExtension)")
    }

    private func metadataURL(_ item: PendingRecording) -> URL {
        directory.appendingPathComponent("\(item.id).json")
    }

    private func prepareDirectory() throws {
        try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        var url = directory
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try? url.setResourceValues(values)
    }

    /// Reads the sidecars from disk (at launch, and when the Audio Recordings screen opens, in
    /// case the first read happened while protected data was unavailable). A sidecar that decodes but whose recording is missing is deleted,
    /// and so is a recording with no sidecar, but only when every sidecar could be read: a
    /// file that is merely unreadable right now (protected data unavailable) is never
    /// treated as damaged.
    func reload() {
        guard let entries = try? fileManager.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil) else { return }
        var loaded: [PendingRecording] = []
        var claimed = Set<String>()
        var unreadable = false
        for url in entries where url.pathExtension == "json" {
            guard let data = try? Data(contentsOf: url) else {
                unreadable = true
                continue
            }
            guard let item = try? JSONDecoder().decode(PendingRecording.self, from: data),
                  fileManager.fileExists(atPath: audioURL(item).path) else {
                try? fileManager.removeItem(at: url)
                continue
            }
            loaded.append(item)
            claimed.insert(audioURL(item).lastPathComponent)
        }
        if !unreadable {
            for url in entries where url.pathExtension != "json" && !claimed.contains(url.lastPathComponent) {
                try? fileManager.removeItem(at: url)
            }
        }
        items = loaded
    }
}
