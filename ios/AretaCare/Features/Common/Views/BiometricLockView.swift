import SwiftUI

struct BiometricLockView: View {
    @State private var authFailed = false
    @State private var isAuthenticating = false
    private let biometricManager = BiometricManager.shared

    var body: some View {
        ZStack {
            Color(.systemBackground)
                .ignoresSafeArea()

            VStack(spacing: 24) {
                Image("large_logo")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 80, height: 80)

                HStack(spacing: 0) {
                    Text("AretaCare")
                        .font(.title2)
                        .fontWeight(.bold)
                    Text("\u{2122}")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }

                Image(systemName: lockIcon)
                    .font(.system(size: 48))
                    .foregroundStyle(Color.accentColor)

                Text("App Locked")
                    .font(.title3.weight(.semibold))

                Text("Authenticate to access your health information.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)

                if authFailed {
                    Text("Authentication failed. Please try again.")
                        .font(.caption)
                        .foregroundStyle(.red)
                }

                Button {
                    Task { await authenticate() }
                } label: {
                    Label("Unlock", systemImage: lockIcon)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .disabled(isAuthenticating)
                .padding(.horizontal, 40)
            }
            .padding()
        }
        .task {
            await authenticate()
        }
    }

    private var lockIcon: String {
        switch biometricManager.biometricType {
        case .faceID: return "faceid"
        case .touchID: return "touchid"
        case .none: return "lock"
        }
    }

    private func authenticate() async {
        isAuthenticating = true
        authFailed = false
        let success = await biometricManager.unlock()
        isAuthenticating = false
        if !success {
            authFailed = true
        }
    }
}
