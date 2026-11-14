import SwiftUI

/// A compact banner above every signed-in screen while an admin-published notice is live.
/// Tapping it opens the full text. `ContentView` stacks it above the current screen rather
/// than having it present itself, so it can never collide with a sheet another screen is
/// showing (SwiftUI drops a second simultaneous presentation silently).
struct AppNoticeBanner: View {
    let notice: AppNotice
    let onDismiss: () -> Void

    @State private var showDetail = false

    var body: some View {
        HStack(spacing: 10) {
            Button {
                showDetail = true
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundStyle(.orange)
                        .accessibilityHidden(true)
                    Text(notice.title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.primary)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Text("Read")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Color.accentColor)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Notice: \(notice.title)")
            .accessibilityHint("Opens the full notice")

            Button(action: onDismiss) {
                Image(systemName: "xmark")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .frame(width: 28, height: 28)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Dismiss notice")
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        // Chrome, like the toolbar title: keep it to a size that fits above the content.
        // The full text in the sheet scales without a cap.
        .dynamicTypeSize(...DynamicTypeSize.accessibility2)
        .background {
            ZStack {
                Color(.systemBackground)
                Color.orange.opacity(0.15)
            }
            .ignoresSafeArea(edges: .top)
        }
        .overlay(alignment: .bottom) { Divider() }
        .sheet(isPresented: $showDetail) {
            AppNoticeDetailView(notice: notice, onDismiss: onDismiss)
        }
    }
}

/// The full notice. Plain text: `Text(String)` never interprets markdown.
struct AppNoticeDetailView: View {
    let notice: AppNotice
    let onDismiss: () -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text(notice.title)
                        .font(.title3.weight(.semibold))
                    Text(notice.body)
                        .font(.body)
                        .textSelection(.enabled)
                    if let url = notice.safeLinkURL {
                        Link(destination: url) {
                            Label(notice.linkLabel ?? "Learn more", systemImage: "arrow.up.right.square")
                        }
                        .font(.body.weight(.semibold))
                    }
                    Button("Hide This Notice") {
                        onDismiss()
                        dismiss()
                    }
                    .font(.subheadline)
                    .padding(.top, 8)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding()
            }
            .navigationTitle("Notice")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}
