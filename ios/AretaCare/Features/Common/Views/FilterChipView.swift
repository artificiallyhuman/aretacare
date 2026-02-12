import SwiftUI

struct FilterChipView: View {
    let title: String
    let isSelected: Bool
    var icon: String? = nil
    var selectedColor: Color = .accentColor
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 4) {
                if let icon {
                    Image(systemName: icon)
                        .font(.caption)
                }
                Text(title)
                    .font(.subheadline)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(isSelected ? selectedColor : Color(.systemGray5))
            .foregroundStyle(isSelected ? .white : .primary)
            .clipShape(Capsule())
        }
        .accessibilityLabel("\(title) filter")
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}
