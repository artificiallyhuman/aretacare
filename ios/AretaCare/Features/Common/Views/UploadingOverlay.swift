import SwiftUI

struct UploadingOverlay: View {
    var message: String = "Uploading..."

    var body: some View {
        ZStack {
            Color.black.opacity(0.3).ignoresSafeArea()
            VStack(spacing: 12) {
                ProgressView()
                    .controlSize(.large)
                Text(message)
                    .font(.subheadline.weight(.medium))
            }
            .padding(24)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Upload in progress")
        }
    }
}
