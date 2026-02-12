import SwiftUI

struct MainTabView: View {
    @State private var sessionVM = SessionViewModel()
    @State private var digestBadgeVM = DailyDigestViewModel()
    @AppStorage("activeTab") private var activeTab = 0
    private let networkMonitor = NetworkMonitor.shared
    private let notificationRouter = NotificationRouter.shared

    private var currentSessionId: String {
        sessionVM.currentSession?.id ?? ""
    }

    var body: some View {
        Group {
            if sessionVM.isLoading && sessionVM.currentSession == nil {
                LoadingView(message: "Loading sessions...")
            } else {
                TabView(selection: $activeTab) {
                    NavigationStack {
                        ConversationView(sessionVM: sessionVM)
                    }
                    .tag(0)
                    .tabItem {
                        Label {
                            Text("Chat")
                        } icon: {
                            Image(systemName: "bubble.left.and.bubble.right")
                                .environment(\.symbolVariants, .none)
                        }
                    }

                    NavigationStack {
                        DailyDigestView(sessionId: currentSessionId)
                    }
                    .tag(1)
                    .tabItem {
                        Label("Digest", systemImage: "doc.text.magnifyingglass")
                    }
                    .badge(digestBadgeVM.hasUnviewedDigest ? 1 : 0)

                    NavigationStack {
                        ToolsMenuView(sessionVM: sessionVM)
                    }
                    .tag(2)
                    .tabItem {
                        Label("Tools", systemImage: "wrench.and.screwdriver")
                    }

                    NavigationStack {
                        SettingsView()
                    }
                    .tag(3)
                    .tabItem {
                        Label("Settings", systemImage: "gear")
                    }
                }
                .overlay(alignment: .top) {
                    if !networkMonitor.isConnected {
                        HStack(spacing: 8) {
                            Image(systemName: "wifi.slash")
                                .font(.subheadline)
                            Text("No internet connection")
                                .font(.subheadline.weight(.medium))
                        }
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                        .background(Color.red.opacity(0.9))
                        .transition(.move(edge: .top).combined(with: .opacity))
                    }
                }
                .animation(.easeInOut(duration: 0.3), value: networkMonitor.isConnected)
                .collaborationAwareness(session: sessionVM.currentSession)
            }
        }
        .task {
            await sessionVM.fetchSessions()
        }
        .task(id: currentSessionId) {
            guard !currentSessionId.isEmpty else { return }
            await digestBadgeVM.fetchAll(sessionId: currentSessionId)
            // If already on Digest tab, mark as viewed immediately
            if activeTab == 1, digestBadgeVM.hasUnviewedDigest,
               let latest = digestBadgeVM.sortedDigests.first {
                await digestBadgeVM.markViewed(planId: latest.id)
            }
        }
        .onChange(of: activeTab) { oldTab, newTab in
            if newTab == 1, digestBadgeVM.hasUnviewedDigest,
               let latest = digestBadgeVM.sortedDigests.first {
                Task { await digestBadgeVM.markViewed(planId: latest.id) }
            }
            // Refresh badge when leaving Digest tab (picks up viewed changes from DailyDigestView)
            if oldTab == 1, !currentSessionId.isEmpty {
                Task { await digestBadgeVM.fetchAll(sessionId: currentSessionId) }
            }
        }
        .onChange(of: notificationRouter.pendingSessionId) { _, sessionId in
            guard let sessionId else { return }
            if sessionVM.currentSession?.id != sessionId,
               let session = sessionVM.sessions.first(where: { $0.id == sessionId }) {
                sessionVM.switchSession(to: session)
            }
            activeTab = 0
            notificationRouter.clearPendingRoute()
        }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.willEnterForegroundNotification)) { _ in
            NotificationManager.shared.clearBadge()
        }
    }
}

#Preview {
    MainTabView()
}
