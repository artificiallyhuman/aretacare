import SwiftUI

// MARK: - Pending Attachment

struct PendingAttachment {
    let data: Data
    let filename: String
    let contentType: String
}

// MARK: - Message Input View

struct MessageInputView: View {
    @Binding var text: String
    let isSending: Bool
    let isUploading: Bool
    let hasMessages: Bool
    let pendingAttachment: PendingAttachment?
    var onSend: () -> Void
    var onTakePhoto: () -> Void
    var onChoosePhoto: () -> Void
    var onChooseFile: () -> Void
    var onRecordAudio: () -> Void
    var onRemoveAttachment: () -> Void
    /// Starts a Talk call. Nil hides the Talk button (no care session, or Talk is off).
    var onTalk: (() -> Void)? = nil

    @FocusState private var isFocused: Bool
    /// Height of the bar's two round controls, the Add button and the Talk pill: close to
    /// the send button, which takes Talk's slot while there is text.
    @ScaledMetric(relativeTo: .title2) private var barButtonSize: CGFloat = 32
    @State private var sendTrigger = 0
    @State private var currentPromptIndex = 0

    private let placeholderPrompts = [
        "My mom's been in the hospital for a week\u{2026}",
        "I was just admitted to the ER with a broken leg\u{2026}",
        "My husband was diagnosed with prostate cancer\u{2026}",
        "I'm pregnant and might have to go on bed rest\u{2026}",
        "My lab results came back and I'm worried\u{2026}",
        "I'm caring for my dad and feeling overwhelmed\u{2026}"
    ]

    private var hasText: Bool {
        !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private var canSend: Bool {
        (hasText || pendingAttachment != nil) && !isSending && !isUploading
    }

    var body: some View {
        VStack(spacing: 0) {
            Divider()

            if let attachment = pendingAttachment {
                attachmentPreview(attachment)
            }

            HStack(alignment: .center, spacing: 10) {
                // Add: what you put into the care session (a photo, a file, a recording) sits
                // behind one menu on the left, with a label on every choice; the ways to talk
                // to AretaCare (Talk, Send) sit on the right. A bare microphone beside Talk
                // read as dictation, which is what the keyboard's own mic in that corner does.
                Menu {
                    Section("One photo or file per message. To upload several, use Tools → Document Manager.") {
                        Button { onTakePhoto() } label: { Label("Take Photo", systemImage: "camera") }
                        Button { onChoosePhoto() } label: { Label("Choose Photo", systemImage: "photo.on.rectangle") }
                        Button { onChooseFile() } label: { Label("Choose File", systemImage: "doc") }
                    }
                    Section {
                        Button { onRecordAudio() } label: { Label("Record Audio", systemImage: "record.circle") }
                    }
                } label: {
                    // Full accent: the menu tints its label, and `.secondary` came out a pale
                    // blue on grey that looked disabled.
                    Image(systemName: "plus")
                        .font(.system(size: barButtonSize * 0.5, weight: .semibold))
                        .foregroundStyle(Color.accentColor)
                        .frame(width: barButtonSize, height: barButtonSize)
                        .background(Circle().fill(Color(.systemGray6)))
                }
                // Top to bottom as written: the menu opens upward, and the automatic order
                // would reverse it.
                .menuOrder(.fixed)
                .accessibilityLabel("Add")
                .accessibilityHint("Take or choose a photo, choose a file, or record audio")
                .disabled(isSending || isUploading)

                // Text field
                TextField(hasMessages ? "Type your message..." : placeholderPrompts[currentPromptIndex], text: $text, axis: .vertical)
                    .lineLimit(1...6)
                    .textFieldStyle(.plain)
                    .focused($isFocused)
                    .submitLabel(.send)
                    .onSubmit {
                        if canSend { performSend() }
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Color(.systemGray6))
                    .clipShape(RoundedRectangle(cornerRadius: 20))

                if let onTalk, !hasText, pendingAttachment == nil {
                    // Talk: a labeled button at the end of the bar, where Send appears once
                    // there is text, so the main action sits in the same place. Labeled
                    // because an icon alone has to be learned.
                    Button {
                        onTalk()
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "waveform")
                            Text("Talk")
                        }
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 10)
                            .frame(minHeight: barButtonSize)
                            .background(Capsule().fill(isSending || isUploading ? Color.secondary : Color.accentColor))
                            .fixedSize()
                    }
                    // Bar chrome: at the largest sizes the pill would squeeze the text field.
                    .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
                    .accessibilityLabel("Talk")
                    .accessibilityHint("Start a live voice conversation")
                    .disabled(isSending || isUploading)
                } else {
                    // Send. Without Talk it stays in place, greyed out until there is
                    // something to send, so the text field doesn't change width as you type.
                    Button {
                        performSend()
                    } label: {
                        Image(systemName: "arrow.up.circle.fill")
                            .font(.title2)
                            .foregroundStyle(canSend ? Color.accentColor : Color.secondary)
                            .symbolEffect(.bounce, value: sendTrigger)
                    }
                    .accessibilityLabel("Send message")
                    .disabled(!canSend)
                    .sensoryFeedback(.success, trigger: sendTrigger)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(Color(.systemBackground))
        }
        // Rotate the onboarding placeholder every 4s. Keyed on `hasMessages` so it
        // restarts only when that flips — an inline Timer.publish in `.onReceive` was
        // rebuilt on every keystroke and kept waking the run loop after messages existed.
        .task(id: hasMessages) {
            guard !hasMessages else { return }
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(4))
                guard !Task.isCancelled else { break }
                guard text.isEmpty else { continue }
                withAnimation(.spring(duration: 0.3)) {
                    currentPromptIndex = (currentPromptIndex + 1) % placeholderPrompts.count
                }
            }
        }
    }

    // MARK: - Attachment Preview

    private func attachmentPreview(_ attachment: PendingAttachment) -> some View {
        HStack(spacing: 10) {
            if attachment.contentType.hasPrefix("image/"),
               let uiImage = UIImage(data: attachment.data) {
                Image(uiImage: uiImage)
                    .resizable()
                    .scaledToFill()
                    .frame(width: 44, height: 44)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .accessibilityHidden(true)
            } else {
                Image(systemName: "doc.fill")
                    .font(.title2)
                    .foregroundStyle(Color.accentColor)
                    .frame(width: 44, height: 44)
                    .accessibilityHidden(true)
            }

            Text(attachment.filename)
                .font(.subheadline)
                .foregroundStyle(.primary)
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)

            Button {
                onRemoveAttachment()
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.title3)
                    .foregroundStyle(.secondary)
            }
            .accessibilityLabel("Remove attachment")
        }
        .padding(10)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal, 12)
        .padding(.top, 8)
    }

    private func performSend() {
        guard canSend else { return }
        sendTrigger += 1
        onSend()
        // Dismiss focus AFTER onSend reads the text — dismissing first can
        // drop uncommitted dictation text from the binding.
        isFocused = false
    }
}

#Preview {
    @Previewable @State var text = ""
    MessageInputView(
        text: $text,
        isSending: false,
        isUploading: false,
        hasMessages: false,
        pendingAttachment: nil,
        onSend: {},
        onTakePhoto: {},
        onChoosePhoto: {},
        onChooseFile: {},
        onRecordAudio: {},
        onRemoveAttachment: {}
    )
}
