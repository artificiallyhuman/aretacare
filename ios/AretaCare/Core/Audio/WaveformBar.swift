import SwiftUI

struct WaveformBar: View {
    let isAnimating: Bool
    let delay: Double
    var audioLevel: Float? = nil

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var height: CGFloat = 8

    var body: some View {
        RoundedRectangle(cornerRadius: 3)
            .fill(Color.accentColor)
            .frame(width: 6, height: height)
            .onChange(of: isAnimating, initial: true) { _, animating in
                if animating && audioLevel == nil {
                    animateRandom()
                } else if !animating {
                    withAnimation(reduceMotion ? nil : .easeOut(duration: 0.3)) {
                        height = 8
                    }
                }
            }
            .onChange(of: audioLevel ?? 0) { _, level in
                guard isAnimating, audioLevel != nil else { return }
                withAnimation(reduceMotion ? nil : .easeOut(duration: 0.08)) {
                    let jitter = CGFloat(1.0 + delay * 2)
                    height = max(8, CGFloat(level) * 56 * jitter)
                }
            }
    }

    private func animateRandom() {
        guard !reduceMotion else {
            height = 32
            return
        }
        withAnimation(
            .easeInOut(duration: 0.5)
            .repeatForever(autoreverses: true)
            .delay(delay)
        ) {
            height = CGFloat.random(in: 16...56)
        }
    }
}
