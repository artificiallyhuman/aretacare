import Foundation
import UIKit
import Observation

@Observable @MainActor
final class ToolsViewModel {
    // Jargon Translator
    private(set) var translationResult: JargonTranslationResponse?
    private(set) var isTranslating = false

    // Conversation Coach
    private(set) var coachingResult: String?
    private(set) var isCoaching = false

    private(set) var errorMessage: String?

    /// The in-flight upload + transcription-poll, so navigating away can cancel
    /// a wait that is otherwise unbounded by the view's lifecycle.
    private var transcriptionTask: Task<String?, Never>?

    // MARK: - Jargon Translator

    func translateJargon(term: String, context: String = "", sessionId: String? = nil) async {
        isTranslating = true
        errorMessage = nil
        translationResult = nil
        defer { isTranslating = false }

        do {
            let request = JargonTranslationRequest(medicalTerm: term, context: context, sessionId: sessionId?.isEmpty == false ? sessionId : nil)
            let response: JargonTranslationResponse = try await APIClient.shared.post(
                APIEndpoints.Tools.jargonTranslator,
                body: request
            )
            translationResult = response
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Conversation Coach

    func getCoaching(situation: String, sessionId: String? = nil) async {
        isCoaching = true
        errorMessage = nil
        coachingResult = nil
        defer { isCoaching = false }

        do {
            let request = ConversationCoachRequest(situation: situation, sessionId: sessionId?.isEmpty == false ? sessionId : nil)
            let response: ConversationCoachResponse = try await APIClient.shared.post(
                APIEndpoints.Tools.conversationCoach,
                body: request
            )
            coachingResult = response.content
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Audio Transcription

    func transcribeAudio(data: Data, sessionId: String) async -> String? {
        transcriptionTask?.cancel()
        let task = Task { @MainActor [weak self] () -> String? in
            guard let self else { return nil }
            return await self._performTranscribeAudio(data: data, sessionId: sessionId)
        }
        transcriptionTask = task
        return await task.value
    }

    /// Called when the Conversation Coach view leaves the screen.
    func cancelTranscription() {
        transcriptionTask?.cancel()
        transcriptionTask = nil
    }

    private func _performTranscribeAudio(data: Data, sessionId: String) async -> String? {
        errorMessage = nil

        // Keep running when the app is backgrounded mid-wait — without an
        // assertion iOS suspends the process and the poller's wall-clock
        // deadline expires spuriously (same pattern as the chat audio upload)
        var backgroundTaskId: UIBackgroundTaskIdentifier = .invalid
        backgroundTaskId = UIApplication.shared.beginBackgroundTask {
            UIApplication.shared.endBackgroundTask(backgroundTaskId)
            backgroundTaskId = .invalid
        }
        defer {
            if backgroundTaskId != .invalid {
                UIApplication.shared.endBackgroundTask(backgroundTaskId)
            }
        }

        let multipart = MultipartFormData.transcribeAudioBody(
            sessionId: sessionId,
            audioData: data,
            filename: MultipartFormData.generatedRecordingFilename(),
            skipJournalSynthesis: true
        )

        do {
            let response: AudioTranscribeResponse = try await APIClient.shared.upload(
                APIEndpoints.Conversation.transcribe,
                multipart: multipart
            )
            // A 202 means the server is still transcribing in the background;
            // an old backend answers inline with no status.
            guard response.isProcessing, let recordingId = response.recordingId else {
                return response.transcribedText
            }
            let recording = try await TranscriptionPoller.waitForCompletion(
                sessionId: sessionId,
                recordingId: recordingId,
                duration: response.duration
            )
            return recording.transcribedText
        } catch is CancellationError {
            // Navigated away — nothing to show, no error banner
            return nil
        } catch {
            errorMessage = error.localizedDescription
            return nil
        }
    }

    func clearTranslation() {
        translationResult = nil
    }

    func clearCoaching() {
        coachingResult = nil
    }

    func dismissError() {
        errorMessage = nil
    }
}
