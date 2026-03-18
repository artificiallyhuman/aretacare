import SwiftUI

struct AIDataSharingConsentView: View {
    @State private var authManager = AuthManager.shared
    @State private var isAccepting = false
    @State private var errorMessage: String?

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                // Logo and title
                VStack(spacing: 12) {
                    Image("large_logo")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 64, height: 64)

                    Text("How AretaCare Uses AI")
                        .font(.title2)
                        .fontWeight(.bold)

                    Text("Before you begin, please review how your data is processed by a third-party AI service.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
                .padding(.top, 32)

                // Data categories
                VStack(spacing: 16) {
                    DataCategoryRow(
                        icon: "bubble.left.and.bubble.right",
                        title: "Conversations",
                        description: "Messages and chat history"
                    )
                    DataCategoryRow(
                        icon: "heart.text.clipboard",
                        title: "Health Information",
                        description: "Profile, conditions, medications, allergies"
                    )
                    DataCategoryRow(
                        icon: "doc.richtext",
                        title: "Documents & Audio",
                        description: "Uploaded files and recordings"
                    )
                    DataCategoryRow(
                        icon: "book.closed",
                        title: "Journal & Digests",
                        description: "Notes, summaries, and daily digests"
                    )
                }
                .padding()
                .background(Color(.secondarySystemGroupedBackground))
                .clipShape(RoundedRectangle(cornerRadius: 12))

                // Disclosure text
                VStack(spacing: 12) {
                    Text("This data is sent to **OpenAI** to power AretaCare's AI features, including conversation responses, journal synthesis, daily digests, audio transcription, and health profile generation.")
                        .font(.subheadline)

                    Text("OpenAI processes this data under their API data usage policy and **does not use it to train their models**.")
                        .font(.subheadline)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                // Links
                VStack(spacing: 8) {
                    Link(destination: AppConstants.privacyURL) {
                        HStack {
                            Text("AretaCare Privacy Policy")
                                .font(.subheadline)
                            Spacer()
                            Image(systemName: "arrow.up.right")
                                .font(.caption)
                        }
                    }

                    Divider()

                    Link(destination: URL(string: "https://openai.com/enterprise-privacy/")!) {
                        HStack {
                            Text("OpenAI API Data Privacy")
                                .font(.subheadline)
                            Spacer()
                            Image(systemName: "arrow.up.right")
                                .font(.caption)
                        }
                    }
                }
                .padding()
                .background(Color(.secondarySystemGroupedBackground))
                .clipShape(RoundedRectangle(cornerRadius: 12))

                // Error message
                if let errorMessage {
                    Text(errorMessage)
                        .font(.caption)
                        .foregroundStyle(.red)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                // Accept button
                Button(action: acceptConsent) {
                    if isAccepting {
                        ProgressView()
                            .frame(maxWidth: .infinity)
                    } else {
                        Text("I Understand and Agree")
                            .frame(maxWidth: .infinity)
                    }
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(isAccepting)

                Spacer(minLength: 32)
            }
            .padding(.horizontal)
            .frame(maxWidth: 500)
            .frame(maxWidth: .infinity)
        }
        .background(Color(.systemGroupedBackground))
    }

    private func acceptConsent() {
        isAccepting = true
        errorMessage = nil

        Task {
            do {
                try await authManager.acceptAIDataSharing()
            } catch {
                errorMessage = "Something went wrong. Please try again."
                isAccepting = false
            }
        }
    }
}

// MARK: - Data Category Row

private struct DataCategoryRow: View {
    let icon: String
    let title: String
    let description: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundStyle(Color.accentColor)
                .frame(width: 32)

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.subheadline)
                    .fontWeight(.medium)
                Text(description)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()
        }
    }
}

#Preview {
    AIDataSharingConsentView()
}
