import SwiftUI

struct DateNavigatorBar: View {
    let selectedDateString: String?
    let canGoBack: Bool
    let canGoForward: Bool
    let isViewingLatest: Bool
    let onPrevious: () -> Void
    let onNext: () -> Void
    let onGoToLatest: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button {
                    onPrevious()
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.body.weight(.medium))
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .disabled(!canGoBack)

                Spacer()

                if let dateStr = selectedDateString,
                   let date = Date.fromAPIDateString(dateStr) {
                    VStack(spacing: 2) {
                        if date.isToday {
                            Text("Today")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(Color.accentColor)
                        }
                        Text(date.weekdayDateString)
                            .font(date.isToday ? .caption : .subheadline.weight(.medium))
                            .foregroundStyle(date.isToday ? .secondary : .primary)
                    }
                }

                Spacer()

                Button {
                    onNext()
                } label: {
                    Image(systemName: "chevron.right")
                        .font(.body.weight(.medium))
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .disabled(!canGoForward)
            }
            .padding(.horizontal, 4)
            .padding(.vertical, 4)

            if !isViewingLatest {
                Button {
                    onGoToLatest()
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "arrow.right.to.line")
                            .font(.caption2)
                        Text("Go to Latest")
                            .font(.caption.weight(.medium))
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                }
                .padding(.bottom, 6)
            }

            Divider()
        }
        .background(Color(.secondarySystemBackground))
    }
}
