import Foundation
import Observation

@Observable @MainActor
final class DocumentsViewModel {
    private(set) var documents: [DocumentResponse] = []
    private(set) var isLoading = false
    private(set) var isUploading = false
    private(set) var hasMore = false
    private(set) var total = 0
    private(set) var errorMessage: String?

    var selectedCategory: DocumentCategory?

    private(set) var allDates: [JournalDateInfo] = []
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

    // MARK: - Date Navigation

    var sortedDates: [JournalDateInfo] {
        allDates.sorted { $0.date > $1.date }
    }

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
        errorMessage = nil
        defer { isUploading = false }

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
            let (data, _) = try await URLSession.shared.data(from: downloadUrl)
            let tempDir = FileManager.default.temporaryDirectory
                .appendingPathComponent("QuickLook", isDirectory: true)
            try FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
            let fileURL = tempDir.appendingPathComponent(filename)
            try data.write(to: fileURL)
            return fileURL
        } catch {
            errorMessage = error.localizedDescription
            return nil
        }
    }

    /// Cleans up temporary Quick Look files.
    func cleanupTempFiles() {
        let tempDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("QuickLook", isDirectory: true)
        try? FileManager.default.removeItem(at: tempDir)
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
