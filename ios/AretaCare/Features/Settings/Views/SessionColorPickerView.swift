import SwiftUI

struct SessionColorPickerView: View {
    let session: SessionResponse
    let viewModel: SettingsViewModel

    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme

    @State private var selectedKey: String?
    @State private var conflictingSession: SessionResponse?
    @State private var showSwapConfirmation = false
    @State private var isSaving = false

    private let columns = [
        GridItem(.adaptive(minimum: 56, maximum: 72), spacing: 12)
    ]

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                Text("Choose a background color for \"\(session.name)\"")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)

                LazyVGrid(columns: columns, spacing: 16) {
                    ForEach(SessionColors.all) { color in
                        let isCurrent = color.id == (selectedKey ?? session.colorKey)
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
                        .disabled(isSaving)
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
            .alert("Swap Colors", isPresented: $showSwapConfirmation) {
                Button("Swap") {
                    Task { await applyColor(swap: true) }
                }
                Button("Cancel", role: .cancel) {
                    selectedKey = nil
                }
            } message: {
                if let conflicting = conflictingSession, let key = selectedKey {
                    let colorLabel = SessionColors.color(forKey: key)?.label ?? key
                    Text("\"\(conflicting.name)\" is already using \(colorLabel). Swap colors between the two sessions?")
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
        // Same as current - no action
        if colorKey == session.colorKey {
            return
        }

        selectedKey = colorKey

        // Check for conflicts
        if let conflicting = viewModel.sessionUsingColor(colorKey, excluding: session.id) {
            conflictingSession = conflicting
            showSwapConfirmation = true
        } else {
            Task { await applyColor(swap: false) }
        }
    }

    private func applyColor(swap: Bool) async {
        guard let colorKey = selectedKey else { return }
        isSaving = true
        defer { isSaving = false }

        await viewModel.setSessionColor(
            sessionId: session.id,
            colorKey: colorKey,
            swapWithSessionId: swap ? conflictingSession?.id : nil
        )

        if viewModel.errorMessage == nil {
            dismiss()
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
