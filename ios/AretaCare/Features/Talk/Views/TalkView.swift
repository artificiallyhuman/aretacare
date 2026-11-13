import SwiftUI

/// What the chat screen shows: the conversation, or a live Talk call. Talk starts from the
/// Talk pill in the message bar; the End button leaves it.
enum ConversationMode {
    case chat
    case talk
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

            Text(viewModel.caption)
                .font(.title3.weight(.medium))
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.top, 20)
                .padding(.horizontal, 24)
                .accessibilityAddTraits(.updatesFrequently)
                .dynamicTypeSize(...DynamicTypeSize.accessibility2)

            Spacer(minLength: 12)

            TalkFooter(
                isEnding: viewModel.phase == .ending,
                isMuted: viewModel.isMuted,
                canMute: viewModel.phase.isLive,
                onToggleMute: { viewModel.toggleMute() },
                onEnd: onEnd
            )
            // Call controls are chrome (CLAUDE.md, Dynamic Type policy): uncapped, the scaled
            // Mute button, End and the notice push the orb off a small screen.
            .dynamicTypeSize(...DynamicTypeSize.accessibility1)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

/// Call controls, phone-call style: a round Mute button beside the End button.
private struct TalkFooter: View {
    let isEnding: Bool
    let isMuted: Bool
    let canMute: Bool
    let onToggleMute: () -> Void
    let onEnd: () -> Void

    @ScaledMetric(relativeTo: .title2) private var muteSize: CGFloat = 60

    var body: some View {
        VStack(spacing: 12) {
            HStack(spacing: 20) {
                Button(action: onToggleMute) {
                    Image(systemName: isMuted ? "mic.slash.fill" : "mic.fill")
                        .font(.title2)
                        // Muted reads as "switched on": inverted colors, as in the Phone app.
                        .foregroundStyle(isMuted ? Color(.systemBackground) : Color.primary)
                        .frame(width: muteSize, height: muteSize)
                        .background(Circle().fill(isMuted ? Color.primary : Color(.tertiarySystemFill)))
                        .contentShape(Circle())
                }
                .buttonStyle(.plain)
                .disabled(!canMute || isEnding)
                .opacity(canMute ? 1 : 0.4)
                .accessibilityLabel("Mute")
                .accessibilityValue(isMuted ? "On" : "Off")
                .accessibilityHint("Stops sending your voice. AretaCare keeps listening for you to unmute.")

                Button(action: onEnd) {
                    Label("End", systemImage: "phone.down.fill")
                        .font(.headline)
                        .frame(maxWidth: 180)
                        .frame(minHeight: muteSize - 28)
                        .padding(.vertical, 14)
                }
                .buttonStyle(.borderedProminent)
                .tint(.red)
                .clipShape(Capsule())
                .disabled(isEnding)
                .accessibilityLabel("End conversation")
            }
            .padding(.horizontal, 24)

            Text("AI responses are not medical advice. This conversation is recorded and saved to Audio Recordings.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 28)
        }
        .padding(.bottom, 20)
    }
}
