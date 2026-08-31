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

    /// True while any loaded recording is still being transcribed server-side —
    /// drives the list's refresh loop (`refreshWhileProcessing`).
    var hasProcessingRecordings: Bool { recordings.contains { $0.isTranscribing } }

    private(set) var allDates: [JournalDateInfo] = [] {
        didSet { _sortedDatesCache = allDates.sorted { $0.date > $1.date } }
    }
    private(set) var selectedDateString: String?
    private(set) var isJumpedToDate = false

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

    /// Returns true once the recording is persisted server-side — the caller
    /// keeps its on-disk copy until then.
    @discardableResult
    func uploadRecording(sessionId: String, audioData: Data, filename: String, mimeType: String = AppConstants.audioMimeType) async -> Bool {
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
            let multipart = MultipartFormData.transcribeAudioBody(
                sessionId: sessionId,
                audioData: audioData,
                filename: filename,
                mimeType: mimeType,
                skipJournalSynthesis: false
            )

            // 202: the recording row is persisted and transcription continues
            // server-side — the list shows "Transcribing…" until the refresh
            // loop sees it finish.
            let _: AudioTranscribeResponse = try await APIClient.shared.upload(
                APIEndpoints.Conversation.transcribe,
                multipart: multipart
            )
            await fetchRecordings(sessionId: sessionId)
            return true
        } catch {
            // The row may have been persisted before the failure (a backend
            // without background mode answers 400 once its inline budget
            // expires) — refresh so the list isn't stale, then surface the
            // error (`fetchRecordings` clears `errorMessage` on entry).
            let message = error.localizedDescription
            await fetchRecordings(sessionId: sessionId)
            errorMessage = message
            return false
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
        // defer, matching uploadRecording above: a future early exit between
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
                let multipart = MultipartFormData.transcribeAudioBody(
                    sessionId: sessionId,
                    audioData: file.data,
                    filename: file.filename,
                    mimeType: file.contentType,
                    skipJournalSynthesis: false
                )

                do {
                    let _: AudioTranscribeResponse = try await APIClient.shared.upload(
                        APIEndpoints.Conversation.transcribe,
                        multipart: multipart
                    )
                } catch APIError.rateLimited(let retryAfter) {
                    // Uploads now return in seconds, so a batch can trip the
                    // per-IP limit — wait it out and retry this file once.
                    guard await sleepUnlessBatchCancelled(seconds: min(retryAfter ?? 10, 60)) else {
                        throw CancellationError()
                    }
                    let _: AudioTranscribeResponse = try await APIClient.shared.upload(
                        APIEndpoints.Conversation.transcribe,
                        multipart: multipart
                    )
                }

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

    /// Sleeps in 1s steps so a Cancel tap on the batch overlay isn't stuck
    /// behind a long `Retry-After`. Returns false if the batch was cancelled.
    private func sleepUnlessBatchCancelled(seconds: Int) async -> Bool {
        for _ in 0..<max(0, seconds) {
            if batchCancelled { return false }
            try? await Task.sleep(for: .seconds(1))
        }
        return !batchCancelled
    }

    // MARK: - Background Transcription

    /// Re-fetches the list every few seconds while any loaded recording is
    /// still transcribing, so rows flip from "Transcribing…" to their
    /// transcript without a manual refresh. Bound to the view's lifecycle via
    /// `.task(id:)` — cancellation ends the loop.
    func refreshWhileProcessing(sessionId: String) async {
        while !Task.isCancelled && hasProcessingRecordings {
            try? await Task.sleep(for: .seconds(3))
            guard !Task.isCancelled else { return }
            await silentRefresh(sessionId: sessionId)
        }
    }

    /// Background tick for the loop above. Unlike `fetchRecordings` it never
    /// toggles `isLoading` (which flickered the Delete buttons disabled every
    /// 3s), never resets pagination back to the first page (which snapped the
    /// scroll position to the top), and swallows transient errors instead of
    /// painting the persistent error banner.
    private func silentRefresh(sessionId: String) async {
        do {
            // One call sized to cover everything currently loaded (server caps
            // limit at 100 — beyond that, update the covered window in place)
            let limit = min(max(recordings.count, AppConstants.defaultPageSize), 100)
            var queryItems = [
                URLQueryItem(name: "offset", value: "0"),
                URLQueryItem(name: "limit", value: String(limit))
            ]
            if let date = selectedDateString {
                queryItems.append(URLQueryItem(name: "date", value: date))
            }

            let response: AudioRecordingListResponse = try await APIClient.shared.get(
                APIEndpoints.AudioRecordings.list(sessionId),
                queryItems: queryItems
            )

            if recordings.count <= limit {
                recordings = response.recordings
                hasMore = response.hasMore
            } else {
                let updatedById = Dictionary(uniqueKeysWithValues: response.recordings.map { ($0.id, $0) })
                for index in recordings.indices {
                    if let updated = updatedById[recordings[index].id] {
                        recordings[index] = updated
                    }
                }
            }
            total = response.total
        } catch {
            // Transient (network blip, app briefly backgrounded) — the next
            // tick retries; a real problem surfaces through user-driven loads
        }
    }

    /// Re-queues transcription for a recording whose job failed (or was lost
    /// to a deploy). The server answers 202 and the row goes back to
    /// "Transcribing…".
    @discardableResult
    func retranscribe(sessionId: String, recordingId: Int) async -> Bool {
        errorMessage = nil

        do {
            let _: AudioTranscribeResponse = try await APIClient.shared.post(
                APIEndpoints.AudioRecordings.retranscribe(sessionId, recordingId: String(recordingId))
            )
            await fetchRecordings(sessionId: sessionId, date: selectedDateString)
            return true
        } catch APIError.unknown(statusCode: 409) {
            // Not in the `failed` state any more (already re-queued or
            // finished) — just pick up the current state.
            await fetchRecordings(sessionId: sessionId, date: selectedDateString)
            return false
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
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
