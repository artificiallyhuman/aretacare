import UIKit
import UniformTypeIdentifiers

/// Shared clipboard utility that copies markdown content as rich text (HTML + plain text),
/// matching the web app's behavior so pasting into Notes, Mail, etc. preserves formatting.
enum ClipboardHelper {

    /// Copies markdown content to the pasteboard with both HTML and plain text representations.
    static func copyFormatted(_ markdown: String) {
        let html = markdownToHTML(markdown)
        guard let htmlData = html.data(using: .utf8) else {
            UIPasteboard.general.string = markdown
            return
        }

        UIPasteboard.general.setItems([[
            UTType.html.identifier: htmlData,
            UTType.utf8PlainText.identifier: Data(markdown.utf8)
        ]], options: [
            .localOnly: true,
            .expirationDate: Date().addingTimeInterval(60)
        ])
    }

    // MARK: - Markdown to HTML

    /// Converts markdown to HTML, handling headers, bold, italic, lists, and inline code.
    /// Mirrors the web app's `markdownToHtml()` in `markdownUtils.js`.
    static func markdownToHTML(_ markdown: String) -> String {
        // Escape HTML special characters first
        var escaped = markdown
            .replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
            .replacingOccurrences(of: "\"", with: "&quot;")
            .replacingOccurrences(of: "'", with: "&#39;")

        // Inline formatting (bold before italic to avoid conflicts)
        escaped = escaped.replacingOccurrences(
            of: "\\*\\*(.+?)\\*\\*",
            with: "<strong>$1</strong>",
            options: .regularExpression
        )
        escaped = escaped.replacingOccurrences(
            of: "__(.+?)__",
            with: "<strong>$1</strong>",
            options: .regularExpression
        )
        escaped = escaped.replacingOccurrences(
            of: "\\*([^*]+)\\*",
            with: "<em>$1</em>",
            options: .regularExpression
        )
        escaped = escaped.replacingOccurrences(
            of: "_([^_]+)_",
            with: "<em>$1</em>",
            options: .regularExpression
        )
        escaped = escaped.replacingOccurrences(
            of: "`([^`]+)`",
            with: "<code>$1</code>",
            options: .regularExpression
        )

        // Process lines for block-level elements
        let lines = escaped.components(separatedBy: "\n")
        var output: [String] = []
        var listStack: [String] = []

        for (i, line) in lines.enumerated() {
            let trimmed = line.trimmingCharacters(in: .whitespaces)

            // Horizontal rule
            if trimmed.range(of: "^(-{3,}|\\*{3,}|_{3,})$", options: .regularExpression) != nil {
                while let tag = listStack.popLast() { output.append("</\(tag)>") }
                output.append("<hr>")
                continue
            }

            // Headers
            if trimmed.hasPrefix("### ") {
                while let tag = listStack.popLast() { output.append("</\(tag)>") }
                let content = String(trimmed.dropFirst(4))
                output.append("<h3 style=\"font-size:1em;font-weight:600;margin:0.5em 0;\">\(content)</h3>")
                continue
            }
            if trimmed.hasPrefix("## ") {
                while let tag = listStack.popLast() { output.append("</\(tag)>") }
                let content = String(trimmed.dropFirst(3))
                output.append("<h2 style=\"font-size:1.125em;font-weight:600;margin:0.5em 0;\">\(content)</h2>")
                continue
            }
            if trimmed.hasPrefix("# ") {
                while let tag = listStack.popLast() { output.append("</\(tag)>") }
                let content = String(trimmed.dropFirst(2))
                output.append("<h1 style=\"font-size:1.25em;font-weight:700;margin:0.5em 0;\">\(content)</h1>")
                continue
            }

            // Unordered list
            if trimmed.hasPrefix("- ") || trimmed.hasPrefix("* ") {
                if listStack.isEmpty {
                    output.append("<ul>")
                    listStack.append("ul")
                }
                let content = String(trimmed.dropFirst(2))
                output.append("<li>\(content)</li>")
                continue
            }

            // Ordered list
            if trimmed.range(of: "^\\d+\\.\\s(.*)$", options: .regularExpression) != nil {
                if listStack.isEmpty {
                    output.append("<ol>")
                    listStack.append("ol")
                }
                // Extract content after "N. "
                if let dotSpace = trimmed.range(of: ". ") {
                    let content = String(trimmed[dotSpace.upperBound...])
                    output.append("<li>\(content)</li>")
                }
                continue
            }

            // Empty line — close lists
            if trimmed.isEmpty {
                while let tag = listStack.popLast() { output.append("</\(tag)>") }
                if i < lines.count - 1, !lines[i + 1].trimmingCharacters(in: .whitespaces).isEmpty {
                    output.append("</p><p>")
                }
                continue
            }

            // Regular text — close any open lists first
            if !listStack.isEmpty {
                while let tag = listStack.popLast() { output.append("</\(tag)>") }
            }
            output.append(line + "<br>")
        }

        // Close remaining lists
        while let tag = listStack.popLast() { output.append("</\(tag)>") }

        var body = "<p>" + output.joined() + "</p>"

        // Clean up empty/misplaced paragraph tags
        body = body.replacingOccurrences(of: "<p></p>", with: "")
        body = body.replacingOccurrences(of: "<p>(<[uo]l>)", with: "$1", options: .regularExpression)
        body = body.replacingOccurrences(of: "(</[uo]l>)</p>", with: "$1", options: .regularExpression)
        body = body.replacingOccurrences(of: "<p>(<h[123][^>]*>)", with: "$1", options: .regularExpression)
        body = body.replacingOccurrences(of: "(</h[123]>)</p>", with: "$1", options: .regularExpression)
        body = body.replacingOccurrences(of: "<p>(<hr>)", with: "$1", options: .regularExpression)
        body = body.replacingOccurrences(of: "(<hr>)</p>", with: "$1", options: .regularExpression)
        body = body.replacingOccurrences(of: "<br></p>", with: "</p>")
        body = body.replacingOccurrences(of: "<p><br>", with: "<p>")

        // Wrap in a full HTML document with UTF-8 charset so receiving apps
        // correctly handle smart quotes, em dashes, and other Unicode characters.
        return "<html><head><meta charset=\"utf-8\"></head><body>\(body)</body></html>"
    }
}
