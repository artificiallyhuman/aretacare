import SwiftUI

/// The glowing orb at the centre of Talk mode.
///
/// Each state reads differently at a glance: a slow neutral breath while connecting or
/// listening, outward ripples in the accent colour while the person speaks, a fuller
/// teal-to-indigo swell while the assistant speaks, and a turning highlight while it is
/// looking something up. With Reduce Motion nothing moves continuously; the state is
/// carried by colour and size (and by the caption under the orb).
struct TalkOrbView: View {
    let phase: TalkViewModel.Phase
    let userLevel: Double
    let agentLevel: Double

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private enum Look { case calm, user, agent, working }

    private var look: Look {
        switch phase {
        case .userSpeaking: return .user
        case .agentSpeaking: return .agent
        case .working: return .working
        default: return .calm
        }
    }

    private var palette: (core: Color, glow: Color) {
        switch look {
        case .calm: return (Color.accentColor.opacity(0.75), Color.accentColor.opacity(0.35))
        case .user: return (Color.accentColor, Color.accentColor.opacity(0.55))
        case .agent: return (Color.teal, Color.indigo.opacity(0.6))
        case .working: return (Color.indigo.opacity(0.85), Color.purple.opacity(0.45))
        }
    }

    var body: some View {
        GeometryReader { proxy in
            let size = min(proxy.size.width, proxy.size.height)
            Group {
                if reduceMotion {
                    orb(size: size, time: 0, animated: false)
                } else {
                    TimelineView(.animation(minimumInterval: 1.0 / 30.0)) { context in
                        orb(size: size, time: context.date.timeIntervalSinceReferenceDate, animated: true)
                    }
                }
            }
            .frame(width: proxy.size.width, height: proxy.size.height)
        }
        .aspectRatio(1, contentMode: .fit)
        .animation(.easeInOut(duration: 0.45), value: look)
        .accessibilityHidden(true)  // the caption carries the state for VoiceOver
    }

    private func orb(size: CGFloat, time: TimeInterval, animated: Bool) -> some View {
        let level = look == .user ? userLevel : (look == .agent ? agentLevel : 0)
        let breath = animated ? (sin(time * (look == .calm ? 1.1 : 2.0)) + 1) / 2 : 0.5
        let coreScale: CGFloat = {
            switch look {
            case .calm: return 0.56 + 0.03 * breath
            case .user: return 0.56 + 0.10 * level
            case .agent: return 0.60 + 0.22 * level + 0.02 * breath
            case .working: return 0.56 + 0.02 * breath
            }
        }()

        return ZStack {
            // Soft outer glow
            Circle()
                .fill(
                    RadialGradient(
                        colors: [palette.glow, palette.glow.opacity(0)],
                        center: .center, startRadius: size * 0.12, endRadius: size * 0.5
                    )
                )
                .scaleEffect(0.9 + 0.1 * breath + (look == .agent ? 0.18 * level : 0))

            if look == .user {
                ripples(size: size, time: time, level: level, animated: animated)
            }

            // Core
            Circle()
                .fill(
                    RadialGradient(
                        colors: [.white.opacity(0.95), palette.core, palette.glow],
                        center: UnitPoint(x: 0.38, y: 0.34), startRadius: 0, endRadius: size * 0.34
                    )
                )
                .frame(width: size * coreScale, height: size * coreScale)
                .shadow(color: palette.core.opacity(0.55), radius: size * 0.08)

            if look == .working {
                Circle()
                    .trim(from: 0, to: 0.28)
                    .stroke(
                        AngularGradient(colors: [.white.opacity(0), .white.opacity(0.9)], center: .center),
                        style: StrokeStyle(lineWidth: size * 0.018, lineCap: .round)
                    )
                    .frame(width: size * 0.68, height: size * 0.68)
                    .rotationEffect(.degrees(animated ? (time * 140).truncatingRemainder(dividingBy: 360) : 40))
            }
        }
    }

    /// Three rings travelling outward; louder speech pushes them further and brighter.
    private func ripples(size: CGFloat, time: TimeInterval, level: Double, animated: Bool) -> some View {
        ZStack {
            ForEach(0..<3, id: \.self) { index in
                let progress = animated
                    ? (time * 0.7 + Double(index) / 3).truncatingRemainder(dividingBy: 1)
                    : Double(index + 1) / 4
                Circle()
                    .stroke(palette.core.opacity((1 - progress) * (0.25 + 0.6 * level)), lineWidth: size * 0.012)
                    .frame(
                        width: size * (0.58 + (0.30 + 0.12 * level) * progress),
                        height: size * (0.58 + (0.30 + 0.12 * level) * progress)
                    )
            }
        }
    }
}

#Preview("Orb states") {
    VStack(spacing: 24) {
        TalkOrbView(phase: .listening, userLevel: 0, agentLevel: 0).frame(height: 160)
        TalkOrbView(phase: .userSpeaking, userLevel: 0.7, agentLevel: 0).frame(height: 160)
        TalkOrbView(phase: .agentSpeaking, userLevel: 0, agentLevel: 0.7).frame(height: 160)
        TalkOrbView(phase: .working, userLevel: 0, agentLevel: 0).frame(height: 160)
    }
    .padding()
}
