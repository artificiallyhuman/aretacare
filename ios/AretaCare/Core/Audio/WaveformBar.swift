import SwiftUI

struct WaveformBar: View {
    let isAnimating: Bool
    let delay: Double

    @State private var height: CGFloat = 8

    var body: some View {
        RoundedRectangle(cornerRadius: 3)
            .fill(Color.accentColor)
            .frame(width: 6, height: height)
            .onChange(of: isAnimating, initial: true) { _, animating in
                if animating {
                    animate()
                } else {
                    withAnimation(.easeOut(duration: 0.3)) {
                        height = 8
                    }
                }
            }
    }

    private func animate() {
        withAnimation(
            .easeInOut(duration: 0.5)
            .repeatForever(autoreverses: true)
            .delay(delay)
        ) {
            height = CGFloat.random(in: 16...56)
        }
    }
}
