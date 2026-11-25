import CarPlay
import SwiftUI
import UIKit

/// Images for the CarPlay screens, drawn in code (no asset files): colored icon tiles for the
/// landing screen, the voice screen's Mute and End buttons, its state animations, and (iOS 27)
/// its backgrounds. Colors come from the app icon: navy, teal, sky blue and mint.
///
/// CarPlay tints template images (plain SF Symbols) itself and shows the others as drawn, so
/// everything colored here is marked `.alwaysOriginal`.
@available(iOS 26.4, *)
@MainActor
enum CarPlayImages {
    /// A symbol for a button, tinted by CarPlay.
    static func symbol(_ name: String, pointSize: CGFloat = 28) -> UIImage {
        let configuration = UIImage.SymbolConfiguration(pointSize: pointSize, weight: .semibold)
        return UIImage(systemName: name, withConfiguration: configuration) ?? UIImage()
    }

    // MARK: - Landing screen

    /// A gradient from top-leading to bottom-trailing.
    struct Gradient {
        let top: UIColor
        let bottom: UIColor
    }

    /// The four one-tap starts, each its own color so they read apart at a glance.
    static let talkColors = Gradient(top: UIColor(hex: 0x3FE0B4), bottom: UIColor(hex: 0x0E9CC4))
    static let catchUpColors = Gradient(top: UIColor(hex: 0xFFC65C), bottom: UIColor(hex: 0xF27A36))
    static let visitPrepColors = Gradient(top: UIColor(hex: 0x6CC6FF), bottom: UIColor(hex: 0x2D67DD))
    static let visitDebriefColors = Gradient(top: UIColor(hex: 0xB89CFF), bottom: UIColor(hex: 0x7446DB))
    /// A care session with no color of its own: the app icon's navy.
    private static let sessionColors = Gradient(top: UIColor(hex: 0x1C5D93), bottom: UIColor(hex: 0x0A355C))

    /// A round tile with a white symbol, sized for the list's pinned buttons.
    static func startTile(_ symbol: String, colors: Gradient, scale: CGFloat) -> UIImage {
        let size = CPListTemplate.maximumGridButtonImageSize
        return tile(symbol, colors: colors, side: max(32, min(size.width, size.height)), scale: scale)
    }

    /// The care session row's icon, in the care session's own color (the swatch the phone's
    /// switcher shows), or navy when it has none.
    static func sessionIcon(colorKey: String?, scale: CGFloat) -> UIImage {
        let size = CPListItem.maximumImageSize
        let side = max(24, min(size.width, size.height))
        if let swatch = SessionColors.color(forKey: colorKey)?.swatchDark {
            let color = UIColor(swatch)
            return tile("heart.fill", colors: Gradient(top: color.lighter(0.18), bottom: color), side: side, scale: scale)
        }
        return tile("heart.fill", colors: sessionColors, side: side, scale: scale)
    }

    private static func tile(_ symbol: String, colors: Gradient, side: CGFloat, scale: CGFloat) -> UIImage {
        let canvas = CGSize(width: side, height: side)
        let image = renderer(canvas, scale: scale).image { context in
            let cg = context.cgContext
            let circle = UIBezierPath(ovalIn: CGRect(origin: .zero, size: canvas))
            cg.saveGState()
            circle.addClip()
            fillLinear(cg, colors: [colors.top, colors.bottom], from: .zero, to: CGPoint(x: side, y: side))
            // A soft highlight on the upper half, for a little depth.
            fillRadial(cg, color: .white, alpha: 0.22, center: CGPoint(x: side * 0.35, y: side * 0.2), radius: side * 0.7)
            cg.restoreGState()
            drawSymbol(symbol, color: .white, in: CGRect(origin: .zero, size: canvas).insetBy(dx: side * 0.24, dy: side * 0.24))
        }
        return image.withRenderingMode(.alwaysOriginal)
    }

    // MARK: - Voice screen buttons

    private static var buttonSide: CGFloat {
        min(40, CPButtonMaximumImageSize.width, CPButtonMaximumImageSize.height)
    }

    /// Mute shows the slashed microphone either way, like the Phone app's mute button. While
    /// muted it lights up: a white circle with the microphone in red (the screen's background
    /// also turns red, and the title says Muted).
    static func muteButton(muted: Bool, scale: CGFloat) -> UIImage {
        guard muted else { return symbol("mic.slash.fill") }
        return disc("mic.slash.fill", fill: .white, glyph: .systemRed, scale: scale)
    }

    /// End is the red hang-up button everyone knows from phone calls.
    static func endButton(scale: CGFloat) -> UIImage {
        disc("phone.down.fill", fill: .systemRed, glyph: .white, scale: scale)
    }

    private static func disc(_ symbol: String, fill: UIColor, glyph: UIColor, scale: CGFloat) -> UIImage {
        let side = buttonSide
        let canvas = CGSize(width: side, height: side)
        return renderer(canvas, scale: scale).image { _ in
            fill.setFill()
            UIBezierPath(ovalIn: CGRect(origin: .zero, size: canvas)).fill()
            drawSymbol(symbol, color: glyph, in: CGRect(origin: .zero, size: canvas).insetBy(dx: side * 0.21, dy: side * 0.21))
        }.withRenderingMode(.alwaysOriginal)
    }

    // MARK: - Voice screen states

    /// Each state's color, shared by its animation and its background glow.
    private static func accent(_ state: CarPlayCallScreen.State) -> UIColor {
        switch state {
        case .connecting: return UIColor(hex: 0x8DD5EE)
        case .listening: return UIColor(hex: 0x2BD3A0)
        case .speaking: return UIColor(hex: 0x4FB3F6)
        case .working: return UIColor(hex: 0x9F84FF)
        case .muted: return .systemRed
        }
    }

    /// 150 × 150 pt is the voice control template's maximum, drawn at the car screen's scale.
    private static let stateCanvas = CGSize(width: 150, height: 150)

    /// Rendered once per state and scale: the frames are a few megabytes in all, and a call
    /// screen is built for every call.
    private static var cache: [String: UIImage] = [:]

    static func voiceState(_ state: CarPlayCallScreen.State, scale: CGFloat) -> UIImage {
        let scale = clamped(scale)
        let key = "state.\(state.rawValue)@\(scale)"
        if let cached = cache[key] { return cached }
        let image = renderState(state, scale: scale)
        cache[key] = image
        return image
    }

    private static func renderState(_ state: CarPlayCallScreen.State, scale: CGFloat) -> UIImage {
        let color = accent(state)
        switch state {
        case .connecting:
            // A slow sweep across low bars.
            let frames = (0..<6).map { step in
                bars((0..<5).map { index in index == step % 5 ? 0.45 : 0.18 }, color: color, scale: scale)
            }
            return animated(frames, duration: 1.2)
        case .listening:
            // Gentle breathing: ready for the person to speak.
            let frames = [0.25, 0.32, 0.38, 0.32].map { height in
                bars([height * 0.8, height, height * 1.15, height, height * 0.8], color: color, scale: scale)
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
            return animated(patterns.map { bars($0, color: color, scale: scale) }, duration: 0.9)
        case .working:
            // Three dots taking turns: looking something up.
            let frames = (0..<3).map { lit in dots(lit: lit, color: color, scale: scale) }
            return animated(frames, duration: 1.2)
        case .muted:
            return renderer(stateCanvas, scale: scale).image { _ in
                drawSymbol("mic.slash.fill", color: color, in: CGRect(origin: .zero, size: stateCanvas).insetBy(dx: 38, dy: 38))
            }.withRenderingMode(.alwaysOriginal)
        }
    }

    /// The full-screen background behind a state (iOS 27): the app icon's navy with a glow
    /// in the state's color (red while muted), with a light-mode version for cars that show
    /// CarPlay in light appearance.
    static func voiceBackground(_ state: CarPlayCallScreen.State, scale: CGFloat) -> UIImage {
        let scale = clamped(scale)
        let key = "background.\(state.rawValue)@\(scale)"
        if let cached = cache[key] { return cached }
        let dark = background(state, dark: true, scale: scale)
        let light = background(state, dark: false, scale: scale)
        let asset = UIImageAsset()
        asset.register(dark, with: UITraitCollection(userInterfaceStyle: .dark))
        asset.register(light, with: UITraitCollection(userInterfaceStyle: .light))
        let image = asset.image(with: UITraitCollection(userInterfaceStyle: .dark))
        cache[key] = image
        return image
    }

    /// A smooth gradient scales up without loss, so a modest canvas covers any car screen.
    private static func background(_ state: CarPlayCallScreen.State, dark: Bool, scale: CGFloat) -> UIImage {
        let canvas = CGSize(width: 480, height: 270)
        let color = accent(state)
        let glow: CGFloat
        switch state {
        case .connecting: glow = dark ? 0.28 : 0.22
        case .muted: glow = dark ? 0.55 : 0.32
        default: glow = dark ? 0.5 : 0.3
        }
        return renderer(canvas, scale: min(scale, 2), opaque: true).image { context in
            let cg = context.cgContext
            let base = dark
                ? [UIColor(hex: 0x0B2D50), UIColor(hex: 0x04172A)]
                : [UIColor(hex: 0xF5F9FD), UIColor(hex: 0xE2ECF6)]
            fillLinear(cg, colors: base, from: .zero, to: CGPoint(x: 0, y: canvas.height))
            let center = CGPoint(x: canvas.width / 2, y: canvas.height * 0.45)
            fillRadial(cg, color: color, alpha: glow, center: center, radius: canvas.width * 0.42)
            if state == .speaking {
                // A second, teal glow: AretaCare's voice in the icon's two colors.
                fillRadial(cg, color: UIColor(hex: 0x2BD3A0), alpha: glow * 0.6,
                           center: CGPoint(x: canvas.width * 0.62, y: canvas.height * 0.6), radius: canvas.width * 0.3)
            }
        }.withRenderingMode(.alwaysOriginal)
    }

    // MARK: - Drawing

    private static func clamped(_ scale: CGFloat) -> CGFloat { min(max(scale, 2), 3) }

    private static func animated(_ frames: [UIImage], duration: TimeInterval) -> UIImage {
        let image = UIImage.animatedImage(with: frames, duration: duration) ?? frames.first ?? UIImage()
        return image.withRenderingMode(.alwaysOriginal)
    }

    private static func renderer(_ size: CGSize, scale: CGFloat, opaque: Bool = false) -> UIGraphicsImageRenderer {
        let format = UIGraphicsImageRendererFormat()
        format.scale = scale
        format.opaque = opaque
        return UIGraphicsImageRenderer(size: size, format: format)
    }

    private static func drawSymbol(_ name: String, color: UIColor, in rect: CGRect) {
        let configuration = UIImage.SymbolConfiguration(pointSize: rect.height, weight: .semibold)
        guard let symbol = UIImage(systemName: name, withConfiguration: configuration)?
            .withTintColor(color, renderingMode: .alwaysOriginal) else { return }
        // Fit the symbol's own aspect ratio inside the box, centered.
        let ratio = min(rect.width / symbol.size.width, rect.height / symbol.size.height)
        let size = CGSize(width: symbol.size.width * ratio, height: symbol.size.height * ratio)
        symbol.draw(in: CGRect(x: rect.midX - size.width / 2, y: rect.midY - size.height / 2,
                               width: size.width, height: size.height))
    }

    private static func fillLinear(_ cg: CGContext, colors: [UIColor], from start: CGPoint, to end: CGPoint) {
        guard let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(),
                                        colors: colors.map(\.cgColor) as CFArray, locations: nil) else { return }
        cg.drawLinearGradient(gradient, start: start, end: end,
                              options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])
    }

    private static func fillRadial(_ cg: CGContext, color: UIColor, alpha: CGFloat, center: CGPoint, radius: CGFloat) {
        let colors = [color.withAlphaComponent(alpha).cgColor, color.withAlphaComponent(0).cgColor]
        guard let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(),
                                        colors: colors as CFArray, locations: [0, 1]) else { return }
        cg.drawRadialGradient(gradient, startCenter: center, startRadius: 0,
                              endCenter: center, endRadius: radius, options: [])
    }

    /// Five rounded bars, each `height` a fraction of the canvas.
    private static func bars(_ heights: [Double], color: UIColor, scale: CGFloat) -> UIImage {
        renderer(stateCanvas, scale: scale).image { _ in
            let barWidth: CGFloat = 14
            let gap: CGFloat = 10
            let total = CGFloat(heights.count) * barWidth + CGFloat(heights.count - 1) * gap
            var x = (stateCanvas.width - total) / 2
            color.setFill()
            for height in heights {
                let barHeight = max(barWidth, stateCanvas.height * 0.8 * CGFloat(height))
                let rect = CGRect(x: x, y: (stateCanvas.height - barHeight) / 2, width: barWidth, height: barHeight)
                UIBezierPath(roundedRect: rect, cornerRadius: barWidth / 2).fill()
                x += barWidth + gap
            }
        }
    }

    /// Three dots, the `lit` one full strength.
    private static func dots(lit: Int, color: UIColor, scale: CGFloat) -> UIImage {
        renderer(stateCanvas, scale: scale).image { _ in
            let diameter: CGFloat = 20
            let gap: CGFloat = 16
            let total = 3 * diameter + 2 * gap
            var x = (stateCanvas.width - total) / 2
            for index in 0..<3 {
                color.withAlphaComponent(index == lit ? 1 : 0.35).setFill()
                UIBezierPath(ovalIn: CGRect(x: x, y: (stateCanvas.height - diameter) / 2,
                                            width: diameter, height: diameter)).fill()
                x += diameter + gap
            }
        }
    }
}

private extension UIColor {
    convenience init(hex: UInt32) {
        self.init(red: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255,
                  blue: CGFloat(hex & 0xFF) / 255, alpha: 1)
    }

    /// Mixed toward white by `amount` (0…1).
    func lighter(_ amount: CGFloat) -> UIColor {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        getRed(&r, green: &g, blue: &b, alpha: &a)
        return UIColor(red: r + (1 - r) * amount, green: g + (1 - g) * amount, blue: b + (1 - b) * amount, alpha: a)
    }
}
