import SwiftUI

struct IdleTimeoutView: View {
    @State private var secondsRemaining = Int(AppConstants.idleWarningSeconds)
    @State private var timer: Timer?

    let onStayLoggedIn: () -> Void
    let onTimeout: () -> Void

    var body: some View {
        ZStack {
            Color.black.opacity(0.5)
                .ignoresSafeArea()

            VStack(spacing: 20) {
                Image(systemName: "clock.badge.exclamationmark")
                    .font(.largeTitle)
                    .imageScale(.large)
                    .foregroundStyle(.orange)
                    .accessibilityHidden(true)

                Text("Session Timeout Warning")
                    .font(.title3.weight(.bold))

                Text("You will be logged out in \(secondsRemaining) seconds due to inactivity.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)

                // Countdown
                Text("\(secondsRemaining)")
                    .font(.system(size: 36, weight: .bold, design: .monospaced))
                    .foregroundStyle(secondsRemaining <= 10 ? .red : .primary)

                Button {
                    stopTimer()
                    onStayLoggedIn()
                } label: {
                    Text("Stay Logged In")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
            }
            .padding(32)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 20))
            .padding(40)
        }
        .onAppear {
            startTimer()
        }
        .onDisappear {
            stopTimer()
        }
    }

    private func startTimer() {
        secondsRemaining = Int(AppConstants.idleWarningSeconds)
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
            if secondsRemaining > 0 {
                secondsRemaining -= 1
            } else {
                stopTimer()
                onTimeout()
            }
        }
    }

    private func stopTimer() {
        timer?.invalidate()
        timer = nil
    }
}

// MARK: - Transparent Activity Tracker
// Uses a UIView overlay whose hitTest always returns nil so touches
// pass through to NavigationLinks, back buttons, etc.

private struct ActivityTrackingView: UIViewRepresentable {
    let onActivity: () -> Void

    func makeUIView(context: Context) -> ActivityTrackingUIView {
        let view = ActivityTrackingUIView()
        view.onActivity = onActivity
        view.backgroundColor = .clear
        view.isUserInteractionEnabled = true
        return view
    }

    func updateUIView(_ uiView: ActivityTrackingUIView, context: Context) {
        uiView.onActivity = onActivity
    }
}

private class ActivityTrackingUIView: UIView {
    var onActivity: (() -> Void)?

    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        // Record activity on every touch, but never consume the event
        if event?.type == .touches {
            onActivity?()
        }
        return nil
    }
}

// MARK: - View Modifier

struct IdleTimeoutModifier: ViewModifier {
    let authManager: AuthManager

    func body(content: Content) -> some View {
        content
            .overlay {
                if authManager.showIdleWarning {
                    IdleTimeoutView(
                        onStayLoggedIn: {
                            authManager.recordActivity()
                        },
                        onTimeout: {
                            Task { await authManager.logout() }
                        }
                    )
                }
            }
            .overlay {
                ActivityTrackingView {
                    authManager.recordActivity()
                }
            }
    }
}

extension View {
    func idleTimeout(authManager: AuthManager) -> some View {
        modifier(IdleTimeoutModifier(authManager: authManager))
    }
}
