import Foundation

enum TranscriptionError: LocalizedError {
    case failed
    case timedOut

    var errorDescription: String? {
        switch self {
        case .failed:
            return "Transcription failed. The recording was saved in Audio Recordings."
        case .timedOut:
            return "Transcription is taking longer than expected. It's saved in Audio Recordings and the transcript will appear there."
        }
    }
}

/// Waits for a background transcription to finish.
///
/// `POST /conversation/transcribe` with `background=true` answers 202 as soon as
/// the recording row is persisted; the server transcodes and transcribes
/// afterwards and flips the recording's `transcription_status` to `completed`
/// or `failed`. This polls `GET /audio-recordings/{sid}/{rid}` until then.
enum TranscriptionPoller {
    /// Quick first checks so short clips return fast, then a steady 5s cadence
    /// so an hour-long recording doesn't hammer the API.
    private static let initialDelays: [Double] = [2, 2, 3]
    private static let steadyDelay: Double = 5

    /// How long to keep polling before giving up on the wait (the job itself
    /// keeps running server-side). Scales with the recording length when the
    /// server reported one; `duration` is nil until the job probes the file.
    static func deadline(forDuration duration: Double?) -> TimeInterval {
        guard let duration else { return 10 * 60 }
        return min(30 * 60, max(3 * 60, 2 * duration + 2 * 60))
    }

    static func waitForCompletion(sessionId: String, recordingId: Int, duration: Double?) async throws -> AudioRecordingResponse {
        let start = Date()
        let deadline = deadline(forDuration: duration)
        let path = APIEndpoints.AudioRecordings.get(sessionId, recordingId: String(recordingId))
        var attempt = 0

        // Poll first, then sleep — a short clip is often done by the time the
        // upload response lands, and sleeping up front cost every wait 2s.
        while true {
            try Task.checkCancellation()

            do {
                let recording: AudioRecordingResponse = try await APIClient.shared.get(path)
                if recording.transcriptionFailed {
                    throw TranscriptionError.failed
                }
                if !recording.isTranscribing {
                    return recording
                }
            } catch let error where isFatal(error) {
                throw error
            } catch {
                // Network blip, 5xx, rate limit, session refresh in flight —
                // a single missed poll shouldn't abandon the wait.
            }

            if Date().timeIntervalSince(start) >= deadline {
                throw TranscriptionError.timedOut
            }

            let delay = attempt < initialDelays.count ? initialDelays[attempt] : steadyDelay
            attempt += 1
            try await Task.sleep(for: .seconds(delay))
        }
    }

    /// Errors that end the wait: the poll's own verdicts, cancellation, the
    /// recording being deleted out from under us (404), access to the care
    /// session being revoked mid-wait, and anything that requires logout.
    private static func isFatal(_ error: Error) -> Bool {
        if error is TranscriptionError || error is CancellationError { return true }
        guard let apiError = error as? APIError else { return false }
        if apiError.requiresLogout { return true }
        switch apiError {
        case .notFound, .forbidden:
            return true
        default:
            return false
        }
    }
}
