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
    @State private var scrollToBottom = false
    @State private var showScrollToBottomButton = false
    @State private var messageCountWhenScrolledAway = 0
    @State private var bottomAnchorHasAppeared = false
    @State private var editingMessage: MessageResponse?
    @State private var editText = ""
    @State private var showResetConfirmation = false
    @State private var resetMessage: MessageResponse?

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
            .animation(.snappy(duration: 0.25), value: showCopiedToast)
            .sessionBackground(
                colorKey: sessionVM.currentSession?.colorKey,
                colorScheme: colorScheme
            )
            .navigationTitle(sessionVM.currentSession?.name ?? "Chat")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        showingSessionSwitcher = true
                    } label: {
                        Image(systemName: "list.bullet")
                    }
                }
            }
            .sheet(isPresented: $showingSessionSwitcher) {
                SessionSwitcherView(sessionVM: sessionVM)
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
            .confirmationDialog("Reset Conversation", isPresented: $showResetConfirmation, titleVisibility: .visible) {
                Button("Reset", role: .destructive) {
                    if let msg = resetMessage, let sessionId = currentSessionId {
                        resetHapticTrigger += 1
                        Task {
                            await conversationVM.resetConversation(messageId: msg.id, sessionId: sessionId)
                        }
                    }
                }
                Button("Cancel", role: .cancel) {
                    resetMessage = nil
                }
            } message: {
                Text("All messages after this point will be permanently deleted. This cannot be undone.")
            }
            .task {
                if let sessionId = currentSessionId {
                    await conversationVM.fetchHistory(sessionId: sessionId)
                }
            }
            .onChange(of: sessionVM.currentSession?.id) { _, newId in
                guard let newId else { return }
                conversationVM.clearMessages()
                showScrollToBottomButton = false
                bottomAnchorHasAppeared = false
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

            if documentsVM.isUploading {
                uploadIndicator
            }

            if conversationVM.isSending {
                TypingBubbleView()
                    .padding(.horizontal, 12)
                    .padding(.bottom, 4)
            }

            if isRecordingAudio {
                ConversationAudioRecorderView(
                    recorder: audioRecorder,
                    onCancel: {
                        isRecordingAudio = false
                    },
                    onStop: { audioData in
                        isRecordingAudio = false
                        guard let sessionId = currentSessionId else { return }
                        Task {
                            await conversationVM.uploadAudioMessage(data: audioData, sessionId: sessionId)
                            scrollToBottom.toggle()
                        }
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
                    LazyVStack(spacing: 8) {
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

                        ForEach(Array(conversationVM.messages.enumerated()), id: \.element.id) { index, message in
                            // Date separator
                            if index == 0 || !Calendar.current.isDate(message.createdAt, inSameDayAs: conversationVM.messages[index - 1].createdAt) {
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
                                // Inline edit mode
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
                                        showCopiedToast = true
                                        copyHapticTrigger += 1
                                    },
                                    onReset: { msg in
                                        resetMessage = msg
                                        showResetConfirmation = true
                                    },
                                    onRetry: { msg in
                                        guard let sessionId = currentSessionId else { return }
                                        Task {
                                            await conversationVM.retryMessage(messageId: msg.id, sessionId: sessionId)
                                        }
                                    }
                                )
                                .id(message.id)
                            }
                        }

                        // Bottom anchor for scroll position tracking
                        Color.clear.frame(height: 1)
                            .id("scroll-bottom")
                            .onAppear {
                                bottomAnchorHasAppeared = true
                                showScrollToBottomButton = false
                                messageCountWhenScrolledAway = 0
                            }
                            .onDisappear {
                                showScrollToBottomButton = true
                                messageCountWhenScrolledAway = conversationVM.messages.count
                            }
                    }
                    .padding(.vertical, 8)
                }
                .scrollDismissesKeyboard(.immediately)
                .overlay(alignment: .bottomTrailing) {
                    if showScrollToBottomButton {
                        let newMessageCount = max(conversationVM.messages.count - messageCountWhenScrolledAway, 0)

                        Button {
                            scrollToLatest(proxy: proxy)
                        } label: {
                            Image(systemName: "arrow.down")
                                .font(.body.weight(.semibold))
                                .foregroundStyle(.white)
                                .frame(width: 36, height: 36)
                                .background(Circle().fill(Color.accentColor))
                                .shadow(color: .black.opacity(0.15), radius: 6, y: 3)
                                .overlay(alignment: .topTrailing) {
                                    if newMessageCount > 0 {
                                        Text("\(newMessageCount)")
                                            .font(.caption2.weight(.bold))
                                            .foregroundStyle(.white)
                                            .frame(minWidth: 18, minHeight: 18)
                                            .background(Circle().fill(.red))
                                            .offset(x: 6, y: -6)
                                    }
                                }
                        }
                        .accessibilityLabel("Scroll to latest message\(newMessageCount > 0 ? ", \(newMessageCount) new" : "")")
                        .padding(.trailing, 12)
                        .padding(.bottom, 8)
                        .transition(.scale.combined(with: .opacity))
                    }
                }
                .animation(.spring(duration: 0.3), value: showScrollToBottomButton)
                .refreshable {
                    if let sessionId = currentSessionId {
                        await conversationVM.fetchHistory(sessionId: sessionId, forceRefresh: true)
                    }
                }
                .onChange(of: conversationVM.messages.count) { _, _ in
                    if !showScrollToBottomButton {
                        scrollToLatest(proxy: proxy)
                    }
                }
                .onChange(of: scrollToBottom) { _, _ in
                    scrollToLatest(proxy: proxy)
                }
                .onAppear {
                    bottomAnchorHasAppeared = false
                    Task {
                        try? await Task.sleep(for: .milliseconds(100))
                        scrollToLatest(proxy: proxy)
                        // Fallback: if scroll didn't reach the bottom anchor, show button
                        try? await Task.sleep(for: .milliseconds(400))
                        if !bottomAnchorHasAppeared && !conversationVM.messages.isEmpty {
                            withAnimation(.spring(duration: 0.3)) {
                                showScrollToBottomButton = true
                            }
                            messageCountWhenScrolledAway = conversationVM.messages.count
                        }
                    }
                }
            }
        }
    }

    // MARK: - Upload Indicator

    private var uploadIndicator: some View {
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
        .padding(.bottom, 4)
    }

    // MARK: - Actions

    private func sendMessage() {
        let text = messageText
        let attachment = pendingAttachment
        pendingAttachment = nil
        sendHapticTrigger += 1
        // Clear text on next run loop — by then MessageInputView.performSend()
        // has dismissed focus, so the TextField binding syncs correctly.
        Task { @MainActor in
            messageText = ""
        }
        guard let sessionId = currentSessionId else { return }

        if let attachment {
            Task {
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
                    scrollToBottom.toggle()
                }
            }
        } else {
            Task {
                await conversationVM.sendMessage(text: text, sessionId: sessionId)
                scrollToBottom.toggle()
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
                        scrollToBottom.toggle()
                    }
                }
            } else {
                showingMicPermissionAlert = true
            }
        }
    }

    private func scrollToLatest(proxy: ScrollViewProxy) {
        guard !conversationVM.messages.isEmpty else { return }
        withAnimation(.easeOut(duration: 0.2)) {
            proxy.scrollTo("scroll-bottom", anchor: .bottom)
        }
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
            if let data = try? await item.loadTransferable(type: Data.self) {
                if data.count > AppConstants.maxFileSizeBytes {
                    showFileSizeAlert = true
                    return
                }
                let ext: String
                let contentType: String
                if let type = item.supportedContentTypes.first,
                   let detectedExt = type.preferredFilenameExtension,
                   let detectedMime = type.preferredMIMEType {
                    ext = detectedExt
                    contentType = detectedMime
                } else {
                    ext = "jpg"
                    contentType = "image/jpeg"
                }
                let filename = "photo_\(Date().apiDateString).\(ext)"
                pendingAttachment = PendingAttachment(data: data, filename: filename, contentType: contentType)
            }
        }
    }

    private func handleFileImport(_ result: Result<[URL], Error>) {
        switch result {
        case .success(let urls):
            guard let url = urls.first else { return }
            guard url.startAccessingSecurityScopedResource() else { return }
            defer { url.stopAccessingSecurityScopedResource() }

            guard let data = try? Data(contentsOf: url) else { return }
            if data.count > AppConstants.maxFileSizeBytes {
                showFileSizeAlert = true
                return
            }
            let filename = url.lastPathComponent
            let contentType = url.pathExtension.mimeTypeForExtension
            pendingAttachment = PendingAttachment(data: data, filename: filename, contentType: contentType)

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
