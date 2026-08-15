import SwiftUI
import RevenueCatUI

struct ContentView: View {
    @State private var authManager = AuthManager.shared
    @State private var subscriptionManager = SubscriptionManager.shared
    @State private var isSigningOut = false
    private let biometricManager = BiometricManager.shared

    var body: some View {
        Group {
            if authManager.isLoading {
                loadingView
                    .transition(.identity)
            } else if !authManager.isAuthenticated {
                if let startupError = authManager.startupErrorMessage, authManager.hasStoredSession {
                    // The session couldn't be restored for a transient reason and
                    // the stored credentials are intact — offer a retry rather
                    // than presenting this as a sign-out.
                    sessionUnavailableView(message: startupError)
                        .transition(.identity)
                } else if let mfaToken = authManager.mfaToken {
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
        // The biometric lock and privacy shield render in a dedicated window
        // above all presented sheets (see Core/Security/PrivacyShieldWindow.swift).
        .accessibilityHidden(biometricManager.isLocked)
    }

    // MARK: - Session Unavailable (transient)

    private func sessionUnavailableView(message: String) -> some View {
        VStack(spacing: 20) {
            Image("large_logo")
                .resizable()
                .scaledToFit()
                .frame(width: 72, height: 72)

            Text("Can't reach AretaCare")
                .font(.title3.weight(.semibold))

            Text(message)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            Button("Try Again") {
                Task { await authManager.retryInitAuth() }
            }
            .buttonStyle(PrimaryButtonStyle())

            Button("Sign In Instead") {
                authManager.dismissStartupError()
            }
            .font(.subheadline)
        }
        .padding(32)
        .frame(maxWidth: 500)
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

            VStack(spacing: 6) {
                // Without this the paywall is a dead end: a signed-in account
                // with no subscription can neither reach the app nor get back
                // to the login screen to use a different one.
                Button("Use a Different Account") {
                    guard !isSigningOut else { return }
                    isSigningOut = true
                    Task {
                        await authManager.logout()
                        isSigningOut = false
                    }
                }
                .font(.subheadline)
                .disabled(isSigningOut)

                HStack(spacing: 4) {
                    Link("Terms of Service", destination: AppConstants.termsURL)
                    Text("·")
                    Link("Privacy Policy", destination: AppConstants.privacyURL)
                }
                .font(.caption2)
                .foregroundStyle(.secondary)
            }
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
