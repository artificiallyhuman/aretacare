import Foundation
import UIKit
import Observation

@Observable @MainActor
final class DocumentsViewModel {
    private(set) var documents: [DocumentResponse] = []
    private(set) var isLoading = false
    private(set) var isUploading = false
    private(set) var isBatchUploading = false
    private(set) var isPreparingUpload = false
    private(set) var batchUploadProgress: [UploadFileProgress] = []
    private(set) var batchCurrentIndex: Int = 0
    private var batchCancelled = false
    private(set) var hasMore = false
    private(set) var total = 0
    private(set) var errorMessage: String?

    var selectedCategory: DocumentCategory?

    private(set) var allDates: [JournalDateInfo] = [] {
        didSet { _sortedDatesCache = allDates.sorted { $0.date > $1.date } }
    }
    private(set) var selectedDateString: String?
    private(set) var isJumpedToDate = false

    /// Cached preview URLs keyed by document ID (presigned, expires after ~15 min).
    private(set) var previewUrls: [Int: URL] = [:]
    /// Track which preview URLs are being fetched to avoid duplicate requests.
    private var previewUrlsInFlight: Set<Int> = []

    // Cached formatter (REL-9: avoid creating new instances per call)
    private static let apiDateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f
    }()

    func setPreparingUpload(_ value: Bool) {
        isPreparingUpload = value
    }

    // MARK: - Date Navigation

    private var _sortedDatesCache: [JournalDateInfo] = []
    var sortedDates: [JournalDateInfo] { _sortedDatesCache }

    func nextDate(after current: String) -> JournalDateInfo? {
        let sorted = sortedDates
        guard let idx = sorted.firstIndex(where: { $0.date == current }),
              idx > 0 else { return nil }
        return sorted[idx - 1]
    }

    func previousDate(before current: String) -> JournalDateInfo? {
        let sorted = sortedDates
        guard let idx = sorted.firstIndex(where: { $0.date == current }),
              idx < sorted.count - 1 else { return nil }
        return sorted[idx + 1]
    }

    var isViewingLatest: Bool {
        guard let selected = selectedDateString else { return true }
        return selected == sortedDates.first?.date
    }

    // MARK: - Fetch Documents

    func fetchDocuments(sessionId: String, category: DocumentCategory? = nil, date: String? = nil, offset: Int = 0, limit: Int = AppConstants.defaultPageSize) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            var queryItems = [
                URLQueryItem(name: "offset", value: String(offset)),
                URLQueryItem(name: "limit", value: String(limit))
            ]
            if let category {
                queryItems.append(URLQueryItem(name: "category", value: category.rawValue))
            }
            if let date {
                queryItems.append(URLQueryItem(name: "date", value: date))
            }

            let response: DocumentListResponse = try await APIClient.shared.get(
                APIEndpoints.Documents.session(sessionId),
                queryItems: queryItems
            )

            if offset == 0 {
                documents = response.documents
            } else {
                documents.append(contentsOf: response.documents)
            }
            hasMore = response.hasMore
            total = response.total
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Upload Document

    func uploadDocument(sessionId: String, fileData: Data, filename: String, contentType: String, skipJournalSynthesis: Bool = false) async -> DocumentUploadResponse? {
        guard fileData.count <= AppConstants.maxFileSizeBytes else {
            errorMessage = "File exceeds the 30 MB size limit."
            return nil
        }

        isUploading = true
        isPreparingUpload = false
        errorMessage = nil

        // Request background execution time so the upload survives screen lock / app backgrounding
        var backgroundTaskId: UIBackgroundTaskIdentifier = .invalid
        backgroundTaskId = UIApplication.shared.beginBackgroundTask {
            UIApplication.shared.endBackgroundTask(backgroundTaskId)
            backgroundTaskId = .invalid
        }
        defer {
            isUploading = false
            if backgroundTaskId != .invalid {
                UIApplication.shared.endBackgroundTask(backgroundTaskId)
            }
        }

        do {
            var multipart = MultipartFormData()
            multipart.addFileField(name: "file", filename: filename, mimeType: contentType, data: fileData)

            var queryItems = [
                URLQueryItem(name: "session_id", value: sessionId),
                URLQueryItem(name: "skip_journal_synthesis", value: skipJournalSynthesis ? "true" : "false")
            ]
            queryItems.append(URLQueryItem(name: "user_date", value: Self.apiDateFormatter.string(from: Date())))

            let response: DocumentUploadResponse = try await APIClient.shared.upload(
                APIEndpoints.Documents.upload,
                multipart: multipart,
                queryItems: queryItems
            )
            // Refresh the list
            await fetchDocuments(sessionId: sessionId, category: selectedCategory)
            return response
        } catch {
            errorMessage = error.localizedDescription
            return nil
        }
    }

    // MARK: - Batch Upload

    func uploadDocuments(sessionId: String, files: [PendingUpload]) async -> UploadBatchResult {
        guard !files.isEmpty else {
            return UploadBatchResult(successCount: 0, failCount: 0, cancelledCount: 0, wasCancelled: false)
        }

        isBatchUploading = true
        isUploading = true
        isPreparingUpload = false
        batchCancelled = false
        errorMessage = nil

        batchUploadProgress = files.enumerated().map { index, file in
            UploadFileProgress(id: index, filename: file.filename, status: .pending)
        }
        batchCurrentIndex = 0

        // Request background execution time so uploads continue if the app is backgrounded
        var backgroundTaskId: UIBackgroundTaskIdentifier = .invalid
        backgroundTaskId = UIApplication.shared.beginBackgroundTask {
            self.batchCancelled = true
            UIApplication.shared.endBackgroundTask(backgroundTaskId)
            backgroundTaskId = .invalid
        }
        // defer, matching uploadDocument above: a future early exit between
        // here and the end must not leak the assertion (a watchdog kill)
        defer {
            isUploading = false
            isBatchUploading = false
            if backgroundTaskId != .invalid {
                UIApplication.shared.endBackgroundTask(backgroundTaskId)
            }
        }

        var successCount = 0
        var failCount = 0

        for (index, file) in files.enumerated() {
            if batchCancelled {
                for i in index..<files.count {
                    batchUploadProgress[i].status = .cancelled
                }
                break
            }

            batchCurrentIndex = index
            batchUploadProgress[index].status = .uploading

            do {
                var multipart = MultipartFormData()
                multipart.addFileField(name: "file", filename: file.filename, mimeType: file.contentType, data: file.data)

                var queryItems = [
                    URLQueryItem(name: "session_id", value: sessionId),
                    URLQueryItem(name: "skip_journal_synthesis", value: "false")
                ]
                queryItems.append(URLQueryItem(name: "user_date", value: Self.apiDateFormatter.string(from: Date())))

                let _: DocumentUploadResponse = try await APIClient.shared.upload(
                    APIEndpoints.Documents.upload,
                    multipart: multipart,
                    queryItems: queryItems
                )

                batchUploadProgress[index].status = .success
                successCount += 1
            } catch {
                if batchCancelled {
                    batchUploadProgress[index].status = .cancelled
                } else {
                    batchUploadProgress[index].status = .error(error.localizedDescription)
                    failCount += 1
                }
            }
        }

        if successCount > 0 {
            await fetchDocuments(sessionId: sessionId, category: selectedCategory)
        }

        // The batch overlay is torn down shortly after completion, so per-file
        // failure reasons would otherwise vanish with it — surface them in the
        // persistent error banner (same UX as single-file failures)
        if failCount > 0 {
            errorMessage = batchUploadProgress.compactMap { progress -> String? in
                if case .error(let reason) = progress.status {
                    return "\(progress.filename): \(reason)"
                }
                return nil
            }.joined(separator: "\n")
        }

        let cancelledCount = batchUploadProgress.filter {
            if case .cancelled = $0.status { return true }
            return false
        }.count

        return UploadBatchResult(
            successCount: successCount,
            failCount: failCount,
            cancelledCount: cancelledCount,
            wasCancelled: batchCancelled
        )
    }

    func cancelBatchUpload() {
        batchCancelled = true
    }

    func clearBatchProgress() {
        batchUploadProgress = []
        batchCurrentIndex = 0
    }

    // MARK: - Update Document

    func updateDocument(id: Int, sessionId: String, category: String? = nil, description: String? = nil) async -> Bool {
        errorMessage = nil

        do {
            let request = DocumentUpdateRequest(aiDescription: description, category: category)
            let updated: DocumentResponse = try await APIClient.shared.patch(
                APIEndpoints.Documents.update(String(id)),
                body: request
            )

            // Update local list
            if let index = documents.firstIndex(where: { $0.id == id }) {
                documents[index] = updated
            }
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    // MARK: - Delete Document

    func deleteDocument(id: Int, sessionId: String) async {
        errorMessage = nil

        do {
            try await APIClient.shared.delete(APIEndpoints.Documents.delete(String(id)))
            documents.removeAll { $0.id == id }
            total = max(0, total - 1)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Download URL

    func getDownloadUrl(id: Int) async -> URL? {
        do {
            let response: DownloadUrlResponse = try await APIClient.shared.get(
                APIEndpoints.Documents.downloadUrl(String(id))
            )
            return URL(string: response.downloadUrl)
        } catch {
            errorMessage = error.localizedDescription
            return nil
        }
    }

    /// Downloads a document to a temporary file for Quick Look preview.
    func downloadToTempFile(id: Int, filename: String) async -> URL? {
        guard let downloadUrl = await getDownloadUrl(id: id) else { return nil }
        do {
            let (data, _) = try await UncachedURLSession.shared.data(from: downloadUrl)
            let quickLookDir = FileManager.default.temporaryDirectory
                .appendingPathComponent("QuickLook", isDirectory: true)
            // One directory per document keeps the original filename (which
            // Quick Look and the share sheet both display) without letting two
            // documents collide.
            let tempDir = quickLookDir.appendingPathComponent(String(id), isDirectory: true)
            guard let fileURL = Self.tempFileURL(in: tempDir, filename: filename) else {
                errorMessage = "Couldn't prepare the document for preview."
                return nil
            }
            try FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
            // Protect at rest: file is unreadable while the device is locked.
            try data.write(to: fileURL, options: [.atomic, .completeFileProtection])
            return fileURL
        } catch {
            errorMessage = error.localizedDescription
            return nil
        }
    }

    /// Builds the on-disk location for a downloaded document.
    ///
    /// `filename` is server-supplied and may have been chosen by a collaborator,
    /// so it is never used as a path component directly — `../../Library/…` would
    /// escape `tmp/QuickLook/`, putting health data somewhere `TempFileCleanup`
    /// never sweeps. The name is reduced to its last component and stripped of
    /// path separators; the containment check is the backstop.
    private static func tempFileURL(in tempDir: URL, filename: String) -> URL? {
        let base = (filename as NSString).lastPathComponent
        var sanitized = base.replacingOccurrences(of: "/", with: "_")
        sanitized = sanitized.replacingOccurrences(of: "\\", with: "_")
        sanitized = sanitized.replacingOccurrences(of: ":", with: "_")
        while sanitized.contains("..") {
            sanitized = sanitized.replacingOccurrences(of: "..", with: "_")
        }
        if sanitized.isEmpty || sanitized.hasPrefix(".") {
            sanitized = "document"
        }

        let fileURL = tempDir.appendingPathComponent(sanitized)
        let dirPath = tempDir.standardizedFileURL.path
        let filePath = fileURL.standardizedFileURL.path
        guard filePath.hasPrefix(dirPath.hasSuffix("/") ? dirPath : dirPath + "/") else {
            return nil
        }
        return fileURL
    }

    /// Cleans up temporary Quick Look files.
    func cleanupTempFiles() {
        TempFileCleanup.removeQuickLookDirectory()
    }

    // MARK: - Preview URLs

    /// Fetches a single preview URL with deduplication.
    func fetchPreviewUrl(for document: DocumentResponse) async {
        guard previewUrls[document.id] == nil,
              !previewUrlsInFlight.contains(document.id) else { return }

        previewUrlsInFlight.insert(document.id)
        defer { previewUrlsInFlight.remove(document.id) }

        if document.contentType.hasPrefix("image/") {
            if let url = await getDownloadUrl(id: document.id) {
                previewUrls[document.id] = url
            }
        } else if document.contentType == "application/pdf" {
            do {
                let response: ThumbnailUrlResponse = try await APIClient.shared.get(
                    APIEndpoints.Documents.thumbnailUrl(String(document.id))
                )
                if let url = URL(string: response.thumbnailUrl) {
                    previewUrls[document.id] = url
                }
            } catch {
                // No thumbnail available — not all PDFs have one
            }
        }
    }

    /// Batch-fetches preview URLs for all visible documents concurrently.
    func fetchPreviewUrls(for documents: [DocumentResponse]) async {
        let needed = documents.filter { previewUrls[$0.id] == nil && !previewUrlsInFlight.contains($0.id) }
        guard !needed.isEmpty else { return }

        await withTaskGroup(of: Void.self) { group in
            for doc in needed {
                group.addTask { [weak self] in
                    await self?.fetchPreviewUrl(for: doc)
                }
            }
        }
    }

    // MARK: - Check Duplicates

    func checkDuplicates(sessionId: String, filenames: [String]) async -> [DuplicateMatch] {
        do {
            let request = DuplicateCheckRequest(sessionId: sessionId, filenames: filenames)
            let response: DuplicateCheckResponse = try await APIClient.shared.post(
                APIEndpoints.Documents.checkDuplicate,
                body: request
            )
            return response.duplicates
        } catch {
            return []
        }
    }

    // MARK: - Load More

    func loadMoreIfNeeded(sessionId: String) async {
        guard hasMore, !isLoading else { return }
        await fetchDocuments(sessionId: sessionId, category: selectedCategory, date: selectedDateString, offset: documents.count)
    }

    // MARK: - Date Navigation Actions

    func fetchDates(sessionId: String) async {
        do {
            let response: JournalDatesResponse = try await APIClient.shared.get(
                APIEndpoints.Documents.dates(sessionId)
            )
            allDates = response.dates
        } catch {
            // Non-fatal; calendar just won't show dates
        }
    }

    func jumpToDate(sessionId: String, date: String) async {
        isJumpedToDate = true
        selectedDateString = date
        documents = []
        hasMore = false
        await fetchDocuments(sessionId: sessionId, category: selectedCategory, date: date)
    }

    func jumpToLatest(sessionId: String) async {
        isJumpedToDate = false
        selectedDateString = nil
        documents = []
        hasMore = false
        await fetchDocuments(sessionId: sessionId, category: selectedCategory)
    }

    func dismissError() {
        errorMessage = nil
    }
}
