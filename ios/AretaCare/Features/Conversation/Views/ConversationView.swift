import SwiftUI
import PhotosUI
import UniformTypeIdentifiers

struct ConversationView: View {
    @State private var conversationVM = ConversationViewModel()
    @State private var documentsVM = DocumentsViewModel()
    @Bindable var sessionVM: SessionViewModel

    @Environment(\.colorScheme) private var colorScheme

    @State private var messageText = ""
    @State private var showingSessionSwitcher = false
    @State private var showingCollaboration = false
    @State private var isNearBottom = true
    @State private var editingMessage: MessageResponse?
    @State private var editText = ""
    // Haptic feedback
    @State private var showCopiedToast = false
    @State private var copyHapticTrigger = 0
    @State private var sendHapticTrigger = 0
    @State private var resetHapticTrigger = 0

    // Network monitor for auto-retry
    private let networkMonitor = NetworkMonitor.shared

    // Audio recording state
    @State private var isRecordingAudio = false
    @State private var audioRecorder = AudioRecorderManager()
    @State private var showingMicPermissionAlert = false

    // Attachment state
    @State private var showingCamera = false
    @State private var showingPhotoPicker = false
    @State private var showingFilePicker = false
    @State private var selectedPhotoItems: [PhotosPickerItem] = []
    @State private var pendingAttachment: PendingAttachment?
    @State private var showFileSizeAlert = false

    private var currentUserId: String {
        AuthManager.shared.currentUser?.id ?? ""
    }

    private var currentSessionId: String? {
        sessionVM.currentSession?.id
    }

    var body: some View {
        conversationContent
            .overlay(alignment: .top) { copiedToast }
            .sensoryFeedback(.success, trigger: copyHapticTrigger)
            .sensoryFeedback(.success, trigger: sendHapticTrigger)
            .sensoryFeedback(.impact(flexibility: .rigid), trigger: resetHapticTrigger)
            .sessionBackground(
                colorKey: sessionVM.currentSession?.colorKey,
                colorScheme: colorScheme
            )
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    Text(sessionVM.currentSession?.name ?? "Chat")
                        .font(.headline)
                }
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        showingSessionSwitcher = true
                    } label: {
                        Image(systemName: "list.bullet")
                    }
                    .accessibilityLabel("Switch care session")
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showingCollaboration = true
                    } label: {
                        Image(systemName: "person.2")
                    }
                    .disabled(sessionVM.currentSession == nil)
                    .accessibilityLabel("Collaborators")
                }
            }
            .sheet(isPresented: $showingSessionSwitcher) {
                SessionSwitcherView(sessionVM: sessionVM)
            }
            .sheet(isPresented: $showingCollaboration) {
                if let session = sessionVM.currentSession {
                    NavigationStack {
                        CollaborationView(session: session)
                    }
                }
            }
            .modifier(ConversationSheetsModifier(
                showingCamera: $showingCamera,
                showingPhotoPicker: $showingPhotoPicker,
                showingFilePicker: $showingFilePicker,
                selectedPhotoItems: $selectedPhotoItems,
                showingMicPermissionAlert: $showingMicPermissionAlert,
                showFileSizeAlert: $showFileSizeAlert,
                handleCameraImage: handleCameraImage,
                handlePhotoSelection: handlePhotoSelection,
                handleFileImport: handleFileImport
            ))
            .task {
                if let sessionId = currentSessionId {
                    await conversationVM.fetchHistory(sessionId: sessionId)
                }
            }
            .onChange(of: sessionVM.currentSession?.id) { _, newId in
                guard let newId else { return }
                conversationVM.clearMessages()
                isNearBottom = true
                Task {
                    await conversationVM.fetchHistory(sessionId: newId)
                }
            }
            // Poll for new messages from collaborators every 10 seconds
            .task(id: currentSessionId) {
                guard let sessionId = currentSessionId,
                      !(sessionVM.currentSession?.collaborators.isEmpty ?? true) else { return }
                while !Task.isCancelled {
                    try? await Task.sleep(for: .seconds(10))
                    guard !Task.isCancelled else { break }
                    await conversationVM.pollForNewMessages(sessionId: sessionId)
                }
            }
            .onChange(of: networkMonitor.isConnected) { wasConnected, isConnected in
                if !wasConnected && isConnected && !conversationVM.failedMessageIds.isEmpty {
                    guard let sessionId = currentSessionId else { return }
                    Task {
                        await conversationVM.retryAllFailed(sessionId: sessionId)
                    }
                }
            }
    }

    // MARK: - Extracted Views (type-checker workaround)

    private var conversationContent: some View {
        VStack(spacing: 0) {
            if let error = conversationVM.errorMessage {
                ErrorBannerView(message: error) {
                    conversationVM.dismissError()
                }
                .padding(.top, 4)
            }

            if let error = documentsVM.errorMessage {
                ErrorBannerView(message: error) {
                    documentsVM.dismissError()
                }
                .padding(.top, 4)
            }

            messageList

            // Upload indicator — outside messageList so it shows even in empty sessions
            if documentsVM.isUploading {
                HStack {
                    HStack(spacing: 8) {
                        ProgressView()
                            .controlSize(.small)
                        Text("Uploading...")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(Color(.systemGray6))
                    .clipShape(RoundedRectangle(cornerRadius: 18))
                    Spacer()
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 4)
            }

            if isRecordingAudio {
                ConversationAudioRecorderView(
                    recorder: audioRecorder,
                    onCancel: {
                        isRecordingAudio = false
                    },
                    onStop: { audioData in
                        isRecordingAudio = false
                        guard let sessionId = currentSessionId else { return false }
                        return await conversationVM.uploadAudioMessage(data: audioData, sessionId: sessionId)
                    }
                )
            } else {
                MessageInputView(
                    text: $messageText,
                    isSending: conversationVM.isSending,
                    isUploading: documentsVM.isUploading,
                    hasMessages: !conversationVM.messages.isEmpty,
                    pendingAttachment: pendingAttachment,
                    onSend: sendMessage,
                    onTakePhoto: { showingCamera = true },
                    onChoosePhoto: { showingPhotoPicker = true },
                    onChooseFile: { showingFilePicker = true },
                    onMicrophone: { startAudioRecording() },
                    onRemoveAttachment: { pendingAttachment = nil }
                )
            }
        }
    }

    @ViewBuilder
    private var copiedToast: some View {
        if showCopiedToast {
            Text("Copied")
                .font(.subheadline.weight(.medium))
                .foregroundStyle(.white)
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .background(Capsule().fill(.black.opacity(0.75)))
                .transition(.move(edge: .top).combined(with: .opacity))
                .padding(.top, 8)
                .accessibilityLabel("Copied to clipboard")
                .onAppear {
                    Task {
                        try? await Task.sleep(for: .seconds(1.5))
                        withAnimation(.easeOut(duration: 0.3)) {
                            showCopiedToast = false
                        }
                    }
                }
        }
    }

    // MARK: - Message List
    //
    // Uses a regular VStack (not LazyVStack) with defaultScrollAnchor(.bottom)
    // so the view starts at the newest messages. A regular VStack ensures all
    // child views exist immediately, so ScrollViewReader.scrollTo always finds
    // its target (LazyVStack caused blank screens because the target wasn't
    // materialized yet).

    @ViewBuilder
    private var messageList: some View {
        if conversationVM.isLoading && conversationVM.messages.isEmpty {
            SkeletonConversationView()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if conversationVM.messages.isEmpty {
            ConversationOnboardingView()
        } else {
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(spacing: 8) {
                        // Load earlier messages — top of scroll content
                        if conversationVM.hasMore {
                            Button {
                                Task {
                                    if let sessionId = currentSessionId {
                                        await conversationVM.fetchHistory(
                                            sessionId: sessionId,
                                            loadMore: true
                                        )
                                    }
                                }
                            } label: {
                                if conversationVM.isLoading {
                                    ProgressView()
                                        .padding()
                                } else {
                                    Text("Load earlier messages")
                                        .font(.footnote)
                                        .foregroundStyle(.secondary)
                                        .padding()
                                }
                            }
                            .disabled(conversationVM.isLoading)
                        }

                        // Messages in chronological order
                        ForEach(conversationVM.messages, id: \.id) { message in
                            VStack(spacing: 0) {
                                // Date header above message
                                if dateHeaderMessageIds.contains(message.id) {
                                    Text(message.createdAt.chatDateLabel)
                                        .font(.caption2.weight(.medium))
                                        .foregroundStyle(.secondary)
                                        .padding(.horizontal, 12)
                                        .padding(.vertical, 4)
                                        .background(Color(.systemGray5).opacity(0.8))
                                        .clipShape(Capsule())
                                        .frame(maxWidth: .infinity)
                                        .padding(.vertical, 8)
                                }

                                if editingMessage?.id == message.id {
                                    VStack(spacing: 8) {
                                        TextEditor(text: $editText)
                                            .frame(minHeight: 60, maxHeight: 150)
                                            .padding(8)
                                            .background(Color(.systemGray6))
                                            .clipShape(RoundedRectangle(cornerRadius: 12))
                                            .padding(.horizontal, 12)

                                        HStack {
                                            Button("Cancel") {
                                                editingMessage = nil
                                                editText = ""
                                            }
                                            .foregroundStyle(.secondary)

                                            Spacer()

                                            Button("Save") {
                                                let msgId = message.id
                                                let text = editText
                                                editingMessage = nil
                                                editText = ""
                                                Task {
                                                    if let sessionId = currentSessionId {
                                                        await conversationVM.editMessage(messageId: msgId, content: text, sessionId: sessionId)
                                                    }
                                                }
                                            }
                                            .fontWeight(.semibold)
                                            .disabled(editText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                                        }
                                        .padding(.horizontal, 16)
                                    }
                                } else {
                                    MessageBubbleView(
                                        message: message,
                                        currentUserId: currentUserId,
                                        isFailed: conversationVM.isMessageFailed(message.id),
                                        onEdit: { msg in
                                            editText = msg.content
                                            editingMessage = msg
                                        },
                                        onCopy: { _ in
                                            withAnimation(.snappy(duration: 0.25)) {
                                                showCopiedToast = true
                                            }
                                            copyHapticTrigger += 1
                                        },
                                        onReset: { msg in
                                            resetHapticTrigger += 1
                                            guard let sessionId = currentSessionId else { return }
                                            Task {
                                                await conversationVM.resetConversation(messageId: msg.id, sessionId: sessionId)
                                            }
                                        },
                                        onRetry: { msg in
                                            guard let sessionId = currentSessionId else { return }
                                            Task {
                                                await conversationVM.retryMessage(messageId: msg.id, sessionId: sessionId)
                                            }
                                        }
                                    )
                                }
                            }
                            .id("msg-\(message.id)")
                        }

                        // Typing indicator
                        if conversationVM.isSending {
                            TypingBubbleView()
                                .padding(.horizontal, 12)
                                .padding(.bottom, 4)
                        }

                        // Bottom anchor
                        Color.clear.frame(height: 1)
                            .id("bottom")
                            .onAppear {
                                isNearBottom = true
                                // Reload latest messages if older-message loading trimmed the newest
                                if conversationVM.hasNewerTrimmed, let sid = currentSessionId {
                                    Task { await conversationVM.reloadLatestIfNeeded(sessionId: sid) }
                                }
                            }
                            .onDisappear {
                                guard !conversationVM.messages.isEmpty else { return }
                                isNearBottom = false
                            }
                    }
                    .padding(.vertical, 8)
                }
                .defaultScrollAnchor(.bottom)
                .scrollDismissesKeyboard(.immediately)
                // Scroll to bottom when a new message arrives (last message ID changes)
                .onChange(of: conversationVM.messages.last?.id) { _, newId in
                    guard newId != nil, isNearBottom else { return }
                    withAnimation(.easeOut(duration: 0.2)) {
                        proxy.scrollTo("bottom", anchor: .bottom)
                    }
                }
                // Scroll to bottom when AI starts responding (typing indicator)
                .onChange(of: conversationVM.isSending) { _, isSending in
                    if isSending && isNearBottom {
                        withAnimation(.easeOut(duration: 0.2)) {
                            proxy.scrollTo("bottom", anchor: .bottom)
                        }
                    }
                }
            }
        }
    }

    // MARK: - Actions

    private func sendMessage() {
        let text = messageText
        let attachment = pendingAttachment
        pendingAttachment = nil
        sendHapticTrigger += 1
        isNearBottom = true
        // Clear text on next run loop — by then MessageInputView.performSend()
        // has dismissed focus, so the TextField binding syncs correctly.
        Task { @MainActor in
            messageText = ""
        }
        guard let sessionId = currentSessionId else { return }

        if let attachment {
            Task {
                // Background task covers the full flow: upload + send message
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

                if let response = await documentsVM.uploadDocument(
                    sessionId: sessionId,
                    fileData: attachment.data,
                    filename: attachment.filename,
                    contentType: attachment.contentType,
                    skipJournalSynthesis: true
                ) {
                    let messageType = attachment.contentType.hasPrefix("image/") ? "image" : "document"
                    let content = text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : text
                    await conversationVM.sendDocumentMessage(
                        sessionId: sessionId,
                        documentId: response.id,
                        filename: attachment.filename,
                        messageType: messageType,
                        mediaUrl: response.mediaUrl,
                        thumbnailUrl: response.thumbnailUrl,
                        content: content
                    )
                }
            }
        } else {
            Task {
                await conversationVM.sendMessage(text: text, sessionId: sessionId)
            }
        }
    }

    private func startAudioRecording() {
        Task {
            let granted = await audioRecorder.requestPermission()
            if granted {
                isRecordingAudio = true
                audioRecorder.start(maxDuration: AppConstants.maxRecordingDuration) {
                    // Auto-stop and upload on max duration
                    guard let audioData = audioRecorder.stop() else { return }
                    isRecordingAudio = false
                    guard let sessionId = currentSessionId else { return }
                    Task {
                        await conversationVM.uploadAudioMessage(data: audioData, sessionId: sessionId)
                    }
                }
            } else {
                showingMicPermissionAlert = true
            }
        }
    }

    /// IDs of messages that should display a date header.
    /// Pre-computed outside ForEach to avoid index-based array access in closures,
    /// which can crash when SwiftUI's lazy evaluation races with array mutations.
    private var dateHeaderMessageIds: Set<Int> {
        var ids = Set<Int>()
        let msgs = conversationVM.messages
        for i in msgs.indices {
            if i == 0 || !Calendar.current.isDate(msgs[i].createdAt, inSameDayAs: msgs[i - 1].createdAt) {
                ids.insert(msgs[i].id)
            }
        }
        return ids
    }

    // MARK: - Attachment Handling

    private func handleCameraImage(_ image: UIImage) {
        guard let data = image.jpegData(compressionQuality: 0.85) else { return }
        if data.count > AppConstants.maxFileSizeBytes {
            showFileSizeAlert = true
            return
        }
        let filename = "photo_\(Date().apiDateString).jpg"
        pendingAttachment = PendingAttachment(data: data, filename: filename, contentType: "image/jpeg")
    }

    private func handlePhotoSelection(_ items: [PhotosPickerItem]) {
        guard let item = items.first else { return }
        selectedPhotoItems = []

        Task {
            // Re-encodes HEIC/TIFF/etc. to JPEG — the backend only accepts JPEG/PNG
            if let image = await item.loadUploadableImage() {
                if image.data.count > AppConstants.maxFileSizeBytes {
                    showFileSizeAlert = true
                    return
                }
                let filename = "photo_\(Date().apiDateString).\(image.ext)"
                pendingAttachment = PendingAttachment(data: image.data, filename: filename, contentType: image.contentType)
            }
        }
    }

    private func handleFileImport(_ result: Result<[URL], Error>) {
        switch result {
        case .success(let urls):
            guard let url = urls.first else { return }
            let filename = url.lastPathComponent
            let contentType = url.pathExtension.mimeTypeForExtension

            // Reading up to 30 MB — potentially from an iCloud-backed URL that
            // has to be materialised first — must not run on the main actor.
            Task {
                let data = await Task.detached(priority: .userInitiated) { () -> Data? in
                    guard url.startAccessingSecurityScopedResource() else { return nil }
                    defer { url.stopAccessingSecurityScopedResource() }
                    guard let mapped = try? Data(contentsOf: url, options: [.mappedIfSafe]) else { return nil }
                    // Copy off the mapping before relinquishing access to the
                    // provider's file — the upload reads these bytes much later.
                    return Data(mapped)
                }.value

                guard let data else { return }
                if data.count > AppConstants.maxFileSizeBytes {
                    showFileSizeAlert = true
                    return
                }
                pendingAttachment = PendingAttachment(data: data, filename: filename, contentType: contentType)
            }

        case .failure:
            break
        }
    }

}

// MARK: - Sheets & Alerts Modifier (extracted for type-checker)

private struct ConversationSheetsModifier: ViewModifier {
    @Binding var showingCamera: Bool
    @Binding var showingPhotoPicker: Bool
    @Binding var showingFilePicker: Bool
    @Binding var selectedPhotoItems: [PhotosPickerItem]
    @Binding var showingMicPermissionAlert: Bool
    @Binding var showFileSizeAlert: Bool
    let handleCameraImage: (UIImage) -> Void
    let handlePhotoSelection: ([PhotosPickerItem]) -> Void
    let handleFileImport: (Result<[URL], Error>) -> Void

    func body(content: Content) -> some View {
        content
            .fullScreenCover(isPresented: $showingCamera) {
                CameraPickerView { image in
                    handleCameraImage(image)
                }
                .ignoresSafeArea()
            }
            .photosPicker(isPresented: $showingPhotoPicker, selection: $selectedPhotoItems, maxSelectionCount: 1, matching: .images)
            .onChange(of: selectedPhotoItems) { _, items in
                handlePhotoSelection(items)
            }
            .fileImporter(isPresented: $showingFilePicker, allowedContentTypes: [.pdf, .plainText, .jpeg, .png], allowsMultipleSelection: false) { result in
                handleFileImport(result)
            }
            .alert("Microphone Access Required", isPresented: $showingMicPermissionAlert) {
                Button("Open Settings") {
                    if let url = URL(string: UIApplication.openSettingsURLString) {
                        UIApplication.shared.open(url)
                    }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("Please allow microphone access in Settings to record voice messages.")
            }
            .alert("File Too Large", isPresented: $showFileSizeAlert) {
                Button("OK", role: .cancel) {}
            } message: {
                Text("File too large. Maximum file size is 30 MB.")
            }
    }
}

#Preview {
    ConversationView(sessionVM: SessionViewModel())
}
