import SwiftUI

struct ContentView: View {
    @State private var authManager = AuthManager.shared
    private let biometricManager = BiometricManager.shared

    var body: some View {
        Group {
            if authManager.isLoading {
                loadingView
            } else if !authManager.isAuthenticated {
                if let mfaToken = authManager.mfaToken {
                    NavigationStack {
                        MFAVerifyView(mfaToken: mfaToken, mfaMethods: authManager.mfaMethods)
                    }
                } else {
                    NavigationStack {
                        LoginView()
                    }
                }
            } else {
                MainTabView()
                    .idleTimeout(authManager: authManager)
            }
        }
        .overlay {
            if authManager.isAuthenticated && biometricManager.isLocked {
                BiometricLockView()
                    .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.3), value: biometricManager.isLocked)
    }

    private var loadingView: some View {
        VStack(spacing: 16) {
            Image("large_logo")
                .resizable()
                .scaledToFit()
                .frame(width: 80, height: 80)

            ProgressView()

            HStack(spacing: 0) {
                Text("AretaCare")
                    .font(.title2)
                    .fontWeight(.bold)
                Text("\u{2122}")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }

            Text("Calm | Clarity | Confidence")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}

#Preview {
    ContentView()
}
