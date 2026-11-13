import SwiftUI

/// The chat's navigation-bar title: the care session's name, and under it one short line
/// saying who can see this chat. Tapping it opens sharing.
///
/// The line never grows with the number of people (up to 10 per care session): at most
/// two first names, then a count, and only the count when the names don't fit.
struct SessionTitleView: View {
    let session: SessionResponse
    let currentUserId: String
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(spacing: 1) {
                Text(session.name)
                    .font(.headline)
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                HStack(spacing: 3) {
                    peopleLine
                    Image(systemName: "chevron.right")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)
                }
                .font(.caption)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        // A two-line title can't grow past the navigation bar (see CLAUDE.md, Dynamic Type).
        .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(session.name). \(spokenSummary)")
        .accessibilityHint("Shows who can see this care session")
        .accessibilityAddTraits(.isButton)
    }

    // MARK: - People

    /// First names of everyone else in the care session, owner first.
    private var others: [String] {
        var names: [String] = []
        if session.ownerId != currentUserId { names.append(session.ownerName) }
        names += session.collaborators.filter { $0.userId != currentUserId }.map(\.name)
        return names.map(Self.firstName)
    }

    @ViewBuilder
    private var peopleLine: some View {
        let others = others
        if others.isEmpty {
            Text("Only you · \(Text("Invite").foregroundStyle(Color.accentColor))")
                .foregroundStyle(.secondary)
                .lineLimit(1)
        } else {
            let variants = Self.lineVariants(for: others)
            // Longest form that fits; the last one is used (and truncated) if none do.
            ViewThatFits(in: .horizontal) {
                Text(variants.full).lineLimit(1)
                if let middle = variants.middle {
                    Text(middle).lineLimit(1)
                }
                Text(variants.short).lineLimit(1)
            }
            .foregroundStyle(.secondary)
        }
    }

    private var spokenSummary: String {
        let others = others
        guard !others.isEmpty else { return "Only you can see this care session." }
        return "Shared with \(ListFormatter.localizedString(byJoining: others))."
    }

    static func lineVariants(for others: [String]) -> (full: String, middle: String?, short: String) {
        let count = others.count
        let short = count == 1 ? "You + 1 other" : "You + \(count) others"
        switch count {
        case 1:
            return ("You & \(others[0])", nil, short)
        case 2:
            return ("You, \(others[0]) & \(others[1])", "You, \(others[0]) & 1 other", short)
        default:
            return ("You, \(others[0]) & \(count - 1) others", nil, short)
        }
    }

    static func firstName(_ name: String) -> String {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.split(separator: " ").first.map(String.init) ?? "Someone"
    }
}
