import SwiftUI

/// Chat ⇄ Talk switch shown at the top-centre of the chat screen and of Talk mode.
enum ConversationMode: String, CaseIterable, Identifiable {
    case chat = "Chat"
    case talk = "Talk"

    var id: String { rawValue }
}

struct ConversationModePicker: View {
    @Binding var mode: ConversationMode
    var talkDisabled = false

    var body: some View {
        Picker("Conversation mode", selection: $mode) {
            Text("Chat").tag(ConversationMode.chat)
            Text("Talk").tag(ConversationMode.talk)
        }
        .pickerStyle(.segmented)
        .frame(maxWidth: 220)
        // The control sits in fixed chrome; body content still scales to every size.
        .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
        .disabled(talkDisabled && mode == .chat)
        .accessibilityHint("Switch between typing and a live voice conversation")
    }
}

/// Talk mode: the orb, a one-line status, and a way out. Nothing else is on screen.
struct TalkView: View {
    let viewModel: TalkViewModel
    let onEnd: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 12)

            TalkOrbView(phase: viewModel.phase, userLevel: viewModel.userLevel, agentLevel: viewModel.agentLevel)
                .frame(maxWidth: 320, maxHeight: 320)
                .padding(.horizontal, 32)

            Text(viewModel.phase.caption)
                .font(.title3.weight(.medium))
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.top, 20)
                .padding(.horizontal, 24)
                .accessibilityAddTraits(.updatesFrequently)

            Spacer(minLength: 12)

            TalkFooter(isEnding: viewModel.phase == .ending, onEnd: onEnd)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

private struct TalkFooter: View {
    let isEnding: Bool
    let onEnd: () -> Void

    var body: some View {
        VStack(spacing: 12) {
            Button(action: onEnd) {
                Label("End", systemImage: "phone.down.fill")
                    .font(.headline)
                    .frame(maxWidth: 220)
                    .padding(.vertical, 14)
            }
            .buttonStyle(.borderedProminent)
            .tint(.red)
            .clipShape(Capsule())
            .disabled(isEnding)
            .accessibilityLabel("End conversation")

            Text("AI responses are not medical advice. This conversation is recorded and saved to Audio Recordings.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 28)
        }
        .padding(.bottom, 20)
    }
}
