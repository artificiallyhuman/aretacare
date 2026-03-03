import SwiftUI
import AVFoundation

struct MessageBubbleView: View {
    let message: MessageResponse
    let currentUserId: String
    var isFailed: Bool = false
    var onEdit: ((MessageResponse) -> Void)?
    var onCopy: ((String) -> Void)?
    var onReset: ((MessageResponse) -> Void)?
    var onRetry: ((MessageResponse) -> Void)?

    @State private var showTimestamp = false
    @State private var audioPlayer: AVPlayer?
    @State private var isPlayingAudio = false
    @State private var playbackObserver: NSObjectProtocol?

    private var isUser: Bool { message.role == .user }

    var body: some View {
        HStack(alignment: .bottom, spacing: 6) {
            if isUser { Spacer(minLength: 48) }

            // Source tag for collaborator messages
            if !isUser, let sourceTag = message.lastEditedBy ?? message.createdBy {
                SourceTagView(sourceTag: sourceTag, currentUserId: currentUserId)
            }

            VStack(alignment: isUser ? .trailing : .leading, spacing: 4) {
                HStack(alignment: .bottom, spacing: 4) {
                    if isFailed && isUser {
                        failedIndicator
                    }

                    bubbleContent
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .background(failedOrNormalBackground)
                        .clipShape(RoundedRectangle(cornerRadius: 18))
                }

                if isFailed {
                    Button {
                        onRetry?(message)
                    } label: {
                        Text("Tap to retry")
                            .font(.caption2.weight(.medium))
                            .foregroundStyle(.red)
                    }
                }

                if let updatedAt = message.updatedAt, updatedAt != message.createdAt {
                    Text("(edited)")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }

                if showTimestamp {
                    Text(message.createdAt.timeString)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .transition(.opacity.combined(with: .scale(scale: 0.9)))
                }
            }
            .onTapGesture {
                if isFailed {
                    onRetry?(message)
                } else {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        showTimestamp.toggle()
                    }
                }
            }
            .contextMenu {
                Button {
                    copyFormatted(message.content)
                    onCopy?(message.content)
                } label: {
                    Label("Copy", systemImage: "doc.on.doc")
                }

                if isUser {
                    Button {
                        onEdit?(message)
                    } label: {
                        Label("Edit", systemImage: "pencil")
                    }
                }

                Button(role: .destructive) {
                    onReset?(message)
                } label: {
                    Label("Reset from Here", systemImage: "arrow.uturn.backward")
                }
            }

            // Source tag for user messages from collaborators
            if isUser, let sourceTag = message.lastEditedBy ?? message.createdBy {
                SourceTagView(sourceTag: sourceTag, currentUserId: currentUserId)
            }

            if !isUser { Spacer(minLength: 48) }
        }
        .padding(.horizontal, 12)
    }

    // MARK: - Bubble Content

    @ViewBuilder
    private var bubbleContent: some View {
        switch message.messageType {
        case .document:
            documentContent
        case .audio:
            audioContent
        case .image:
            imageContent
        default:
            textContent
        }
    }

    @ViewBuilder
    private var textContent: some View {
        MarkdownTextView(content: message.content, isUserBubble: isUser)
    }

    @ViewBuilder
    private var documentContent: some View {
        if message.documentId == nil {
            // Document was deleted
            HStack(spacing: 8) {
                Image(systemName: "doc.fill")
                    .font(.title3)
                    .foregroundStyle(.secondary)
                Text("Document Deleted")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .italic()
            }
        } else {
            VStack(alignment: .leading, spacing: 6) {
                if let thumbnailUrl = message.thumbnailUrl, let url = URL(string: thumbnailUrl) {
                    CachedAsyncImage(url: url) { image in
                        image
                            .resizable()
                            .scaledToFit()
                            .frame(maxHeight: 80)
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                    } placeholder: {
                        Color(.systemGray5)
                            .frame(width: 80, height: 60)
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                            .overlay { ProgressView() }
                    } failure: {
                        RoundedRectangle(cornerRadius: 8)
                            .fill(Color(.systemGray5))
                            .frame(width: 80, height: 60)
                            .overlay {
                                Image(systemName: "doc.fill")
                                    .foregroundStyle(.secondary)
                            }
                    }
                    .accessibilityHidden(true)
                }

                HStack(spacing: 8) {
                    Image(systemName: "doc.fill")
                        .font(.title3)
                        .foregroundStyle(isUser ? .white.opacity(0.9) : Color.accentColor)
                    Text(documentFilename)
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(isUser ? .white : .primary)
                        .lineLimit(2)
                }
                if !message.content.isEmpty {
                    Text(message.content)
                        .font(.footnote)
                        .foregroundStyle(isUser ? .white.opacity(0.85) : .secondary)
                        .lineLimit(3)
                }
            }
        }
    }

    @ViewBuilder
    private var audioContent: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 10) {
                if message.mediaUrl != nil {
                    Button {
                        toggleAudioPlayback()
                    } label: {
                        Image(systemName: isPlayingAudio ? "pause.circle.fill" : "play.circle.fill")
                            .font(.title)
                            .foregroundStyle(isUser ? .white : Color.accentColor)
                    }
                    .accessibilityLabel(isPlayingAudio ? "Pause audio" : "Play audio")
                } else {
                    Image(systemName: "waveform")
                        .font(.title3)
                        .foregroundStyle(isUser ? .white.opacity(0.9) : Color.accentColor)
                        .accessibilityHidden(true)
                }

                Text("Audio Message")
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(isUser ? .white : .primary)
            }
            if !message.content.isEmpty {
                Text(message.content)
                    .font(.footnote)
                    .foregroundStyle(isUser ? .white.opacity(0.85) : .secondary)
                    .lineLimit(4)
            }
        }
        .onDisappear {
            audioPlayer?.pause()
            isPlayingAudio = false
            if let obs = playbackObserver {
                NotificationCenter.default.removeObserver(obs)
                playbackObserver = nil
            }
            AudioSessionManager.shared.deactivate()
        }
    }

    private func toggleAudioPlayback() {
        if isPlayingAudio {
            audioPlayer?.pause()
            isPlayingAudio = false
        } else {
            if audioPlayer == nil, let urlString = message.mediaUrl, let url = URL(string: urlString) {
                audioPlayer = AVPlayer(url: url)
                // Remove any existing observer before adding a new one
                if let obs = playbackObserver {
                    NotificationCenter.default.removeObserver(obs)
                }
                // Observe when playback ends
                playbackObserver = NotificationCenter.default.addObserver(
                    forName: .AVPlayerItemDidPlayToEndTime,
                    object: audioPlayer?.currentItem,
                    queue: .main
                ) { _ in
                    isPlayingAudio = false
                    audioPlayer?.seek(to: .zero)
                }
            }
            try? AudioSessionManager.shared.activateForPlayback()
            NowPlayingManager.shared.registerRemoteCommands()
            NowPlayingManager.shared.onTogglePlayPause = { [self] in
                toggleAudioPlayback()
            }
            NowPlayingManager.shared.onPlay = { [self] in
                if !isPlayingAudio { toggleAudioPlayback() }
            }
            NowPlayingManager.shared.onPause = { [self] in
                if isPlayingAudio { toggleAudioPlayback() }
            }
            audioPlayer?.play()
            isPlayingAudio = true
        }
    }

    @ViewBuilder
    private var imageContent: some View {
        if message.documentId == nil {
            // Image was deleted
            HStack(spacing: 8) {
                Image(systemName: "photo.fill")
                    .font(.title3)
                    .foregroundStyle(.secondary)
                Text("Image Deleted")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .italic()
            }
        } else {
            VStack(alignment: .leading, spacing: 6) {
                if let mediaUrl = message.mediaUrl, let url = URL(string: mediaUrl) {
                    CachedAsyncImage(url: url) { image in
                        image
                            .resizable()
                            .scaledToFit()
                            .frame(maxWidth: 200, minHeight: 1)
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                    } placeholder: {
                        Color(.systemGray5)
                            .frame(width: 200, height: 150)
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                            .overlay { ProgressView() }
                    } failure: {
                        RoundedRectangle(cornerRadius: 8)
                            .fill(Color(.systemGray5))
                            .frame(width: 200, height: 120)
                            .overlay {
                                VStack(spacing: 6) {
                                    Image(systemName: "photo.fill")
                                        .font(.title2)
                                    Text("Failed to load")
                                        .font(.caption2)
                                }
                                .foregroundStyle(.secondary)
                            }
                    }
                    .accessibilityHidden(true)
                } else {
                    HStack(spacing: 8) {
                        Image(systemName: "photo.fill")
                            .font(.title3)
                            .foregroundStyle(isUser ? .white.opacity(0.9) : Color.accentColor)
                        Text("Image")
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(isUser ? .white : .primary)
                    }
                }
                if !message.content.isEmpty {
                    Text(message.content)
                        .font(.footnote)
                        .foregroundStyle(isUser ? .white.opacity(0.85) : .secondary)
                        .lineLimit(3)
                }
            }
        }
    }

    // MARK: - Failed Indicator

    private var failedIndicator: some View {
        Image(systemName: "exclamationmark.circle.fill")
            .font(.body)
            .foregroundStyle(.red)
            .accessibilityLabel("Message failed to send")
    }

    // MARK: - Helpers

    private var bubbleBackground: AnyShapeStyle {
        isUser ? AnyShapeStyle(Color.accentColor) : AnyShapeStyle(Color(.systemGray6))
    }

    private var failedOrNormalBackground: AnyShapeStyle {
        isFailed ? AnyShapeStyle(Color.red.opacity(0.15)) : bubbleBackground
    }

    private func copyFormatted(_ markdown: String) {
        ClipboardHelper.copyFormatted(markdown)
    }

    private var documentFilename: String {
        // Try to extract filename from the content first (backend often puts it there)
        if !message.content.isEmpty, message.content.count < 200 {
            return message.content
        }
        // Fall back to extracting from the URL path
        if let mediaUrl = message.mediaUrl,
           let urlComponents = URLComponents(string: mediaUrl),
           let lastComponent = urlComponents.path.split(separator: "/").last {
            return String(lastComponent)
        }
        return "Document"
    }
}

#Preview {
    VStack(spacing: 12) {
        MessageBubbleView(
            message: MessageResponse(
                id: 1, sessionId: "s1", role: .user,
                content: "What does my blood test mean?",
                createdAt: Date(), updatedAt: nil, messageType: .text,
                documentId: nil, mediaUrl: nil, thumbnailUrl: nil,
                extractedText: nil, createdBy: nil, lastEditedBy: nil
            ),
            currentUserId: "u1"
        )
        MessageBubbleView(
            message: MessageResponse(
                id: 2, sessionId: "s1", role: .assistant,
                content: "Blood tests measure several important markers. Let me help you understand each one.",
                createdAt: Date(), updatedAt: nil, messageType: .text,
                documentId: nil, mediaUrl: nil, thumbnailUrl: nil,
                extractedText: nil, createdBy: nil, lastEditedBy: nil
            ),
            currentUserId: "u1"
        )
    }
}
