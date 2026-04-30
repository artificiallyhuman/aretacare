import SwiftUI

struct SourceTagView: View {
    let sourceTag: SourceTagInfo
    let currentUserId: String

    @State private var showingName = false

    /// Only renders content when the source tag belongs to a different user.
    var body: some View {
        if sourceTag.userId != currentUserId {
            Button {
                showingName.toggle()
            } label: {
                Text(sourceTag.initials)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.white)
                    .frame(width: 22, height: 22)
                    .background(Circle().fill(Color.accentColor.opacity(0.85)))
            }
            .dynamicTypeSize(...DynamicTypeSize.accessibility1)
            .popover(isPresented: $showingName) {
                Text(sourceTag.name)
                    .font(.footnote)
                    .padding(8)
                    .presentationCompactAdaptation(.popover)
            }
            .accessibilityLabel("Contributor: \(sourceTag.name)")
            .accessibilityHint("Tap to show full name")
        }
    }
}

#Preview {
    SourceTagView(
        sourceTag: SourceTagInfo(userId: "other-user", name: "Jane Smith", initials: "JS"),
        currentUserId: "current-user"
    )
}
