import SwiftUI

struct FeedbackView: View {
    @State private var name = AuthManager.shared.currentUser?.name ?? ""
    @State private var email = AuthManager.shared.currentUser?.email ?? ""
    @State private var selectedTypes: Set<FeedbackType> = []
    @State private var message = ""
    @State private var isSubmitting = false
    @State private var showingSuccess = false
    @State private var errorMessage: String?

    private var isLoggedIn: Bool { AuthManager.shared.isAuthenticated }

    var body: some View {
        Form {
            Section("Your Information") {
                TextField("Name", text: $name)
                    .textContentType(.name)
                    .disabled(isLoggedIn)

                TextField("Email", text: $email)
                    .keyboardType(.emailAddress)
                    .textContentType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .disabled(isLoggedIn)
            }

            Section("Feedback Type") {
                ForEach(FeedbackType.allCases, id: \.self) { type in
                    Button {
                        if selectedTypes.contains(type) {
                            selectedTypes.remove(type)
                        } else {
                            selectedTypes.insert(type)
                        }
                    } label: {
                        HStack {
                            Image(systemName: selectedTypes.contains(type) ? "checkmark.square.fill" : "square")
                                .foregroundStyle(selectedTypes.contains(type) ? Color.accentColor : Color.secondary)
                            Text(type.displayName)
                                .foregroundStyle(.primary)
                        }
                    }
                }
            }

            Section("Message") {
                TextEditor(text: $message)
                    .frame(minHeight: 120)
            }

            Section {
                Button {
                    submit()
                } label: {
                    if isSubmitting {
                        ProgressView()
                            .frame(maxWidth: .infinity)
                    } else {
                        Text("Submit Feedback")
                            .frame(maxWidth: .infinity)
                    }
                }
                .disabled(!isValid || isSubmitting)
            }

            if let error = errorMessage {
                Section {
                    ErrorBannerView(message: error) { errorMessage = nil }
                }
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())
            }
        }
        .navigationTitle("Feedback")
        .alert("Thank You!", isPresented: $showingSuccess) {
            Button("OK") {
                resetForm()
            }
        } message: {
            Text("Your feedback has been submitted. We appreciate you taking the time to help us improve.")
        }
    }

    private var isValid: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty &&
        !email.trimmingCharacters(in: .whitespaces).isEmpty &&
        !selectedTypes.isEmpty &&
        !message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func submit() {
        isSubmitting = true
        errorMessage = nil

        Task {
            defer { isSubmitting = false }

            do {
                let request = FeedbackSubmitRequest(
                    name: name.trimmingCharacters(in: .whitespaces),
                    email: email.trimmingCharacters(in: .whitespaces),
                    feedbackTypes: Array(selectedTypes),
                    message: message.trimmingCharacters(in: .whitespacesAndNewlines),
                    userAgent: "AretaCare iOS",
                    pageUrl: nil
                )
                let _: FeedbackResponse = try await APIClient.shared.post(
                    APIEndpoints.Feedback.submit,
                    body: request
                )
                showingSuccess = true
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    private func resetForm() {
        if !isLoggedIn {
            name = ""
            email = ""
        }
        selectedTypes = []
        message = ""
    }
}
