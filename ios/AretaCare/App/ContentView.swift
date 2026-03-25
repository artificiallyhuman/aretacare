import SwiftUI
import RevenueCatUI

struct ContentView: View {
    @State private var authManager = AuthManager.shared
    @State private var subscriptionManager = SubscriptionManager.shared
    private let biometricManager = BiometricManager.shared

    var body: some View {
        Group {
            if authManager.isLoading {
                loadingView
                    .transition(.identity)
            } else if !authManager.isAuthenticated {
                if let mfaToken = authManager.mfaToken {
                    NavigationStack {
                        MFAVerifyView(mfaToken: mfaToken, mfaMethods: authManager.mfaMethods)
                    }
                    .transition(.identity)
                } else {
                    NavigationStack {
                        LoginView()
                    }
                    .transition(.identity)
                }
            } else if !authManager.hasAcceptedAIDataSharing {
                AIDataSharingConsentView()
                    .transition(.identity)
            } else if subscriptionManager.isCheckingEntitlement {
                loadingView
                    .transition(.identity)
            } else if !subscriptionManager.isProUser {
                subscriptionGateView
                    .transition(.identity)
            } else {
                MainTabView()
                    .idleTimeout(authManager: authManager)
                    .transition(.identity)
            }
        }
        .overlay {
            if authManager.isAuthenticated && biometricManager.isLocked {
                BiometricLockView()
            }
        }
    }

    // MARK: - Subscription Gate

    private var subscriptionGateView: some View {
        VStack(spacing: 0) {
            PaywallView()
                .onPurchaseCompleted { customerInfo in
                    subscriptionManager.updateEntitlements(from: customerInfo)
                }
                .onRestoreCompleted { customerInfo in
                    subscriptionManager.updateEntitlements(from: customerInfo)
                }

            HStack(spacing: 4) {
                Link("Terms of Service", destination: AppConstants.termsURL)
                Text("·")
                Link("Privacy Policy", destination: AppConstants.privacyURL)
            }
            .font(.caption2)
            .foregroundStyle(.secondary)
            .padding(.vertical, 8)
        }
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
