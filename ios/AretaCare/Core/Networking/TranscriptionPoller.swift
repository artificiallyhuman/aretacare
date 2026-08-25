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

        while true {
            try Task.checkCancellation()

            let delay = attempt < initialDelays.count ? initialDelays[attempt] : steadyDelay
            attempt += 1
            try await Task.sleep(for: .seconds(delay))

            do {
                let recording: AudioRecordingResponse = try await APIClient.shared.get(path)
                if recording.transcriptionFailed {
                    throw TranscriptionError.failed
                }
                if !recording.isTranscribing {
                    return recording
                }
            } catch let error as TranscriptionError {
                throw error
            } catch is CancellationError {
                throw CancellationError()
            } catch APIError.notFound {
                // Deleted out from under us (e.g. from the Audio Recordings list).
                throw APIError.notFound
            } catch let error as APIError where error.requiresLogout {
                throw error
            } catch APIError.forbidden(let code) {
                // Access to the care session was revoked mid-wait.
                throw APIError.forbidden(code: code)
            } catch {
                // Network blip, 5xx, rate limit, session refresh in flight —
                // a single missed poll shouldn't abandon the wait.
            }

            if Date().timeIntervalSince(start) >= deadline {
                throw TranscriptionError.timedOut
            }
        }
    }
}
