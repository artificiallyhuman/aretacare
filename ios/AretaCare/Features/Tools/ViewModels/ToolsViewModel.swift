import Foundation
import Observation

@Observable
final class ToolsViewModel {
    // Jargon Translator
    private(set) var translationResult: JargonTranslationResponse?
    private(set) var isTranslating = false

    // Conversation Coach
    private(set) var coachingResult: String?
    private(set) var isCoaching = false

    private(set) var errorMessage: String?

    // MARK: - Jargon Translator

    func translateJargon(term: String, context: String = "", sessionId: String? = nil) async {
        isTranslating = true
        errorMessage = nil
        translationResult = nil
        defer { isTranslating = false }

        do {
            let request = JargonTranslationRequest(medicalTerm: term, context: context, sessionId: sessionId)
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
            let request = ConversationCoachRequest(situation: situation, sessionId: sessionId)
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
        errorMessage = nil

        var multipart = MultipartFormData()
        multipart.addFileField(
            name: "audio",
            filename: "recording.\(AppConstants.audioFileExtension)",
            mimeType: AppConstants.audioMimeType,
            data: data
        )
        multipart.addTextField(name: "session_id", value: sessionId)
        multipart.addTextField(name: "skip_journal_synthesis", value: "true")

        do {
            let response: TranscribeResponse = try await APIClient.shared.upload(
                APIEndpoints.Conversation.transcribe,
                multipart: multipart
            )
            return response.transcribedText
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

// MARK: - Transcription Response

private struct TranscribeResponse: Decodable {
    let transcribedText: String?
}
