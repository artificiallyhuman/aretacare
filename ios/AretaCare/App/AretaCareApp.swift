import SwiftUI

@main
struct AretaCareApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @State private var authManager = AuthManager.shared
    @State private var deepLinkRoute: DeepLinkRoute?
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            ContentView()
                .overlay {
                    if let route = deepLinkRoute {
                        NavigationStack {
                            deepLinkDestination(for: route)
                        }
                    }
                }
                .task {
                    await authManager.initAuth()
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
            deepLinkRoute = .verifyEmail(token: token)
        } else if path.contains("password-reset"), let token = queryItems.first(where: { $0.name == "token" })?.value {
            deepLinkRoute = .resetPassword(token: token)
        } else if path.contains("register"), let token = queryItems.first(where: { $0.name == "invitation" })?.value {
            deepLinkRoute = .register(invitationToken: token)
        }
    }

    @ViewBuilder
    private func deepLinkDestination(for route: DeepLinkRoute) -> some View {
        switch route {
        case .verifyEmail(let token):
            VerifyEmailView(token: token)
                .onDisappear { deepLinkRoute = nil }
        case .resetPassword(let token):
            ResetPasswordView(token: token)
                .onDisappear { deepLinkRoute = nil }
        case .register(let invitationToken):
            RegisterView(invitationToken: invitationToken)
                .onDisappear { deepLinkRoute = nil }
        }
    }
}

// MARK: - Deep Link Routes

enum DeepLinkRoute: Equatable {
    case verifyEmail(token: String)
    case resetPassword(token: String)
    case register(invitationToken: String)
}
