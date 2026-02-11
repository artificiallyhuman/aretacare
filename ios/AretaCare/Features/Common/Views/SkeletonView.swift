import SwiftUI

// MARK: - Shimmer Modifier

struct ShimmerModifier: ViewModifier {
    @State private var phase: CGFloat = 0

    func body(content: Content) -> some View {
        content
            .overlay {
                GeometryReader { geometry in
                    LinearGradient(
                        colors: [
                            .clear,
                            .white.opacity(0.4),
                            .clear
                        ],
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                    .frame(width: geometry.size.width * 0.6)
                    .offset(x: phase * geometry.size.width * 1.6 - geometry.size.width * 0.3)
                }
                .clipped()
            }
            .onAppear {
                withAnimation(
                    .linear(duration: 1.5)
                    .repeatForever(autoreverses: false)
                ) {
                    phase = 1
                }
            }
    }
}

extension View {
    func shimmer() -> some View {
        modifier(ShimmerModifier())
    }
}

// MARK: - Skeleton Message Row

struct SkeletonMessageRow: View {
    let isUser: Bool

    @State private var width: CGFloat = 0
    @State private var height: CGFloat = 0

    var body: some View {
        HStack(alignment: .bottom, spacing: 6) {
            if isUser { Spacer(minLength: 48) }

            VStack(alignment: isUser ? .trailing : .leading, spacing: 6) {
                RoundedRectangle(cornerRadius: 18)
                    .fill(Color(.systemGray5))
                    .frame(width: width, height: height)
            }

            if !isUser { Spacer(minLength: 48) }
        }
        .padding(.horizontal, 12)
        .shimmer()
        .onAppear {
            if width == 0 {
                width = isUser ? CGFloat.random(in: 120...200) : CGFloat.random(in: 160...260)
                height = isUser ? 36 : CGFloat.random(in: 50...80)
            }
        }
    }
}

// MARK: - Skeleton Conversation View

struct SkeletonConversationView: View {
    var body: some View {
        VStack(spacing: 10) {
            ForEach(0..<6, id: \.self) { index in
                SkeletonMessageRow(isUser: index % 3 == 1)
            }
        }
        .padding(.vertical, 8)
    }
}

// MARK: - Skeleton List Row

struct SkeletonListRow: View {
    @State private var lineWidths: [CGFloat] = [0, 0, 0]

    var body: some View {
        HStack(spacing: 12) {
            RoundedRectangle(cornerRadius: 8)
                .fill(Color(.systemGray5))
                .frame(width: 36, height: 36)

            VStack(alignment: .leading, spacing: 6) {
                RoundedRectangle(cornerRadius: 4)
                    .fill(Color(.systemGray5))
                    .frame(width: lineWidths[0], height: 14)

                RoundedRectangle(cornerRadius: 4)
                    .fill(Color(.systemGray6))
                    .frame(width: lineWidths[1], height: 10)

                RoundedRectangle(cornerRadius: 4)
                    .fill(Color(.systemGray6))
                    .frame(width: lineWidths[2], height: 10)
            }

            Spacer()
        }
        .padding(.horizontal)
        .padding(.vertical, 10)
        .shimmer()
        .onAppear {
            if lineWidths[0] == 0 {
                lineWidths = [
                    CGFloat.random(in: 100...200),
                    CGFloat.random(in: 150...250),
                    CGFloat.random(in: 60...120)
                ]
            }
        }
    }
}

// MARK: - Skeleton List View

struct SkeletonListView: View {
    let rowCount: Int

    init(rowCount: Int = 6) {
        self.rowCount = rowCount
    }

    var body: some View {
        VStack(spacing: 0) {
            ForEach(0..<rowCount, id: \.self) { _ in
                SkeletonListRow()
                Divider()
                    .padding(.leading, 60)
            }
        }
    }
}
