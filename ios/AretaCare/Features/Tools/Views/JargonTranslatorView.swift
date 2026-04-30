import SwiftUI

struct JargonTranslatorView: View {
    let sessionId: String
    var sessionName: String = ""

    @State private var viewModel = ToolsViewModel()
    @State private var medicalTerm = ""
    @State private var context = ""
    @State private var copyTrigger = 0

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                // Hero header
                VStack(spacing: 12) {
                    Image(systemName: "character.book.closed")
                        .font(.title)
                        .foregroundStyle(.white)
                        .frame(width: 60, height: 60)
                        .background(Circle().fill(Color.accentColor.gradient))
                        .accessibilityHidden(true)

                    Text("Translate complex medical terms into plain, easy-to-understand language.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 4)

                // Medical disclaimer
                HStack(spacing: 8) {
                    Image(systemName: "info.circle")
                        .foregroundStyle(.orange)
                        .font(.caption)
                    Text("Explanations are for informational purposes only and are not medical advice.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding(10)
                .background(
                    RoundedRectangle(cornerRadius: 8)
                        .fill(Color.orange.opacity(0.08))
                )

                // Input
                VStack(alignment: .leading, spacing: 12) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Medical Term")
                            .font(.subheadline.weight(.medium))
                        TextField("e.g., Echocardiogram, CBC, NPO", text: $medicalTerm)
                            .textFieldStyle(.roundedBorder)
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        Text("Context (optional)")
                            .font(.subheadline.weight(.medium))
                        TextField("Where did you encounter this term?", text: $context, axis: .vertical)
                            .lineLimit(3...6)
                            .textFieldStyle(.roundedBorder)
                    }

                    Button {
                        Task {
                            await viewModel.translateJargon(
                                term: medicalTerm,
                                context: context,
                                sessionId: sessionId
                            )
                        }
                    } label: {
                        if viewModel.isTranslating {
                            ProgressView()
                                .frame(maxWidth: .infinity)
                        } else {
                            Text("Translate")
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(medicalTerm.trimmingCharacters(in: .whitespaces).isEmpty || viewModel.isTranslating)
                }
                .disabled(viewModel.isTranslating)
                .padding()
                .background(Color(.secondarySystemGroupedBackground))
                .clipShape(RoundedRectangle(cornerRadius: 12))

                // Result
                if let result = viewModel.translationResult {
                    VStack(alignment: .leading, spacing: 0) {
                        Color.accentColor.frame(height: 3)

                        VStack(alignment: .leading, spacing: 12) {
                            HStack {
                                Text(result.term)
                                    .font(.title3.weight(.semibold))
                                Spacer()
                                Button {
                                    let text = "**\(result.term)**\n\n\(result.explanation)" +
                                        (result.contextNote.isEmpty ? "" : "\n\n*\(result.contextNote)*")
                                    UIPasteboard.general.string = text
                                    copyTrigger += 1
                                } label: {
                                    Image(systemName: "doc.on.doc")
                                        .font(.subheadline)
                                        .foregroundStyle(Color.accentColor)
                                }
                            }

                            Divider()

                            Text("Explanation")
                                .font(.subheadline.weight(.medium))
                            MarkdownTextView(content: result.explanation)

                            if !result.contextNote.isEmpty {
                                Divider()
                                Text("Context Note")
                                    .font(.subheadline.weight(.medium))
                                MarkdownTextView(content: result.contextNote)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .padding()
                    }
                    .background(Color(.secondarySystemGroupedBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 12))

                    Text("Sources are AI-generated and may not link to the exact page. Verify information with your healthcare provider.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                // Error
                if let error = viewModel.errorMessage {
                    ErrorBannerView(message: error) { viewModel.dismissError() }
                }
            }
            .padding()
            .frame(maxWidth: 700)
            .frame(maxWidth: .infinity)
        }
        .sensoryFeedback(.success, trigger: copyTrigger)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                VStack(spacing: 1) {
                    Text("Jargon Translator")
                        .font(.headline)
                    if !sessionName.isEmpty {
                        Text(sessionName)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
    }
}
