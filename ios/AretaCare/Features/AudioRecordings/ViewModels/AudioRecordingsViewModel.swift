import Foundation
import UIKit
import Observation

@Observable @MainActor
final class AudioRecordingsViewModel {
    private(set) var recordings: [AudioRecordingResponse] = []
    private(set) var isLoading = false
    private(set) var isUploading = false
    private(set) var isBatchUploading = false
    private(set) var batchUploadProgress: [UploadFileProgress] = []
    private(set) var batchCurrentIndex: Int = 0
    private var batchCancelled = false
    private(set) var hasMore = false
    private(set) var total = 0
    private(set) var errorMessage: String?

    private(set) var allDates: [JournalDateInfo] = []
    private(set) var selectedDateString: String?
    private(set) var isJumpedToDate = false

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

    // MARK: - Fetch Recordings

    func fetchRecordings(sessionId: String, date: String? = nil, offset: Int = 0, limit: Int = AppConstants.defaultPageSize) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            var queryItems = [
                URLQueryItem(name: "offset", value: String(offset)),
                URLQueryItem(name: "limit", value: String(limit))
            ]
            if let date {
                queryItems.append(URLQueryItem(name: "date", value: date))
            }

            let response: AudioRecordingListResponse = try await APIClient.shared.get(
                APIEndpoints.AudioRecordings.list(sessionId),
                queryItems: queryItems
            )

            if offset == 0 {
                recordings = response.recordings
            } else {
                recordings.append(contentsOf: response.recordings)
            }
            hasMore = response.hasMore
            total = response.total
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Delete Recording

    func deleteRecording(sessionId: String, recordingId: Int) async {
        errorMessage = nil

        do {
            try await APIClient.shared.delete(
                APIEndpoints.AudioRecordings.delete(sessionId, recordingId: String(recordingId))
            )
            recordings.removeAll { $0.id == recordingId }
            total = max(0, total - 1)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Audio URL

    func getAudioUrl(sessionId: String, recordingId: Int) async -> URL? {
        do {
            let response: AudioUrlResponse = try await APIClient.shared.get(
                APIEndpoints.AudioRecordings.audioUrl(sessionId, recordingId: String(recordingId))
            )
            return URL(string: response.url)
        } catch {
            errorMessage = error.localizedDescription
            return nil
        }
    }

    // MARK: - Upload Recording (transcribe)

    func uploadRecording(sessionId: String, audioData: Data, filename: String, mimeType: String = AppConstants.audioMimeType) async {
        isUploading = true
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
            multipart.addTextField(name: "session_id", value: sessionId)
            multipart.addTextField(name: "skip_journal_synthesis", value: "false")
            multipart.addFileField(name: "audio", filename: filename, mimeType: mimeType, data: audioData)

            let _: AudioTranscribeResponse = try await APIClient.shared.upload(
                APIEndpoints.Conversation.transcribe,
                multipart: multipart
            )
            await fetchRecordings(sessionId: sessionId)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Batch Upload

    func uploadRecordings(sessionId: String, files: [PendingUpload]) async -> UploadBatchResult {
        guard !files.isEmpty else {
            return UploadBatchResult(successCount: 0, failCount: 0, cancelledCount: 0, wasCancelled: false)
        }

        isBatchUploading = true
        isUploading = true
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
                multipart.addTextField(name: "session_id", value: sessionId)
                multipart.addTextField(name: "skip_journal_synthesis", value: "false")
                multipart.addFileField(name: "audio", filename: file.filename, mimeType: file.contentType, data: file.data)

                let _: AudioTranscribeResponse = try await APIClient.shared.upload(
                    APIEndpoints.Conversation.transcribe,
                    multipart: multipart
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
            await fetchRecordings(sessionId: sessionId)
        }

        let cancelledCount = batchUploadProgress.filter {
            if case .cancelled = $0.status { return true }
            return false
        }.count

        isUploading = false
        isBatchUploading = false

        if backgroundTaskId != .invalid {
            UIApplication.shared.endBackgroundTask(backgroundTaskId)
        }

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

    // MARK: - Update Recording

    func updateRecording(sessionId: String, recordingId: Int, category: String? = nil, aiSummary: String? = nil) async {
        errorMessage = nil

        do {
            let request = AudioRecordingUpdateRequest(aiSummary: aiSummary, category: category)
            let updated: AudioRecordingResponse = try await APIClient.shared.patch(
                APIEndpoints.AudioRecordings.update(sessionId, recordingId: String(recordingId)),
                body: request
            )
            if let index = recordings.firstIndex(where: { $0.id == recordingId }) {
                recordings[index] = updated
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Load More

    func loadMoreIfNeeded(sessionId: String) async {
        guard hasMore, !isLoading else { return }
        await fetchRecordings(sessionId: sessionId, date: selectedDateString, offset: recordings.count)
    }

    // MARK: - Date Navigation Actions

    func fetchDates(sessionId: String) async {
        do {
            let response: JournalDatesResponse = try await APIClient.shared.get(
                APIEndpoints.AudioRecordings.dates(sessionId)
            )
            allDates = response.dates
        } catch {
            // Non-fatal; calendar just won't show dates
        }
    }

    func jumpToDate(sessionId: String, date: String) async {
        isJumpedToDate = true
        selectedDateString = date
        recordings = []
        hasMore = false
        await fetchRecordings(sessionId: sessionId, date: date)
    }

    func jumpToLatest(sessionId: String) async {
        isJumpedToDate = false
        selectedDateString = nil
        recordings = []
        hasMore = false
        await fetchRecordings(sessionId: sessionId)
    }

    func dismissError() {
        errorMessage = nil
    }
}
