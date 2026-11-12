import SwiftUI

/// One-time explanation shown before the first Talk call. The server records the
/// consent (`POST /talk/consent`) and refuses to start a call without it.
struct TalkConsentSheet: View {
    let maxSessionSeconds: Int
    let onAgree: () -> Void
    let onDecline: () -> Void

    private var limitText: String {
        "A conversation can last up to \(max(1, maxSessionSeconds / 60)) minutes."
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    VStack(spacing: 10) {
                        Image(systemName: "waveform.circle.fill")
                            .font(.system(size: 52))
                            .foregroundStyle(Color.accentColor)
                            .accessibilityHidden(true)
                        Text("Talk with AretaCare")
                            .font(.title2.bold())
                        Text("Have a spoken conversation about this care session. Ask questions, add journal entries, and suggest Health Profile updates by voice.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    .frame(maxWidth: .infinity)

                    VStack(alignment: .leading, spacing: 14) {
                        row("mic.fill", "Your voice is streamed live to OpenAI so the assistant can listen and respond.")
                        row("record.circle", "Both sides of the conversation are recorded and saved to this care session's Audio Recordings with a transcript. Journal entries may be created from it.")
                        row("person.2.fill", "Everyone this care session is shared with can see and hear those recordings.")
                        row("checkmark.shield.fill", "The assistant reads changes back and asks before saving. Health Profile changes wait for your review.")
                        row("cross.case.fill", "The assistant does not give medical advice, diagnoses, or treatment recommendations. In an emergency, call 911.")
                        row("clock.fill", limitText)
                    }

                    VStack(spacing: 10) {
                        Button("Agree and Start", action: onAgree)
                            .buttonStyle(PrimaryButtonStyle())
                        Button("Not Now", action: onDecline)
                            .buttonStyle(SecondaryButtonStyle())
                    }
                    .padding(.top, 4)
                }
                .padding(20)
            }
            .navigationBarTitleDisplayMode(.inline)
        }
        .interactiveDismissDisabled()
    }

    private func row(_ icon: String, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon)
                .foregroundStyle(Color.accentColor)
                .frame(width: 24)
                .accessibilityHidden(true)
            Text(text)
                .font(.subheadline)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

/// The message a finished Talk call leaves in the chat.
struct TalkSummaryCard: View {
    let message: MessageResponse
    let summary: TalkSummaryInfo
    let onOpenRecordings: () -> Void

    var body: some View {
        VStack(spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: "waveform.circle.fill")
                    .font(.title3)
                    .foregroundStyle(Color.accentColor)
                    .accessibilityHidden(true)
                Text("Talk conversation")
                    .font(.subheadline.weight(.semibold))
                if let duration = summary.durationLabel {
                    Text("· \(duration)")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }

            Text(message.content)
                .font(.footnote)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            if summary.hasRecording {
                Button(action: onOpenRecordings) {
                    Label("Open Audio Recordings", systemImage: "chevron.right")
                        .labelStyle(.titleAndIcon)
                        .font(.footnote.weight(.semibold))
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
            }
        }
        .padding(.vertical, 14)
        .padding(.horizontal, 16)
        .frame(maxWidth: 420)
        .background(Color(.secondarySystemBackground).opacity(0.9))
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color(.separator).opacity(0.5)))
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 24)
        .padding(.vertical, 6)
    }
}
