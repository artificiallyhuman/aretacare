import SwiftUI
import RevenueCatUI

struct ContentView: View {
    @State private var authManager = AuthManager.shared
    @State private var subscriptionManager = SubscriptionManager.shared
    private let biometricManager = BiometricManager.shared
    @Environment(\.scenePhase) private var scenePhase

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
        .accessibilityHidden(biometricManager.isLocked)
        .overlay {
            if authManager.isAuthenticated && biometricManager.isLocked {
                BiometricLockView()
            }
        }
        .overlay {
            // Privacy shield: hide content from the app-switcher snapshot while
            // the app is not active. Shown for all users regardless of auth
            // state, since login/MFA screens also contain personal data.
            if scenePhase != .active {
                privacyShield
                    .transition(.identity)
            }
        }
    }

    // MARK: - Privacy Shield

    private var privacyShield: some View {
        ZStack {
            Color(.systemBackground)
                .ignoresSafeArea()

            VStack(spacing: 16) {
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
