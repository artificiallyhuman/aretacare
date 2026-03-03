import SwiftUI

struct CollaborationAwarenessPopup: View {
    let session: SessionResponse
    let onDismiss: () -> Void

    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "person.2.circle.fill")
                .font(.system(size: 48))
                .foregroundStyle(Color.accentColor)

            Text("Shared Session")
                .font(.title3.weight(.bold))

            Text("Your current session \"\(session.name)\" is shared with other people. Information you add will be visible to all collaborators.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            VStack(alignment: .leading, spacing: 8) {
                if !session.isOwner {
                    Text("Owner:")
                        .font(.subheadline.weight(.medium))
                    HStack(spacing: 8) {
                        Image(systemName: "person.circle.fill")
                            .foregroundStyle(.secondary)
                        Text(session.ownerName)
                            .font(.subheadline)
                    }
                }

                // Show other collaborators (filter out the current user by comparing with ownerId)
                let otherCollaborators = session.collaborators.filter { $0.userId != AuthManager.shared.currentUser?.id }
                if !otherCollaborators.isEmpty {
                    Text(session.isOwner ? "Collaborators:" : "Other collaborators:")
                        .font(.subheadline.weight(.medium))
                        .padding(.top, session.isOwner ? 0 : 4)

                    ForEach(otherCollaborators) { collaborator in
                        HStack(spacing: 8) {
                            Image(systemName: "person.circle")
                                .foregroundStyle(.secondary)
                            Text(collaborator.name)
                                .font(.subheadline)
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding()
            .background(Color(.systemGray6))
            .clipShape(RoundedRectangle(cornerRadius: 10))

            Button {
                onDismiss()
            } label: {
                Text("Got It")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
        }
        .padding(24)
    }
}

// MARK: - View Modifier for showing on session switch

struct CollaborationAwarenessModifier: ViewModifier {
    let session: SessionResponse?

    @State private var showPopup = false

    func body(content: Content) -> some View {
        content
            .onChange(of: session?.id, initial: true) { _, _ in
                guard let session, !session.collaborators.isEmpty else { return }
                showPopup = true
            }
            .sheet(isPresented: $showPopup) {
                if let session {
                    CollaborationAwarenessPopup(session: session) {
                        showPopup = false
                    }
                    .presentationDetents([.medium])
                }
            }
    }
}

extension View {
    func collaborationAwareness(session: SessionResponse?) -> some View {
        modifier(CollaborationAwarenessModifier(session: session))
    }
}
