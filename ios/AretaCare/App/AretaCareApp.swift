import SwiftUI
import RevenueCat

@main
struct AretaCareApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @State private var authManager = AuthManager.shared
    @State private var deepLinkRoute: DeepLinkRoute?
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            ContentView()
                .fullScreenCover(item: $deepLinkRoute) { route in
                    NavigationStack {
                        deepLinkDestination(for: route)
                    }
                }
                .task {
                    SubscriptionManager.shared.configure()
                    await authManager.initAuth()
                }
                .onReceive(NotificationCenter.default.publisher(for: UIApplication.didReceiveMemoryWarningNotification)) { _ in
                    ImageCache.shared.clear()
                }
                .onOpenURL { url in
                    handleUniversalLink(url)
                }
                .onChange(of: scenePhase) { _, newPhase in
                    switch newPhase {
                    case .background:
                        BiometricManager.shared.appDidEnterBackground()
                    case .active:
                        BiometricManager.shared.appWillEnterForeground()
                    default:
                        break
                    }
                }
        }
    }

    // MARK: - Deep Link Handling

    private func handleUniversalLink(_ url: URL) {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return }
        let path = components.path
        let queryItems = components.queryItems ?? []

        if path.contains("verify-email"), let token = queryItems.first(where: { $0.name == "token" })?.value {
            guard isValidDeepLinkToken(token) else { return }
            deepLinkRoute = .verifyEmail(token: token)
        } else if path.contains("password-reset"), let token = queryItems.first(where: { $0.name == "token" })?.value {
            guard isValidDeepLinkToken(token) else { return }
            deepLinkRoute = .resetPassword(token: token)
        } else if path.contains("register"), let token = queryItems.first(where: { $0.name == "invitation" })?.value {
            guard isValidDeepLinkToken(token) else { return }
            deepLinkRoute = .register(invitationToken: token)
        }
    }

    /// Validates that a deep link token is well-formed before passing it to views.
    /// Rejects empty, excessively long, or tokens with unexpected characters to
    /// prevent injection attacks via crafted universal links.
    private func isValidDeepLinkToken(_ token: String) -> Bool {
        guard !token.isEmpty, token.count <= 500 else { return false }
        let allowedCharacters = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-_"))
        return token.unicodeScalars.allSatisfy { allowedCharacters.contains($0) }
    }

    @ViewBuilder
    private func deepLinkDestination(for route: DeepLinkRoute) -> some View {
        switch route {
        case .verifyEmail(let token):
            VerifyEmailView(token: token)
        case .resetPassword(let token):
            ResetPasswordView(token: token)
        case .register(let invitationToken):
            RegisterView(invitationToken: invitationToken)
        }
    }
}

// MARK: - Deep Link Routes

enum DeepLinkRoute: Equatable, Identifiable {
    case verifyEmail(token: String)
    case resetPassword(token: String)
    case register(invitationToken: String)

    var id: String {
        switch self {
        case .verifyEmail(let token): return "verify-\(token)"
        case .resetPassword(let token): return "reset-\(token)"
        case .register(let token): return "register-\(token)"
        }
    }
}
