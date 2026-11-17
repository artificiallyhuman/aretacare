import SwiftUI

struct TypingBubbleView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var animating = false

    var body: some View {
        HStack {
            HStack(spacing: 5) {
                ForEach(0..<3, id: \.self) { index in
                    Circle()
                        .fill(Color(.systemGray))
                        .frame(width: 8, height: 8)
                        .scaleEffect(animating ? 1.0 : 0.5)
                        .opacity(animating ? 1.0 : 0.4)
                        .animation(
                            reduceMotion
                                ? nil
                                : .easeInOut(duration: 0.6)
                                    .repeatForever(autoreverses: true)
                                    .delay(Double(index) * 0.2),
                            value: animating
                        )
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(Color(.systemGray6))
            .clipShape(RoundedRectangle(cornerRadius: 18))

            Spacer()
        }
        .onAppear { animating = !reduceMotion }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("AretaCare is typing")
    }
}

/// Shown instead of the typing dots while the device is offline. Requests wait for the
/// connection to come back (up to 10 minutes) and then go through by themselves, so the
/// dots alone looked like nothing was happening.
struct WaitingForConnectionBubble: View {
    var body: some View {
        HStack {
            HStack(spacing: 8) {
                Image(systemName: "wifi.slash")
                    .font(.subheadline)
                    .accessibilityHidden(true)
                Text(WaitingForConnection.message)
                    .font(.subheadline)
            }
            .foregroundStyle(.secondary)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(Color(.systemGray6))
            .clipShape(RoundedRectangle(cornerRadius: 18))

            Spacer()
        }
        .accessibilityElement(children: .combine)
    }
}

/// Shared wording for work that is waiting for the network (`URLSession`'s
/// `waitsForConnectivity`: an offline request waits, then sends once the connection is back).
enum WaitingForConnection {
    static let message = "Waiting for a connection…"
}
