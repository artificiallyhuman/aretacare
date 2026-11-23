import CarPlay
import UIKit

/// Images for the CarPlay screens, drawn in code: SF Symbols for the grid and buttons, and
/// short waveform animations for the voice screen's states. No asset files.
@available(iOS 26.4, *)
@MainActor
enum CarPlayImages {
    /// A symbol for a button. CarPlay tints template images itself.
    static func symbol(_ name: String, pointSize: CGFloat = 28) -> UIImage {
        let configuration = UIImage.SymbolConfiguration(pointSize: pointSize, weight: .semibold)
        return UIImage(systemName: name, withConfiguration: configuration) ?? UIImage()
    }

    /// A landing-grid icon, sized to what the car's grid can show.
    static func gridIcon(_ name: String) -> UIImage {
        let maxSize = CPGridTemplate.maximumGridButtonImageSize
        let side = min(maxSize.width, maxSize.height)
        return symbol(name, pointSize: max(24, side * 0.6))
    }

    // MARK: - Voice screen

    /// 150 × 150 pt is the voice control template's maximum, drawn at the car screen's scale.
    private static let canvas = CGSize(width: 150, height: 150)
    private static let tint = UIColor.systemBlue

    /// Rendered once per state and scale: the frames are a few megabytes in all, and a call
    /// screen is built for every call.
    private static var cache: [String: UIImage] = [:]

    static func voiceState(_ state: CarPlayCallScreen.State, scale: CGFloat) -> UIImage {
        let scale = min(max(scale, 2), 3)
        let key = "\(state.rawValue)@\(scale)"
        if let cached = cache[key] { return cached }
        let image = render(state, scale: scale)
        cache[key] = image
        return image
    }

    private static func render(_ state: CarPlayCallScreen.State, scale: CGFloat) -> UIImage {
        switch state {
        case .connecting:
            // A slow sweep across low bars.
            let frames = (0..<6).map { step in
                bars((0..<5).map { index in index == step % 5 ? 0.45 : 0.18 }, scale: scale)
            }
            return animated(frames, duration: 1.2)
        case .listening:
            // Gentle breathing: ready for the person to speak.
            let frames = [0.25, 0.32, 0.38, 0.32].map { height in
                bars([height * 0.8, height, height * 1.15, height, height * 0.8], scale: scale)
            }
            return animated(frames, duration: 1.6)
        case .speaking:
            // Livelier bars while AretaCare speaks.
            let patterns: [[Double]] = [
                [0.35, 0.7, 0.5, 0.85, 0.4],
                [0.6, 0.4, 0.9, 0.5, 0.65],
                [0.45, 0.85, 0.6, 0.4, 0.75],
                [0.7, 0.5, 0.75, 0.9, 0.45],
                [0.4, 0.65, 0.45, 0.6, 0.85],
                [0.55, 0.9, 0.7, 0.45, 0.6],
            ]
            return animated(patterns.map { bars($0, scale: scale) }, duration: 0.9)
        case .working:
            // Three dots taking turns: looking something up.
            let frames = (0..<3).map { lit in dots(lit: lit, scale: scale) }
            return animated(frames, duration: 1.2)
        case .muted:
            let configuration = UIImage.SymbolConfiguration(pointSize: 64, weight: .medium)
            let image = UIImage(systemName: "mic.slash.fill", withConfiguration: configuration)?
                .withTintColor(.systemGray, renderingMode: .alwaysOriginal)
            return image ?? UIImage()
        }
    }

    private static func animated(_ frames: [UIImage], duration: TimeInterval) -> UIImage {
        UIImage.animatedImage(with: frames, duration: duration) ?? frames.first ?? UIImage()
    }

    private static func renderer(scale: CGFloat) -> UIGraphicsImageRenderer {
        let format = UIGraphicsImageRendererFormat()
        format.scale = scale
        format.opaque = false
        return UIGraphicsImageRenderer(size: canvas, format: format)
    }

    /// Five rounded bars, each `height` a fraction of the canvas.
    private static func bars(_ heights: [Double], scale: CGFloat) -> UIImage {
        renderer(scale: scale).image { _ in
            let barWidth: CGFloat = 14
            let gap: CGFloat = 10
            let total = CGFloat(heights.count) * barWidth + CGFloat(heights.count - 1) * gap
            var x = (canvas.width - total) / 2
            tint.setFill()
            for height in heights {
                let barHeight = max(barWidth, canvas.height * 0.8 * CGFloat(height))
                let rect = CGRect(x: x, y: (canvas.height - barHeight) / 2, width: barWidth, height: barHeight)
                UIBezierPath(roundedRect: rect, cornerRadius: barWidth / 2).fill()
                x += barWidth + gap
            }
        }
    }

    /// Three dots, the `lit` one full strength.
    private static func dots(lit: Int, scale: CGFloat) -> UIImage {
        renderer(scale: scale).image { _ in
            let diameter: CGFloat = 20
            let gap: CGFloat = 16
            let total = 3 * diameter + 2 * gap
            var x = (canvas.width - total) / 2
            for index in 0..<3 {
                tint.withAlphaComponent(index == lit ? 1 : 0.35).setFill()
                UIBezierPath(ovalIn: CGRect(x: x, y: (canvas.height - diameter) / 2,
                                            width: diameter, height: diameter)).fill()
                x += diameter + gap
            }
        }
    }
}
