import SwiftUI
import Combine

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
    var onMicrophone: () -> Void
    var onRemoveAttachment: () -> Void

    @FocusState private var isFocused: Bool
    @State private var sendTrigger = 0
    @State private var currentPromptIndex = 0
    @State private var showingAttachOptions = false

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
                // Attach button
                Button {
                    showingAttachOptions = true
                } label: {
                    Image(systemName: "paperclip")
                        .font(.title3)
                        .foregroundStyle(.secondary)
                }
                .accessibilityLabel("Attach file")
                .disabled(isSending || isUploading)
                .confirmationDialog("Add Attachment", isPresented: $showingAttachOptions, titleVisibility: .visible) {
                    Button("Take Photo") { onTakePhoto() }
                    Button("Choose Photo") { onChoosePhoto() }
                    Button("Choose File") { onChooseFile() }
                    Button("Cancel", role: .cancel) {}
                }

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

                if !hasText && pendingAttachment == nil {
                    // Microphone button
                    Button {
                        onMicrophone()
                    } label: {
                        Image(systemName: "mic.fill")
                            .font(.title3)
                            .foregroundStyle(Color.accentColor)
                    }
                    .accessibilityLabel("Record audio")
                    .disabled(isSending || isUploading)
                } else {
                    // Send button
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
        .onReceive(Timer.publish(every: 4, on: .main, in: .common).autoconnect()) { _ in
            if !hasMessages && text.isEmpty {
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
        isFocused = false
        sendTrigger += 1
        onSend()
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
        onMicrophone: {},
        onRemoveAttachment: {}
    )
}
