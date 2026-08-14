import SwiftUI
import MarkdownUI

/// Renders markdown-formatted text using the MarkdownUI library.
/// Supports headings, lists, code blocks, blockquotes, bold, italic, links.
///
/// The rendered text is untrusted: it carries model output (which can be steered
/// by prompt injection in an uploaded document) and messages authored by other
/// collaborators in a shared care session. Two guards apply:
///
///  * **No remote images.** MarkdownUI's default image provider fetches
///    `![](https://host/path)` on render, so a single crafted image URL would
///    exfiltrate whatever the attacker encoded into it, with no user
///    interaction. Both providers are replaced with ones that emit nothing.
///  * **Link scheme allowlist.** Only http/https/mailto/tel are handed to the
///    system; custom schemes (`shortcuts://`, `prefs:`, …) are discarded so a
///    tapped link can't drive another app. Mirrors the web app's
///    `frontend/src/utils/markdownComponents.jsx`.
struct MarkdownTextView: View {
    let content: String
    var isUserBubble: Bool = false

    var body: some View {
        Markdown(content)
            .markdownTheme(isUserBubble ? .userBubble : .aretaCare)
            .markdownImageProvider(.blocked)
            .markdownInlineImageProvider(.blocked)
            .environment(\.openURL, .markdownSafeSchemes)
            .textSelection(.enabled)
            .accessibilityElement(children: .contain)
            .accessibilityLabel(content)
    }
}

// MARK: - Image Blocking

/// Renders nothing in place of a markdown image, so no network request is made.
struct BlockedImageProvider: ImageProvider {
    func makeImage(url: URL?) -> some View {
        EmptyView()
    }
}

extension ImageProvider where Self == BlockedImageProvider {
    static var blocked: BlockedImageProvider { BlockedImageProvider() }
}

/// Inline equivalent of `BlockedImageProvider`. Falls back to the alt text so a
/// caption isn't silently dropped.
struct BlockedInlineImageProvider: InlineImageProvider {
    func image(with url: URL, label: String) async throws -> Image {
        throw BlockedImageError.remoteImagesDisabled
    }

    enum BlockedImageError: Error {
        case remoteImagesDisabled
    }
}

extension InlineImageProvider where Self == BlockedInlineImageProvider {
    static var blocked: BlockedInlineImageProvider { BlockedInlineImageProvider() }
}

// MARK: - Link Scheme Allowlist

extension OpenURLAction {
    /// Hands only http/https/mailto/tel links to the system; everything else is
    /// discarded.
    static var markdownSafeSchemes: OpenURLAction {
        OpenURLAction { url in
            let allowed: Set<String> = ["http", "https", "mailto", "tel"]
            return allowed.contains(url.scheme?.lowercased() ?? "") ? .systemAction : .discarded
        }
    }
}

#Preview {
    ScrollView {
        VStack(alignment: .leading, spacing: 24) {
            MarkdownTextView(content: """
            # Heading 1
            ## Heading 2
            ### Heading 3

            **Bold** and *italic* text with a [link](https://example.com).

            - Bullet point one
            - Bullet point two
              - Nested item

            1. First item
            2. Second item

            > This is a blockquote

            `inline code` and a code block:

            ```
            let x = 42
            ```
            """)

            MarkdownTextView(content: "User bubble styling", isUserBubble: true)
                .padding()
                .background(Color.accentColor)
                .clipShape(RoundedRectangle(cornerRadius: 18))
        }
        .padding()
    }
}
