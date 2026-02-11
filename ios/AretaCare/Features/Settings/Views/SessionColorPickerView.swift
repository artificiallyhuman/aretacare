import SwiftUI

struct SessionColorPickerView: View {
    let session: SessionResponse
    let viewModel: SettingsViewModel

    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme

    @State private var isSaving = false

    private let columns = [
        GridItem(.adaptive(minimum: 56, maximum: 72), spacing: 12)
    ]

    /// Colors available to this session: its own current color + any unassigned colors.
    private var availableColors: [SessionColor] {
        SessionColors.all.filter { color in
            color.id == session.colorKey ||
            viewModel.sessionUsingColor(color.id, excluding: session.id) == nil
        }
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                Text("Choose a background color for \"\(session.name)\"")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)

                LazyVGrid(columns: columns, spacing: 16) {
                    ForEach(availableColors) { color in
                        let isCurrent = color.id == session.colorKey
                        Button {
                            selectColor(color.id)
                        } label: {
                            VStack(spacing: 6) {
                                Circle()
                                    .fill(color.swatch(for: colorScheme))
                                    .frame(width: 44, height: 44)
                                    .overlay {
                                        if isCurrent {
                                            Image(systemName: "checkmark")
                                                .font(.caption.bold())
                                                .foregroundStyle(.white)
                                        }
                                    }
                                    .overlay {
                                        Circle()
                                            .strokeBorder(
                                                isCurrent ? Color.accentColor : Color.clear,
                                                lineWidth: 2.5
                                            )
                                    }

                                Text(color.label)
                                    .font(.caption2)
                                    .foregroundStyle(isCurrent ? .primary : .secondary)
                            }
                        }
                        .disabled(isSaving || isCurrent)
                    }
                }
                .padding(.horizontal)

                Spacer()
            }
            .padding(.top)
            .navigationTitle("Session Color")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .overlay {
                if isSaving {
                    Color.black.opacity(0.1).ignoresSafeArea()
                    ProgressView()
                }
            }
        }
    }

    private func selectColor(_ colorKey: String) {
        guard colorKey != session.colorKey else { return }

        Task {
            isSaving = true
            defer { isSaving = false }

            await viewModel.setSessionColor(sessionId: session.id, colorKey: colorKey)

            if viewModel.errorMessage == nil {
                dismiss()
            }
        }
    }
}

#Preview {
    SessionColorPickerView(
        session: SessionResponse(
            id: "s1",
            name: "My Session",
            createdAt: Date(),
            lastActivity: Date(),
            isActive: true,
            ownerId: "u1",
            ownerName: "User",
            ownerEmail: "user@example.com",
            isOwner: true,
            collaborators: [],
            colorKey: "sky"
        ),
        viewModel: SettingsViewModel()
    )
}
