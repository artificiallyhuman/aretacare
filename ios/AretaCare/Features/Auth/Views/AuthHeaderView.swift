import SwiftUI

struct AuthHeaderView: View {
    var compact: Bool = false

    var body: some View {
        VStack(spacing: 8) {
            Image("large_logo")
                .resizable()
                .scaledToFit()
                .frame(width: compact ? 80 : 64, height: compact ? 80 : 64)

            HStack(spacing: 0) {
                Text("AretaCare")
                    .font(compact ? .title2 : .largeTitle)
                    .fontWeight(.bold)
                Text("\u{2122}")
                    .font(compact ? .callout : .title2)
                    .foregroundStyle(.secondary)
            }

            Text("Calm | Clarity | Confidence")
                .font(compact ? .caption : .subheadline)
                .foregroundStyle(.secondary)
        }
    }
}

#Preview {
    AuthHeaderView()
}

#Preview("Compact") {
    AuthHeaderView(compact: true)
}
