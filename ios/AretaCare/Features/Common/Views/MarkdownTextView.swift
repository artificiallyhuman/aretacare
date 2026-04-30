import SwiftUI
import MarkdownUI

/// Renders markdown-formatted text using the MarkdownUI library.
/// Supports headings, lists, code blocks, blockquotes, bold, italic, links.
struct MarkdownTextView: View {
    let content: String
    var isUserBubble: Bool = false

    var body: some View {
        Markdown(content)
            .markdownTheme(isUserBubble ? .userBubble : .aretaCare)
            .textSelection(.enabled)
            .accessibilityElement(children: .contain)
            .accessibilityLabel(content)
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
