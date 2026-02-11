import Foundation
import Observation

@Observable
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

    func uploadDocument(sessionId: String, fileData: Data, filename: String, contentType: String) async -> DocumentUploadResponse? {
        guard fileData.count <= AppConstants.maxFileSizeBytes else {
            errorMessage = "File exceeds the 30 MB size limit."
            return nil
        }

        isUploading = true
        errorMessage = nil
        defer { isUploading = false }

        do {
            var multipart = MultipartFormData()
            multipart.addTextField(name: "session_id", value: sessionId)
            multipart.addFileField(name: "file", filename: filename, mimeType: contentType, data: fileData)

            let response: DocumentUploadResponse = try await APIClient.shared.upload(
                APIEndpoints.Documents.upload,
                multipart: multipart
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
            let updated: DocumentResponse = try await APIClient.shared.put(
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

    // MARK: - Preview URL (for list thumbnails)

    func fetchPreviewUrl(for document: DocumentResponse) async {
        guard previewUrls[document.id] == nil else { return }

        if document.contentType.hasPrefix("image/") {
            // Images: use the full download URL as preview
            if let url = await getDownloadUrl(id: document.id) {
                previewUrls[document.id] = url
            }
        } else if document.contentType == "application/pdf" {
            // PDFs: use the thumbnail endpoint
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
