import Foundation
import Observation

@Observable
final class CollaborationViewModel {
    private(set) var collaborators: [CollaboratorInfo] = []
    private(set) var pendingInvitations: [PendingInvitationResponse] = []
    private(set) var isLoading = false
    private(set) var errorMessage: String?
    private(set) var successMessage: String?

    // MARK: - Load Data

    func loadCollaborators(session: SessionResponse) {
        collaborators = session.collaborators
    }

    func fetchPendingInvitations(sessionId: String) async {
        do {
            let response: [PendingInvitationResponse] = try await APIClient.shared.get(
                APIEndpoints.Sessions.pendingInvitations(sessionId)
            )
            pendingInvitations = response
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Share Session

    func shareSession(sessionId: String, email: String) async {
        isLoading = true
        errorMessage = nil
        successMessage = nil
        defer { isLoading = false }

        do {
            let request = SessionShareRequest(email: email, confirmSharingConsent: true)
            let response: SessionShareResponse = try await APIClient.shared.post(
                APIEndpoints.Sessions.share(sessionId),
                body: request
            )
            successMessage = response.message
            if let collaborator = response.collaborator {
                collaborators.append(collaborator)
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Send Invitation

    func sendInvitation(sessionId: String, email: String) async {
        isLoading = true
        errorMessage = nil
        successMessage = nil
        defer { isLoading = false }

        do {
            let request = InvitationSendRequest(email: email, confirmSharingConsent: true)
            let response: MessageResponseGeneric = try await APIClient.shared.post(
                APIEndpoints.Sessions.sendInvitation(sessionId),
                body: request
            )
            successMessage = response.message
            await fetchPendingInvitations(sessionId: sessionId)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Revoke Access

    func revokeAccess(sessionId: String, userId: String) async {
        errorMessage = nil

        do {
            try await APIClient.shared.delete(
                APIEndpoints.Sessions.revokeAccess(sessionId, userId: userId)
            )
            collaborators.removeAll { $0.userId == userId }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Cancel Invitation

    func cancelInvitation(sessionId: String, invitationId: String) async {
        errorMessage = nil

        do {
            try await APIClient.shared.delete(
                APIEndpoints.Sessions.cancelInvitation(sessionId, invitationId: invitationId)
            )
            pendingInvitations.removeAll { $0.id == invitationId }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Transfer Ownership

    func transferOwnership(sessionId: String, userId: String) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            let request = TransferOwnershipRequest(newOwnerUserId: userId)
            let _: MessageResponseGeneric = try await APIClient.shared.post(
                APIEndpoints.Sessions.transferOwnership(sessionId),
                body: request
            )
            successMessage = "Ownership transferred successfully."
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Leave Session

    func leaveSession(sessionId: String) async -> Bool {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            try await APIClient.shared.post(APIEndpoints.Sessions.leave(sessionId))
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func dismissMessages() {
        errorMessage = nil
        successMessage = nil
    }
}
