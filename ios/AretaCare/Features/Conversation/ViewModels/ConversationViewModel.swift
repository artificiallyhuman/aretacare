import Foundation
import Observation

@Observable @MainActor
final class ConversationViewModel {
    private(set) var messages: [MessageResponse] = []
    private(set) var isLoading = false
    private(set) var isLoadingMore = false
    private(set) var isSending = false
    private(set) var hasMore = false
    var errorMessage: String?

    /// Incremented after each silent reconciliation so the view can observe completion.
    private(set) var reconcileToken = 0

    /// IDs of messages that failed to send and can be retried.
    private(set) var failedMessageIds: Set<Int> = []

    /// Content of failed messages keyed by their temp ID, used for retry.
    private var failedMessageContent: [Int: String] = [:]

    private var totalCount = 0
    private var retryCount: [Int: Int] = [:]
    private static let maxRetries = 3
    private static let historyCache = ResponseCache<ConversationHistory>(ttl: 120) // 2 min

    /// Monotonically decreasing counter for temp message IDs (avoids random collisions).
    private static var nextTempId = -1

    /// In-flight send task, cancelled on session switch.
    private var sendTask: Task<Void, Never>?

    // Cached formatters (ARCH-3: avoid creating new instances per call)
    private static let apiDateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f
    }()

    private static let timeFormatter24h: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "HH:mm"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f
    }()

    /// Clears the static history cache. Called on logout.
    static func clearCache() {
        historyCache.invalidateAll()
    }

    // MARK: - Fetch History

    func fetchHistory(sessionId: String, loadMore: Bool = false, forceRefresh: Bool = false) async {
        if loadMore {
            guard !isLoadingMore else { return }
            isLoadingMore = true
        } else {
            guard !isLoading else { return }
            // Check cache for initial load
            if !forceRefresh, let cached = Self.historyCache.get(sessionId) {
                messages = cached.messages
                totalCount = cached.totalCount
                hasMore = cached.hasMore
                return
            }
            isLoading = true
        }
        errorMessage = nil

        let offset = loadMore ? messages.count : 0
        let queryItems = [
            URLQueryItem(name: "limit", value: "\(AppConstants.defaultPageSize)"),
            URLQueryItem(name: "offset", value: "\(offset)")
        ]

        do {
            let history: ConversationHistory = try await APIClient.shared.get(
                APIEndpoints.Conversation.history(sessionId),
                queryItems: queryItems
            )

            if loadMore {
                // Older messages come first from API; prepend them
                let existingIds = Set(messages.map(\.id))
                let newMessages = history.messages.filter { !existingIds.contains($0.id) }
                messages.insert(contentsOf: newMessages, at: 0)
            } else {
                messages = history.messages
                // Cache initial page only
                Self.historyCache.set(history, for: sessionId)
            }
            totalCount = history.totalCount
            hasMore = history.hasMore
        } catch {
            if !isCancellation(error) {
                errorMessage = error.localizedDescription
            }
        }

        if loadMore {
            isLoadingMore = false
        } else {
            isLoading = false
        }
    }

    // MARK: - Send Message

    func sendMessage(text: String, sessionId: String, audioRecordingId: Int? = nil) async {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !isSending else { return }

        isSending = true
        errorMessage = nil
        invalidateCache(for: sessionId)

        // Optimistically add user message
        let now = Date()
        let tempUserMessage = MessageResponse(
            id: { Self.nextTempId -= 1; return Self.nextTempId }(),
            sessionId: sessionId,
            role: .user,
            content: trimmed,
            createdAt: now,
            updatedAt: nil,
            messageType: .text,
            documentId: nil,
            mediaUrl: nil,
            thumbnailUrl: nil,
            extractedText: nil,
            createdBy: nil,
            lastEditedBy: nil
        )
        messages.append(tempUserMessage)

        let entryDate = Self.apiDateFormatter.string(from: now)
        let currentTime = Self.timeFormatter24h.string(from: now)

        let request = SendMessageRequest(
            content: trimmed,
            sessionId: sessionId,
            audioRecordingId: audioRecordingId,
            entryDate: entryDate,
            userTimezone: TimeZone.current.identifier,
            currentTime: currentTime
        )

        do {
            let response: SendMessageResponse = try await APIClient.shared.post(
                APIEndpoints.Conversation.sendMessage,
                body: request
            )

            // Append assistant response directly — avoids full array replacement
            // which causes LazyVStack to lose scroll position and "disappear" messages.
            let assistantMessage = MessageResponse(
                id: response.message.id,
                sessionId: sessionId,
                role: .assistant,
                content: response.message.content,
                createdAt: response.message.createdAt,
                updatedAt: nil,
                messageType: .text,
                documentId: nil,
                mediaUrl: nil,
                thumbnailUrl: nil,
                extractedText: nil,
                createdBy: nil,
                lastEditedBy: nil
            )
            messages.append(assistantMessage)
            isSending = false

            // Background reconciliation to sync temp IDs with server state
            let sid = sessionId
            Task {
                try? await Task.sleep(for: .seconds(2))
                await silentReconcile(sessionId: sid)
            }
        } catch {
            // Keep the optimistic message but mark it as failed for retry
            failedMessageIds.insert(tempUserMessage.id)
            failedMessageContent[tempUserMessage.id] = trimmed
            errorMessage = error.localizedDescription
            isSending = false
        }
    }

    // MARK: - Retry Failed Message

    func retryMessage(messageId: Int, sessionId: String) async {
        guard failedMessageIds.contains(messageId),
              let content = failedMessageContent[messageId] else { return }

        let count = (retryCount[messageId] ?? 0) + 1
        retryCount[messageId] = count

        if count > Self.maxRetries {
            // Exceeded max retries — keep as permanently failed
            errorMessage = "Message failed after multiple attempts. Tap to try again."
            return
        }

        // Remove the failed message and re-send
        failedMessageIds.remove(messageId)
        failedMessageContent.removeValue(forKey: messageId)
        messages.removeAll { $0.id == messageId }

        await sendMessage(text: content, sessionId: sessionId)
    }

    /// Retries all failed messages. Called when network reconnects.
    func retryAllFailed(sessionId: String) async {
        let failedIds = Array(failedMessageIds)
        for id in failedIds {
            await retryMessage(messageId: id, sessionId: sessionId)
        }
    }

    /// Whether a message is in the failed state.
    func isMessageFailed(_ messageId: Int) -> Bool {
        failedMessageIds.contains(messageId)
    }

    // MARK: - Upload Audio for Transcription

    func uploadAudioMessage(data: Data, sessionId: String) async {
        isSending = true
        errorMessage = nil
        invalidateCache(for: sessionId)

        let df = DateFormatter()
        df.dateFormat = "yyyy-MM-dd_h-mma"
        df.locale = Locale(identifier: "en_US_POSIX")
        let filename = "Recording_\(df.string(from: Date())).\(AppConstants.audioFileExtension)"

        var multipart = MultipartFormData()
        multipart.addFileField(
            name: "audio",
            filename: filename,
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

            // Send the transcribed text as a conversation message so AI responds
            if let transcribedText = response.transcribedText, !transcribedText.isEmpty {
                // Reset isSending before calling sendMessage, which has its own guard on isSending
                isSending = false
                await sendMessage(
                    text: transcribedText,
                    sessionId: sessionId,
                    audioRecordingId: response.recordingId
                )
                return // sendMessage already set isSending = false
            }
        } catch {
            errorMessage = error.localizedDescription
        }

        isSending = false
    }

    // MARK: - Send Document/Image Message

    func sendDocumentMessage(sessionId: String, documentId: Int, filename: String, messageType: String, mediaUrl: String? = nil, thumbnailUrl: String? = nil, content: String? = nil) async {
        isSending = true
        errorMessage = nil
        invalidateCache(for: sessionId)

        let displayContent = content ?? "Uploaded: \(filename)"

        // Optimistically add user message so doc/image appears immediately
        let now = Date()
        let msgType: MessageType = messageType == "image" ? .image : .document
        let tempUserMessage = MessageResponse(
            id: { Self.nextTempId -= 1; return Self.nextTempId }(),
            sessionId: sessionId,
            role: .user,
            content: displayContent,
            createdAt: now,
            updatedAt: nil,
            messageType: msgType,
            documentId: documentId,
            mediaUrl: mediaUrl,
            thumbnailUrl: thumbnailUrl,
            extractedText: nil,
            createdBy: nil,
            lastEditedBy: nil
        )
        messages.append(tempUserMessage)

        let entryDate = Self.apiDateFormatter.string(from: now)
        let currentTime = Self.timeFormatter24h.string(from: now)

        let request = SendMessageRequest(
            content: displayContent,
            sessionId: sessionId,
            messageType: messageType,
            documentId: documentId,
            entryDate: entryDate,
            userTimezone: TimeZone.current.identifier,
            currentTime: currentTime
        )

        do {
            let response: SendMessageResponse = try await APIClient.shared.post(
                APIEndpoints.Conversation.sendMessage,
                body: request
            )

            // Append assistant response directly — avoids full array replacement
            let assistantMessage = MessageResponse(
                id: response.message.id,
                sessionId: sessionId,
                role: .assistant,
                content: response.message.content,
                createdAt: response.message.createdAt,
                updatedAt: nil,
                messageType: .text,
                documentId: nil,
                mediaUrl: nil,
                thumbnailUrl: nil,
                extractedText: nil,
                createdBy: nil,
                lastEditedBy: nil
            )
            messages.append(assistantMessage)
            isSending = false

            // Background reconciliation to sync temp IDs with server state
            let sid = sessionId
            Task {
                try? await Task.sleep(for: .seconds(2))
                await silentReconcile(sessionId: sid)
            }
        } catch {
            errorMessage = error.localizedDescription
            isSending = false
        }
    }

    // MARK: - Edit Message

    func editMessage(messageId: Int, content: String, sessionId: String) async {
        errorMessage = nil
        invalidateCache(for: sessionId)

        let request = UpdateMessageRequest(content: content)

        do {
            let response: UpdateMessageResponse = try await APIClient.shared.patch(
                APIEndpoints.Conversation.editMessage(String(messageId)),
                body: request
            )

            // Update the local message
            if let index = messages.firstIndex(where: { $0.id == messageId }) {
                let old = messages[index]
                messages[index] = MessageResponse(
                    id: old.id,
                    sessionId: old.sessionId,
                    role: old.role,
                    content: response.content,
                    createdAt: old.createdAt,
                    updatedAt: response.updatedAt,
                    messageType: old.messageType,
                    documentId: old.documentId,
                    mediaUrl: old.mediaUrl,
                    thumbnailUrl: old.thumbnailUrl,
                    extractedText: old.extractedText,
                    createdBy: old.createdBy,
                    lastEditedBy: response.lastEditedBy
                )
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Reset Conversation

    func resetConversation(messageId: Int, sessionId: String) async {
        errorMessage = nil
        invalidateCache(for: sessionId)

        do {
            try await APIClient.shared.post(
                APIEndpoints.Conversation.resetToMessage(String(messageId))
            )

            // Reload history after reset
            messages = []
            await fetchHistory(sessionId: sessionId)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Clear

    func clearMessages() {
        sendTask?.cancel()
        sendTask = nil
        messages = []
        hasMore = false
        totalCount = 0
        errorMessage = nil
        failedMessageIds.removeAll()
        failedMessageContent.removeAll()
        retryCount.removeAll()
        // Clear cache to ensure fresh data when switching sessions
        Self.historyCache.invalidateAll()
    }

    // MARK: - Collaborator Polling

    /// Polls for new messages from collaborators. Errors are silently ignored.
    func pollForNewMessages(sessionId: String) async {
        guard !isSending, !isLoading else { return }
        guard !messages.isEmpty else { return }

        do {
            let queryItems = [
                URLQueryItem(name: "limit", value: "\(AppConstants.defaultPageSize)"),
                URLQueryItem(name: "offset", value: "0")
            ]
            let history: ConversationHistory = try await APIClient.shared.get(
                APIEndpoints.Conversation.history(sessionId),
                queryItems: queryItems
            )
            // Only append truly new messages (positive IDs not already in the list)
            let existingIds = Set(messages.map(\.id))
            let newMessages = history.messages.filter { $0.id > 0 && !existingIds.contains($0.id) }
            if !newMessages.isEmpty {
                messages.append(contentsOf: newMessages)
                Self.historyCache.invalidate(sessionId)
            }
        } catch {
            // Silent failure for polling — don't show error banners
        }
    }

    // MARK: - Silent Reconciliation

    /// Fetches fresh history and reconciles in-place without full array replacement.
    /// Runs after send to sync temp message IDs with server truth.
    /// In-place updates preserve ForEach identity and prevent scroll position jumps.
    private func silentReconcile(sessionId: String) async {
        guard !isSending else { return }

        do {
            let queryItems = [
                URLQueryItem(name: "limit", value: "\(AppConstants.defaultPageSize)"),
                URLQueryItem(name: "offset", value: "0")
            ]
            let history: ConversationHistory = try await APIClient.shared.get(
                APIEndpoints.Conversation.history(sessionId),
                queryItems: queryItems
            )

            // Build lookup of server messages by ID for updating existing messages
            let serverById = Dictionary(uniqueKeysWithValues: history.messages.map { ($0.id, $0) })

            // Build signature-based lookup for matching temp messages to server messages.
            // Signature = "role|first 100 chars of content". Collect all matches per signature
            // so we can consume them in order (handles duplicate content).
            var serverBySignature: [String: [MessageResponse]] = [:]
            for msg in history.messages {
                let sig = "\(msg.role.rawValue)|\(msg.content.prefix(100))"
                serverBySignature[sig, default: []].append(msg)
            }

            var reconciledIds = Set<Int>()

            // Update existing messages in-place
            for i in messages.indices {
                let local = messages[i]
                if local.id < 0 {
                    // Temp message: find matching server message by signature
                    let sig = "\(local.role.rawValue)|\(local.content.prefix(100))"
                    if let candidates = serverBySignature[sig],
                       let match = candidates.first(where: { !reconciledIds.contains($0.id) }) {
                        messages[i] = match
                        reconciledIds.insert(match.id)
                    }
                } else if let updated = serverById[local.id] {
                    // Existing server message: update metadata only if changed
                    if local != updated {
                        messages[i] = updated
                    }
                    reconciledIds.insert(local.id)
                }
            }

            // Append any new server messages not yet in the local array (e.g. from collaborators)
            let newMessages = history.messages.filter { !reconciledIds.contains($0.id) }
            if !newMessages.isEmpty {
                messages.append(contentsOf: newMessages)
            }

            totalCount = history.totalCount
            hasMore = history.hasMore
            Self.historyCache.set(history, for: sessionId)
            reconcileToken += 1
        } catch {
            // Silent failure — user already sees correct messages
        }
    }

    /// Invalidates the history cache for a session (called after mutations).
    private func invalidateCache(for sessionId: String) {
        Self.historyCache.invalidate(sessionId)
    }

    func dismissError() {
        errorMessage = nil
    }

    private func isCancellation(_ error: Error) -> Bool {
        if error is CancellationError { return true }
        if (error as? URLError)?.code == .cancelled { return true }
        if case APIError.networkError(let underlying) = error,
           (underlying as? URLError)?.code == .cancelled { return true }
        return false
    }
}

// MARK: - Response Models

private struct SendMessageResponse: Decodable {
    let message: AssistantMessageInfo
    let journalSuggestion: JournalSuggestion?
    let processingWarning: String?

    struct AssistantMessageInfo: Decodable {
        let id: Int
        let role: String
        let content: String
        let createdAt: Date
    }

    struct JournalSuggestion: Decodable {
        let shouldCreate: Bool
        let reasoning: String?
        let entries: [JournalEntry]?
        let warning: String?
    }

    struct JournalEntry: Decodable {
        let title: String
        let content: String
        let entryType: String
        let confidence: Double
    }
}

private struct TranscribeResponse: Decodable {
    let transcribedText: String?
    let recordingId: Int?
    let duration: Double?
}
