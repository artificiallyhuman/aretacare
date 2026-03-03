import SwiftUI

struct WaitlistView: View {
    @State private var email = ""
    @State private var message = ""
    @State private var isSubmitting = false
    @State private var result: WaitlistResult?

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                // Header
                AuthHeaderView()
                    .padding(.top, 20)

                Text("Join the Waitlist")
                    .font(.title2.weight(.bold))

                // Intro paragraphs
                VStack(alignment: .leading, spacing: 12) {
                    Text("AretaCare began as a platform for family and friends, and we\u{2019}ve been inspired by the early interest it\u{2019}s received. To ensure we grow in a thoughtful and sustainable way, we\u{2019}re inviting new users in phases.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)

                    Text("Please submit your email address, and we\u{2019}ll reach out with an invitation as space becomes available.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)

                    Text("Your interest means a great deal to us and helps guide our investment in the platform. Thank you for your patience.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                // Form or Result
                switch result {
                case .none:
                    formContent

                case .success(let msg):
                    VStack(spacing: 12) {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 48))
                            .foregroundStyle(.green)
                        Text("You are on the list!")
                            .font(.title3.weight(.semibold))
                        Text(msg)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    .padding(.top, 20)

                case .alreadyOnList(let msg):
                    VStack(spacing: 12) {
                        Image(systemName: "info.circle.fill")
                            .font(.system(size: 48))
                            .foregroundStyle(.blue)
                        Text("Already on the list")
                            .font(.title3.weight(.semibold))
                        Text(msg)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    .padding(.top, 20)

                case .error(let msg):
                    VStack(spacing: 12) {
                        ErrorBannerView(message: msg)
                        Button("Try Again") {
                            result = nil
                        }
                        .buttonStyle(.bordered)
                    }
                }

                // Founder section
                Text("\u{2014} Jason & Rob, Co-Founders")
                    .font(.subheadline.italic())
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .trailing)
                    .padding(.top, 8)
            }
            .padding()
        }
        .navigationTitle("Waitlist")
    }

    private var formContent: some View {
        VStack(spacing: 16) {
            VStack(alignment: .leading, spacing: 8) {
                Text("Email")
                    .font(.subheadline.weight(.medium))
                TextField("your@email.com", text: $email)
                    .keyboardType(.emailAddress)
                    .textContentType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .textFieldStyle(.roundedBorder)
                    .tint(.primary)
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("Message (optional)")
                    .font(.subheadline.weight(.medium))
                TextEditor(text: $message)
                    .frame(minHeight: 80)
                    .padding(4)
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(Color(.separator), lineWidth: 0.5)
                    )
                    .onChange(of: message) { _, newValue in
                        if newValue.count > 1000 {
                            message = String(newValue.prefix(1000))
                        }
                    }

                Text("\(message.count)/1000")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .trailing)
            }

            Button {
                submit()
            } label: {
                if isSubmitting {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                } else {
                    Text("Join Waitlist")
                        .frame(maxWidth: .infinity)
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(email.trimmingCharacters(in: .whitespaces).isEmpty || isSubmitting)
        }
    }

    private func submit() {
        isSubmitting = true
        Task {
            defer { isSubmitting = false }

            do {
                let request = WaitlistJoinRequest(
                    email: email.trimmingCharacters(in: .whitespaces),
                    message: message.isEmpty ? nil : message
                )
                let response: WaitlistJoinResponse = try await APIClient.shared.post(
                    APIEndpoints.Waitlist.join,
                    body: request
                )

                if response.alreadyOnList {
                    result = .alreadyOnList(response.message)
                } else {
                    result = .success(response.message)
                }
            } catch {
                result = .error(error.localizedDescription)
            }
        }
    }
}

private enum WaitlistResult {
    case success(String)
    case alreadyOnList(String)
    case error(String)
}
