import Foundation
import UIKit
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

    /// When true, newer messages were trimmed during "load more" to stay within the memory cap.
    /// The view should reload the latest page when the user scrolls back to the bottom.
    private(set) var hasNewerTrimmed = false

    private var totalCount = 0
    private var retryCount: [Int: Int] = [:]
    private static let maxRetries = 3
    private static let maxLoadedMessages = 500
    private static let historyCache = ResponseCache<ConversationHistory>(ttl: 120) // 2 min

    /// Monotonically decreasing counter for temp message IDs (avoids random collisions).
    private static var nextTempId = -1

    /// In-flight send task, cancelled on session switch.
    private var sendTask: Task<Void, Never>?

    /// Deferred post-send reconciliation task. Stored so `clearMessages()` can
    /// cancel it — an orphaned reconcile fired after a care-session switch would
    /// append the previous session's messages into the newly rendered chat.
    private var reconcileTask: Task<Void, Never>?

    /// The care session whose messages are currently loaded. Every async path
    /// re-checks this after awaiting so a switch mid-flight can't cross-write
    /// one session's data into another's list.
    private(set) var activeSessionId: String?

    /// Reconcile passes each surviving temp (negative-ID) message has been
    /// through. A temp the server rewrote never matches by signature, so it is
    /// dropped after a grace pass rather than wedging the polling guard.
    private var tempReconcilePasses: [Int: Int] = [:]

    /// Result of the most recent `uploadAudioMessage` run. Held here rather than
    /// returned from the inner task so `sendTask` stays cancellable.
    private var audioUploadSucceeded = false

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
        activeSessionId = sessionId
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

        var queryItems = [
            URLQueryItem(name: "limit", value: "\(AppConstants.defaultPageSize)"),
            URLQueryItem(name: "offset", value: "0")
        ]
        // Use cursor pagination (before_id) for load-more — O(1) vs O(offset) with OFFSET
        if loadMore, let oldestId = messages.first?.id, oldestId > 0 {
            queryItems.append(URLQueryItem(name: "before_id", value: "\(oldestId)"))
        }

        do {
            let history: ConversationHistory = try await APIClient.shared.get(
                APIEndpoints.Conversation.history(sessionId),
                queryItems: queryItems
            )

            // A care-session switch while the request was in flight must not
            // paint the previous session's history into the new one.
            guard sessionId == activeSessionId else {
                if loadMore { isLoadingMore = false } else { isLoading = false }
                return
            }

            if loadMore {
                // Older messages come first from API; prepend them
                let existingIds = Set(messages.map(\.id))
                let newMessages = history.messages.filter { !existingIds.contains($0.id) }
                messages.insert(contentsOf: newMessages, at: 0)
                // Trim newest (off-screen) messages if we exceed the memory cap
                if messages.count > Self.maxLoadedMessages {
                    messages.removeLast(messages.count - Self.maxLoadedMessages)
                    hasNewerTrimmed = true
                }
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

    /// Reloads the latest page of messages when the user scrolls back to the bottom
    /// after older messages caused the newest to be trimmed.
    func reloadLatestIfNeeded(sessionId: String) async {
        guard hasNewerTrimmed else { return }
        hasNewerTrimmed = false
        await fetchHistory(sessionId: sessionId, forceRefresh: true)
    }

    // MARK: - Send Message

    func sendMessage(text: String, sessionId: String, audioRecordingId: Int? = nil) async {
        // Cancel any prior in-flight send and install ourselves into sendTask so
        // clearMessages() (called on care-session switch) cancels this work cooperatively.
        sendTask?.cancel()
        let task: Task<Void, Never> = Task { @MainActor [weak self] in
            guard let self = self else { return }
            await self._performSendMessage(text: text, sessionId: sessionId, audioRecordingId: audioRecordingId)
        }
        sendTask = task
        await task.value
    }

    private func _performSendMessage(text: String, sessionId: String, audioRecordingId: Int?) async {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !isSending else { return }

        activeSessionId = sessionId
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

            // Session was switched mid-send — drop the response rather than appending
            // it to a different session's message list.
            if Task.isCancelled || sessionId != activeSessionId {
                isSending = false
                return
            }

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
            scheduleReconcile(sessionId: sessionId)
        } catch is CancellationError {
            // Session switch cancelled this send — silently abandon.
            isSending = false
        } catch {
            isSending = false
            if Task.isCancelled || sessionId != activeSessionId { return }
            // The server may have processed the message despite the connection
            // dropping (e.g. phone slept during AI response). Reconcile first.
            await silentReconcile(sessionId: sessionId)
            if messages.last?.role == .assistant {
                errorMessage = nil
            } else {
                failedMessageIds.insert(tempUserMessage.id)
                failedMessageContent[tempUserMessage.id] = trimmed
                errorMessage = error.localizedDescription
            }
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

    /// Uploads a recording for transcription. Returns true once the recording is
    /// safely on the server — the caller keeps its on-disk copy until then.
    @discardableResult
    func uploadAudioMessage(data: Data, sessionId: String) async -> Bool {
        sendTask?.cancel()
        audioUploadSucceeded = false
        let task: Task<Void, Never> = Task { @MainActor [weak self] in
            guard let self = self else { return }
            self.audioUploadSucceeded = await self._performUploadAudioMessage(data: data, sessionId: sessionId)
        }
        sendTask = task
        await task.value
        return audioUploadSucceeded
    }

    private func _performUploadAudioMessage(data: Data, sessionId: String) async -> Bool {
        activeSessionId = sessionId
        isSending = true
        errorMessage = nil
        invalidateCache(for: sessionId)

        // Request background execution time so the upload survives screen lock / app backgrounding
        var backgroundTaskId: UIBackgroundTaskIdentifier = .invalid
        backgroundTaskId = UIApplication.shared.beginBackgroundTask {
            UIApplication.shared.endBackgroundTask(backgroundTaskId)
            backgroundTaskId = .invalid
        }

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
        multipart.addTextField(name: "background", value: "true")

        do {
            let response: AudioTranscribeResponse = try await APIClient.shared.upload(
                APIEndpoints.Conversation.transcribe,
                multipart: multipart
            )

            // The recording is persisted server-side at this point, so the
            // caller may drop its on-disk copy even if the follow-up send fails.
            if Task.isCancelled || sessionId != activeSessionId {
                isSending = false
                if backgroundTaskId != .invalid {
                    UIApplication.shared.endBackgroundTask(backgroundTaskId)
                }
                return true
            }

            // A 202 means the server is still transcoding/transcribing in the
            // background — wait for it here, keeping `isSending` and the
            // background task alive. An old backend answers inline with no
            // status and `transcribedText` already populated.
            var transcribedText = response.transcribedText
            if response.isProcessing, let recordingId = response.recordingId {
                do {
                    let recording = try await TranscriptionPoller.waitForCompletion(
                        sessionId: sessionId,
                        recordingId: recordingId,
                        duration: response.duration
                    )
                    transcribedText = recording.transcribedText
                } catch {
                    // The recording itself is saved (retryable from Audio
                    // Recordings); only the transcript is missing.
                    if !Task.isCancelled {
                        errorMessage = error.localizedDescription
                    }
                    isSending = false
                    if backgroundTaskId != .invalid {
                        UIApplication.shared.endBackgroundTask(backgroundTaskId)
                    }
                    return true
                }

                if Task.isCancelled || sessionId != activeSessionId {
                    isSending = false
                    if backgroundTaskId != .invalid {
                        UIApplication.shared.endBackgroundTask(backgroundTaskId)
                    }
                    return true
                }
            }

            // Send the transcribed text as a conversation message so AI responds.
            // Note: we don't call sendMessage() here (which would reset sendTask and
            // cancel ourselves). We inline the same logic against this task.
            if let transcribedText, !transcribedText.isEmpty {
                isSending = false
                if backgroundTaskId != .invalid {
                    UIApplication.shared.endBackgroundTask(backgroundTaskId)
                }
                await _performSendMessage(
                    text: transcribedText,
                    sessionId: sessionId,
                    audioRecordingId: response.recordingId
                )
                return true
            }

            isSending = false
            if backgroundTaskId != .invalid {
                UIApplication.shared.endBackgroundTask(backgroundTaskId)
            }
            return true
        } catch is CancellationError {
            isSending = false
            if backgroundTaskId != .invalid {
                UIApplication.shared.endBackgroundTask(backgroundTaskId)
            }
            return false
        } catch {
            if !Task.isCancelled {
                errorMessage = error.localizedDescription
            }
        }

        isSending = false
        if backgroundTaskId != .invalid {
            UIApplication.shared.endBackgroundTask(backgroundTaskId)
        }
        return false
    }

    // MARK: - Send Document/Image Message

    func sendDocumentMessage(sessionId: String, documentId: Int, filename: String, messageType: String, mediaUrl: String? = nil, thumbnailUrl: String? = nil, content: String? = nil) async {
        sendTask?.cancel()
        let task: Task<Void, Never> = Task { @MainActor [weak self] in
            guard let self = self else { return }
            await self._performSendDocumentMessage(
                sessionId: sessionId,
                documentId: documentId,
                filename: filename,
                messageType: messageType,
                mediaUrl: mediaUrl,
                thumbnailUrl: thumbnailUrl,
                content: content
            )
        }
        sendTask = task
        await task.value
    }

    private func _performSendDocumentMessage(sessionId: String, documentId: Int, filename: String, messageType: String, mediaUrl: String?, thumbnailUrl: String?, content: String?) async {
        activeSessionId = sessionId
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

            if Task.isCancelled || sessionId != activeSessionId {
                isSending = false
                return
            }

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
            scheduleReconcile(sessionId: sessionId)
        } catch is CancellationError {
            isSending = false
        } catch {
            isSending = false
            if Task.isCancelled || sessionId != activeSessionId { return }
            // The server may have processed the message despite the connection
            // dropping (e.g. phone slept during AI response). Reconcile to check
            // before showing an error.
            await silentReconcile(sessionId: sessionId)
            if messages.last?.role == .assistant {
                // Reconcile found the response — no error to show
                errorMessage = nil
            } else {
                errorMessage = error.localizedDescription
            }
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
        // A deferred reconcile left running across a care-session switch would
        // append the previous session's messages into the new session's chat.
        reconcileTask?.cancel()
        reconcileTask = nil
        activeSessionId = nil
        messages = []
        hasMore = false
        hasNewerTrimmed = false
        totalCount = 0
        errorMessage = nil
        failedMessageIds.removeAll()
        failedMessageContent.removeAll()
        retryCount.removeAll()
        tempReconcilePasses.removeAll()
        // Clear cache to ensure fresh data when switching sessions
        Self.historyCache.invalidateAll()
    }

    // MARK: - Collaborator Polling

    /// Polls for new messages from collaborators. Errors are silently ignored.
    func pollForNewMessages(sessionId: String) async {
        guard !isSending, !isLoading else { return }
        guard sessionId == activeSessionId else { return }
        guard !messages.isEmpty else { return }
        // Skip if there are unreconciled temp messages — silentReconcile
        // hasn't replaced temp IDs yet, so the poll would see server messages
        // as "new" and append duplicates. Failed sends keep their temp ID on
        // purpose (for the retry affordance) and must not stall polling.
        guard !messages.contains(where: { $0.id < 0 && !failedMessageIds.contains($0.id) }) else { return }

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

    /// Schedules a deferred reconcile, replacing any previously scheduled one.
    /// The task is retained so a care-session switch can cancel it.
    private func scheduleReconcile(sessionId: String, delay: Duration = .seconds(2)) {
        reconcileTask?.cancel()
        reconcileTask = Task { @MainActor [weak self] in
            try? await Task.sleep(for: delay)
            guard !Task.isCancelled else { return }
            await self?.silentReconcile(sessionId: sessionId)
        }
    }

    /// Fetches fresh history and reconciles in-place without full array replacement.
    /// Runs after send to sync temp message IDs with server truth.
    /// In-place updates preserve ForEach identity and prevent scroll position jumps.
    private func silentReconcile(sessionId: String) async {
        guard !isSending else { return }
        guard sessionId == activeSessionId else { return }

        do {
            let queryItems = [
                URLQueryItem(name: "limit", value: "\(AppConstants.defaultPageSize)"),
                URLQueryItem(name: "offset", value: "0")
            ]
            let history: ConversationHistory = try await APIClient.shared.get(
                APIEndpoints.Conversation.history(sessionId),
                queryItems: queryItems
            )

            // The care session may have been switched while the request was in
            // flight. Mutating `messages` now would splice this session's
            // history — and its PHI — into the chat the user is looking at.
            guard sessionId == activeSessionId else { return }

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

            sweepUnmatchedTempMessages(sessionId: sessionId)

            totalCount = history.totalCount
            hasMore = history.hasMore
            Self.historyCache.set(history, for: sessionId)
            reconcileToken += 1
        } catch {
            // Silent failure — user already sees correct messages
        }
    }

    /// Drops temp messages the reconcile could not match to a server row.
    ///
    /// Signature matching fails whenever the server stores different content
    /// than the client optimistically rendered (the document path composes
    /// `"Uploaded: <filename>"` locally). The unmatched temp then shows as a
    /// duplicate next to the appended server copy, and its negative ID trips the
    /// polling guard for good — collaborator messages stop arriving. One extra
    /// reconcile pass is allowed as a grace window; after that the temp is
    /// dropped. Failed sends are exempt: their temp row backs the retry UI.
    private func sweepUnmatchedTempMessages(sessionId: String) {
        let unmatched = messages
            .filter { $0.id < 0 && !failedMessageIds.contains($0.id) }
            .map(\.id)

        // Forget bookkeeping for temps that have since been reconciled away.
        tempReconcilePasses = tempReconcilePasses.filter { unmatched.contains($0.key) }

        guard !unmatched.isEmpty else { return }

        var stale = Set<Int>()
        for id in unmatched {
            let passes = (tempReconcilePasses[id] ?? 0) + 1
            tempReconcilePasses[id] = passes
            if passes > 1 { stale.insert(id) }
        }

        if !stale.isEmpty {
            messages.removeAll { stale.contains($0.id) }
            for id in stale { tempReconcilePasses.removeValue(forKey: id) }
        } else {
            // Give the server one more chance to catch up before dropping.
            scheduleReconcile(sessionId: sessionId, delay: .seconds(3))
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
