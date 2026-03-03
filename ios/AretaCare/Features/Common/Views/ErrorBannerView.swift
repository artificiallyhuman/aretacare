import SwiftUI

struct ErrorBannerView: View {
    let message: String
    var autoDismissAfter: TimeInterval? = 8
    var onDismiss: (() -> Void)?

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.white)
                .font(.subheadline)
                .accessibilityHidden(true)

            Text(message)
                .font(.subheadline)
                .foregroundStyle(.white)
                .lineLimit(3)

            Spacer()

            if let onDismiss {
                Button {
                    onDismiss()
                } label: {
                    Image(systemName: "xmark")
                        .font(.caption.bold())
                        .foregroundStyle(.white.opacity(0.8))
                }
                .accessibilityLabel("Dismiss error")
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Color.red.opacity(0.9))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .padding(.horizontal)
        .transition(.move(edge: .top).combined(with: .opacity))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Error: \(message)")
        .task(id: message) {
            guard let seconds = autoDismissAfter else { return }
            try? await Task.sleep(for: .seconds(seconds))
            onDismiss?()
        }
    }
}

#Preview {
    VStack {
        ErrorBannerView(message: "Failed to send message. Please try again.") {}
        ErrorBannerView(message: "Network error: The server could not be reached.")
    }
}
