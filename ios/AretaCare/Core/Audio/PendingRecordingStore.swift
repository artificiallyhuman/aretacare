import Foundation
import Observation

/// A recording not yet on the server, kept on this device until it is uploaded or discarded.
struct PendingRecording: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let userId: String
    let sessionId: String
    let filename: String
    let recordedAt: Date
}

/// Recordings that never reached the server. A failed upload used to leave the file in the
/// temporary directory with nothing pointing at it, and the launch sweep then deleted it:
/// a caregiver who recorded an appointment on bad signal lost it. A recording now moves in
/// here *before* its upload starts (`upload(file:…)`), so iOS ending the app mid-upload
/// (a long file on cellular outlasts the background time) can't lose it either; it is
/// hidden from the list while that upload runs and removed once it succeeds.
///
/// Files live in Application Support/PendingRecordings, which `TempFileCleanup` never
/// touches, with complete file protection and excluded from device backups. A JSON sidecar
/// names each recording's user and care session; that session's Audio Recordings screen
/// offers Upload and Discard. Everything is deleted on explicit sign-out, and a recording
/// is dropped once its care session is no longer in the signed-in user's list.
@Observable @MainActor
final class PendingRecordingStore {
    static let shared = PendingRecordingStore()

    /// Who a recording belongs to, taken just before its upload starts (`currentOwner()`)
    /// and handed to `keep` if the upload fails.
    struct Owner {
        let userId: String
        /// The explicit sign-outs counted when the upload started.
        fileprivate let signOuts: Int
    }

    enum UploadOutcome {
        case uploaded
        /// The upload failed and the recording is listed for Upload/Discard.
        case keptOnDevice
        /// The upload failed and the recording is gone (signed out meanwhile, or it could
        /// not be stored).
        case notKept
    }

    private(set) var items: [PendingRecording] = []
    /// Recordings whose first upload is running now. Not listed (the Upload button would
    /// send them twice); after a relaunch nothing is running, so they all show.
    private var uploading: Set<String> = []

    @ObservationIgnored private let directory: URL
    @ObservationIgnored private let fileManager = FileManager.default
    /// Explicit sign-outs (`removeAll`) since launch. An upload that started before one
    /// must not put its recording back on the device once it fails.
    @ObservationIgnored private var signOuts = 0

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
            .filter { $0.sessionId == sessionId && $0.userId == userId && !uploading.contains($0.id) }
            .sorted { $0.recordedAt > $1.recordedAt }
    }

    /// Uploads a just-finished recording (`send`) with the file already held here, so it
    /// survives the app being ended mid-upload. Removed when `send` succeeds; listed for
    /// Upload/Discard when it fails. If an app ended right after the server received it,
    /// the next launch lists it anyway: a duplicate the person can delete beats a loss.
    func upload(
        file: URL?, sessionId: String, filename: String, send: () async -> Bool
    ) async -> UploadOutcome {
        // Before the upload: one rejected because the session expired has already run
        // `forceLogout` when it returns, so the signed-in user is gone by then.
        let owner = currentOwner()
        var held: PendingRecording?
        if let file, let owner {
            held = store(fileAt: file, sessionId: sessionId, filename: filename, owner: owner, uploading: true)
        }
        let succeeded = await send()

        if let held {
            uploading.remove(held.id)
            if succeeded {
                remove(held)
                return .uploaded
            }
            // An explicit sign-out during the upload deleted it with everything else.
            return items.contains(held) ? .keptOnDevice : .notKept
        }
        // It couldn't be stored up front (out of space?): the file is still where it was.
        if succeeded {
            if let file { try? fileManager.removeItem(at: file) }
            return .uploaded
        }
        guard let file, let owner else { return .notKept }
        return keep(fileAt: file, sessionId: sessionId, filename: filename, owner: owner) ? .keptOnDevice : .notKept
    }

    /// The signed-in person, for a recording about to be uploaded. Take it before the upload
    /// starts: an upload that fails because the session expired has already run
    /// `forceLogout`, so the signed-in user is gone by the time the recording is kept.
    func currentOwner() -> Owner? {
        AuthManager.shared.currentUser.map { Owner(userId: $0.id, signOuts: signOuts) }
    }

    /// Moves a finished recording into the store. Returns false if it couldn't be kept,
    /// leaving the file where it was, except after an explicit sign-out that happened
    /// while it uploaded: then the file is deleted, like everything `removeAll` deleted.
    /// (An expired session is not a sign-out; that recording is kept for when the same
    /// person signs back in.)
    @discardableResult
    func keep(fileAt source: URL, sessionId: String, filename: String, owner: Owner) -> Bool {
        store(fileAt: source, sessionId: sessionId, filename: filename, owner: owner, uploading: false) != nil
    }

    private func store(
        fileAt source: URL, sessionId: String, filename: String, owner: Owner, uploading isUploading: Bool
    ) -> PendingRecording? {
        guard owner.signOuts == signOuts else {
            try? fileManager.removeItem(at: source)
            return nil
        }
        let recordedAt = (try? fileManager.attributesOfItem(atPath: source.path)[.creationDate] as? Date) ?? Date()
        let item = PendingRecording(
            id: UUID().uuidString, userId: owner.userId, sessionId: sessionId,
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
            if isUploading { uploading.insert(item.id) }
            items.append(item)
            return item
        } catch {
            #if DEBUG
            print("[PendingRecordingStore] Could not keep recording: \(error)")
            #endif
            return nil
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
    /// Uploads still in flight are covered too: their failure path can't keep the file.
    func removeAll() {
        signOuts += 1
        try? fileManager.removeItem(at: directory)
        items = []
        uploading = []
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
