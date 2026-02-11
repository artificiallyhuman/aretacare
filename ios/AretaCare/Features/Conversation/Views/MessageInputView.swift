import SwiftUI
import Combine

struct MessageInputView: View {
    @Binding var text: String
    let isSending: Bool
    let hasMessages: Bool
    var onSend: () -> Void
    var onAttach: () -> Void
    var onMicrophone: () -> Void

    @FocusState private var isFocused: Bool
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

    private var canSend: Bool {
        !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !isSending
    }

    var body: some View {
        VStack(spacing: 0) {
            Divider()

            HStack(alignment: .bottom, spacing: 10) {
                // Attach button
                Button {
                    onAttach()
                } label: {
                    Image(systemName: "paperclip")
                        .font(.title3)
                        .foregroundStyle(.secondary)
                }
                .disabled(isSending)

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

                if text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    // Microphone button
                    Button {
                        onMicrophone()
                    } label: {
                        Image(systemName: "mic.fill")
                            .font(.title3)
                            .foregroundStyle(Color.accentColor)
                    }
                    .disabled(isSending)
                } else {
                    // Send button
                    Button {
                        performSend()
                    } label: {
                        Image(systemName: "arrow.up.circle.fill")
                            .font(.title2)
                            .foregroundStyle(canSend ? Color.accentColor : Color.secondary)
                    }
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
                withAnimation(.easeInOut(duration: 0.3)) {
                    currentPromptIndex = (currentPromptIndex + 1) % placeholderPrompts.count
                }
            }
        }
    }

    private func performSend() {
        guard canSend else { return }
        sendTrigger += 1
        onSend()
    }
}

#Preview {
    @Previewable @State var text = ""
    MessageInputView(
        text: $text,
        isSending: false,
        hasMessages: false,
        onSend: {},
        onAttach: {},
        onMicrophone: {}
    )
}
