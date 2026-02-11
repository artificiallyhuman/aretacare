import SwiftUI

struct VerifyEmailView: View {
    let token: String

    @State private var viewModel = AuthViewModel()
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 24) {
            Spacer()

            AuthHeaderView(compact: true)

            switch viewModel.emailVerificationStatus {
            case .pending, .verifying:
                VStack(spacing: 16) {
                    ProgressView()
                        .scaleEffect(1.5)

                    Text("Verifying your email...")
                        .font(.headline)
                        .foregroundStyle(.secondary)
                }

            case .success:
                VStack(spacing: 16) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 56))
                        .foregroundStyle(.green)

                    Text("Email Verified")
                        .font(.title2)
                        .fontWeight(.bold)

                    Text("Your email has been verified successfully. You can now log in to your account.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)

                    Button("Return to Login") {
                        dismiss()
                    }
                    .font(.headline)
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.blue)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .padding(.top, 8)
                }

            case .failed(let message):
                VStack(spacing: 16) {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 56))
                        .foregroundStyle(.red)

                    Text("Verification Failed")
                        .font(.title2)
                        .fontWeight(.bold)

                    Text(message)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)

                    Button("Return to Login") {
                        dismiss()
                    }
                    .font(.headline)
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.blue)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .padding(.top, 8)
                }
            }

            Spacer()
        }
        .padding(.horizontal, 24)
        .navigationTitle("Verify Email")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await viewModel.verifyEmail(token: token)
        }
    }
}

#Preview {
    NavigationStack {
        VerifyEmailView(token: "preview-token")
    }
}
