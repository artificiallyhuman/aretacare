import SwiftUI
import MarkdownUI

extension Theme {
    /// Standard AretaCare markdown theme for assistant messages, journal entries, and digests.
    static let aretaCare = Theme()
        .text {
            ForegroundColor(.primary)
            FontSize(.em(1))
        }
        .heading1 { configuration in
            configuration.label
                .markdownTextStyle {
                    FontWeight(.bold)
                    FontSize(.em(1.3))
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .markdownMargin(top: 16, bottom: 8)
        }
        .heading2 { configuration in
            configuration.label
                .markdownTextStyle {
                    FontWeight(.bold)
                    FontSize(.em(1.15))
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .markdownMargin(top: 12, bottom: 6)
        }
        .heading3 { configuration in
            configuration.label
                .markdownTextStyle {
                    FontWeight(.semibold)
                    FontSize(.em(1.05))
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .markdownMargin(top: 10, bottom: 4)
        }
        .paragraph { configuration in
            configuration.label
                .frame(maxWidth: .infinity, alignment: .leading)
                .markdownMargin(top: 0, bottom: 8)
        }
        .listItem { configuration in
            configuration.label
                .frame(maxWidth: .infinity, alignment: .leading)
                .markdownMargin(top: 2, bottom: 2)
        }
        .codeBlock { configuration in
            configuration.label
                .markdownTextStyle {
                    FontFamilyVariant(.monospaced)
                    FontSize(.em(0.88))
                }
                .padding(12)
                .background(Color(.systemGray6))
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .markdownMargin(top: 4, bottom: 8)
        }
        .code {
            FontFamilyVariant(.monospaced)
            FontSize(.em(0.88))
            BackgroundColor(Color(.systemGray6))
        }
        .blockquote { configuration in
            HStack(spacing: 0) {
                Rectangle()
                    .fill(Color(.systemGray3))
                    .frame(width: 3)
                configuration.label
                    .markdownTextStyle {
                        ForegroundColor(.secondary)
                        FontStyle(.italic)
                    }
                    .padding(.leading, 12)
            }
            .markdownMargin(top: 4, bottom: 8)
        }
        .link {
            ForegroundColor(.accentColor)
        }
        .strong {
            FontWeight(.semibold)
        }
        .emphasis {
            FontStyle(.italic)
        }

    /// Theme for user chat bubbles (white text on accent background).
    static let userBubble = Theme()
        .text {
            ForegroundColor(.white)
            FontSize(.em(1))
        }
        .heading1 { configuration in
            configuration.label
                .markdownTextStyle {
                    FontWeight(.bold)
                    FontSize(.em(1.3))
                    ForegroundColor(.white)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .markdownMargin(top: 16, bottom: 8)
        }
        .heading2 { configuration in
            configuration.label
                .markdownTextStyle {
                    FontWeight(.bold)
                    FontSize(.em(1.15))
                    ForegroundColor(.white)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .markdownMargin(top: 12, bottom: 6)
        }
        .heading3 { configuration in
            configuration.label
                .markdownTextStyle {
                    FontWeight(.semibold)
                    FontSize(.em(1.05))
                    ForegroundColor(.white)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .markdownMargin(top: 10, bottom: 4)
        }
        .paragraph { configuration in
            configuration.label
                .frame(maxWidth: .infinity, alignment: .leading)
                .markdownMargin(top: 0, bottom: 8)
        }
        .listItem { configuration in
            configuration.label
                .frame(maxWidth: .infinity, alignment: .leading)
                .markdownMargin(top: 2, bottom: 2)
        }
        .codeBlock { configuration in
            configuration.label
                .markdownTextStyle {
                    FontFamilyVariant(.monospaced)
                    FontSize(.em(0.88))
                    ForegroundColor(.white)
                }
                .padding(12)
                .background(Color.white.opacity(0.15))
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .markdownMargin(top: 4, bottom: 8)
        }
        .code {
            FontFamilyVariant(.monospaced)
            FontSize(.em(0.88))
            ForegroundColor(.white)
            BackgroundColor(Color.white.opacity(0.15))
        }
        .blockquote { configuration in
            HStack(spacing: 0) {
                Rectangle()
                    .fill(Color.white.opacity(0.5))
                    .frame(width: 3)
                configuration.label
                    .markdownTextStyle {
                        ForegroundColor(Color.white.opacity(0.85))
                        FontStyle(.italic)
                    }
                    .padding(.leading, 12)
            }
            .markdownMargin(top: 4, bottom: 8)
        }
        .link {
            ForegroundColor(.white)
            UnderlineStyle(.single)
        }
        .strong {
            FontWeight(.semibold)
        }
        .emphasis {
            FontStyle(.italic)
        }
}
