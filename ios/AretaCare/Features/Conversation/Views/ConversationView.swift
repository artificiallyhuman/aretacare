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
    @State private var showingAttachSheet = false
    @State private var scrollToBottom = false
    @State private var showScrollToBottomButton = false
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

    private var currentUserId: String {
        AuthManager.shared.currentUser?.id ?? ""
    }

    private var currentSessionId: String? {
        sessionVM.currentSession?.id
    }

    var body: some View {
        VStack(spacing: 0) {
            if let error = conversationVM.errorMessage {
                ErrorBannerView(message: error) {
                    conversationVM.dismissError()
                }
                .padding(.top, 4)
            }

            messageList

            if conversationVM.isSending {
                typingIndicator
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
                    hasMessages: !conversationVM.messages.isEmpty,
                    onSend: sendMessage,
                    onAttach: { showingAttachSheet = true },
                    onMicrophone: { startAudioRecording() }
                )
            }
        }
        .overlay(alignment: .top) {
            if showCopiedToast {
                Text("Copied")
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                    .background(Capsule().fill(.black.opacity(0.75)))
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .padding(.top, 8)
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
        .sensoryFeedback(.success, trigger: copyHapticTrigger)
        .sensoryFeedback(.success, trigger: sendHapticTrigger)
        .sensoryFeedback(.impact(flexibility: .rigid), trigger: resetHapticTrigger)
        .animation(.easeInOut(duration: 0.2), value: showCopiedToast)
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
        .confirmationDialog("Add Attachment", isPresented: $showingAttachSheet, titleVisibility: .visible) {
            Button("Take Photo") { showingCamera = true }
            Button("Choose Photo") { showingPhotoPicker = true }
            Button("Choose File") { showingFilePicker = true }
            Button("Cancel", role: .cancel) {}
        }
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
        .alert("Reset Conversation", isPresented: $showResetConfirmation) {
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
        .task {
            await sessionVM.fetchSessions()
            if let sessionId = currentSessionId {
                await conversationVM.fetchHistory(sessionId: sessionId)
            }
        }
        .onChange(of: sessionVM.currentSession?.id) { _, newId in
            guard let newId else { return }
            conversationVM.clearMessages()
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

                        ForEach(conversationVM.messages) { message in
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
                            .onAppear { showScrollToBottomButton = false }
                            .onDisappear { showScrollToBottomButton = true }
                    }
                    .padding(.vertical, 8)
                }
                .scrollDismissesKeyboard(.interactively)
                .overlay(alignment: .bottomTrailing) {
                    if showScrollToBottomButton {
                        Button {
                            scrollToLatest(proxy: proxy)
                        } label: {
                            Image(systemName: "arrow.down")
                                .font(.body.weight(.semibold))
                                .foregroundStyle(.white)
                                .frame(width: 36, height: 36)
                                .background(Circle().fill(Color.accentColor))
                                .shadow(radius: 4)
                        }
                        .padding(.trailing, 12)
                        .padding(.bottom, 8)
                        .transition(.scale.combined(with: .opacity))
                    }
                }
                .animation(.easeInOut(duration: 0.2), value: showScrollToBottomButton)
                .refreshable {
                    if let sessionId = currentSessionId {
                        await conversationVM.fetchHistory(sessionId: sessionId, forceRefresh: true)
                    }
                }
                .onChange(of: conversationVM.messages.count) { _, _ in
                    scrollToLatest(proxy: proxy)
                }
                .onChange(of: scrollToBottom) { _, _ in
                    scrollToLatest(proxy: proxy)
                }
                .onAppear {
                    scrollToLatest(proxy: proxy)
                }
            }
        }
    }

    // MARK: - Typing Indicator

    private var typingIndicator: some View {
        HStack {
            HStack(spacing: 4) {
                ForEach(0..<3, id: \.self) { i in
                    Circle()
                        .fill(Color.secondary)
                        .frame(width: 6, height: 6)
                        .offset(y: conversationVM.isSending ? -4 : 0)
                        .animation(
                            .easeInOut(duration: 0.4)
                            .repeatForever(autoreverses: true)
                            .delay(Double(i) * 0.15),
                            value: conversationVM.isSending
                        )
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
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
        messageText = ""
        sendHapticTrigger += 1
        guard let sessionId = currentSessionId else { return }
        Task {
            await conversationVM.sendMessage(text: text, sessionId: sessionId)
            scrollToBottom.toggle()
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
        guard let lastId = conversationVM.messages.last?.id else { return }
        withAnimation(.easeOut(duration: 0.2)) {
            proxy.scrollTo(lastId, anchor: .bottom)
        }
    }

    // MARK: - Attachment Handling

    private func handleCameraImage(_ image: UIImage) {
        guard let sessionId = currentSessionId,
              let data = image.jpegData(compressionQuality: 0.85) else { return }
        let filename = "photo_\(Date().apiDateString).jpg"
        uploadAttachment(sessionId: sessionId, data: data, filename: filename, contentType: "image/jpeg")
    }

    private func handlePhotoSelection(_ items: [PhotosPickerItem]) {
        guard let item = items.first else { return }
        selectedPhotoItems = []

        Task {
            if let data = try? await item.loadTransferable(type: Data.self),
               let sessionId = currentSessionId {
                let filename = "photo_\(Date().apiDateString).jpg"
                uploadAttachment(sessionId: sessionId, data: data, filename: filename, contentType: "image/jpeg")
            }
        }
    }

    private func handleFileImport(_ result: Result<[URL], Error>) {
        switch result {
        case .success(let urls):
            guard let url = urls.first else { return }
            guard url.startAccessingSecurityScopedResource() else { return }
            defer { url.stopAccessingSecurityScopedResource() }

            guard let data = try? Data(contentsOf: url),
                  let sessionId = currentSessionId else { return }
            let filename = url.lastPathComponent
            let contentType = mimeType(for: url.pathExtension)
            uploadAttachment(sessionId: sessionId, data: data, filename: filename, contentType: contentType)

        case .failure:
            break
        }
    }

    private func uploadAttachment(sessionId: String, data: Data, filename: String, contentType: String) {
        Task {
            if let response = await documentsVM.uploadDocument(
                sessionId: sessionId,
                fileData: data,
                filename: filename,
                contentType: contentType
            ) {
                // Send a document message in the conversation
                let messageType = contentType.hasPrefix("image/") ? "image" : "document"
                await conversationVM.sendDocumentMessage(
                    sessionId: sessionId,
                    documentId: response.id,
                    filename: filename,
                    messageType: messageType
                )
                scrollToBottom.toggle()
            }
        }
    }

    private func mimeType(for ext: String) -> String {
        switch ext.lowercased() {
        case "pdf": return "application/pdf"
        case "jpg", "jpeg": return "image/jpeg"
        case "png": return "image/png"
        case "txt": return "text/plain"
        default: return "application/octet-stream"
        }
    }
}

// MARK: - Camera Picker

private struct CameraPickerView: UIViewControllerRepresentable {
    let onCapture: (UIImage) -> Void

    @Environment(\.dismiss) private var dismiss

    func makeCoordinator() -> Coordinator {
        Coordinator(onCapture: onCapture, dismiss: dismiss)
    }

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

    class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let onCapture: (UIImage) -> Void
        let dismiss: DismissAction

        init(onCapture: @escaping (UIImage) -> Void, dismiss: DismissAction) {
            self.onCapture = onCapture
            self.dismiss = dismiss
        }

        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let image = info[.originalImage] as? UIImage {
                onCapture(image)
            }
            dismiss()
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            dismiss()
        }
    }
}

#Preview {
    ConversationView(sessionVM: SessionViewModel())
}
