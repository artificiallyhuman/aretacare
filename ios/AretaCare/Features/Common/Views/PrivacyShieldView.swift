import SwiftUI

/// Branded full-screen cover shown while the app is not active, so the
/// app-switcher snapshot never exposes health data. Hosted in the privacy
/// overlay window (see `PrivacyShieldWindow.swift`) so it also covers
/// presented sheets and full-screen covers.
struct PrivacyShieldView: View {
    var body: some View {
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
}
