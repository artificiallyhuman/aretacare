import SwiftUI

struct CollaborationView: View {
    let session: SessionResponse

    @State private var viewModel = CollaborationViewModel()
    @State private var email = ""
    @State private var sharingConsent = false
    @State private var showingRevokeConfirm = false
    @State private var revokeTarget: CollaboratorInfo?
    @State private var showingTransferConfirm = false
    @State private var transferTarget: CollaboratorInfo?
    @State private var showingLeaveConfirm = false

    @Environment(\.dismiss) private var dismiss

    private var isOwner: Bool { session.isOwner }
    private var totalPeople: Int { session.collaborators.count + 1 } // owner + collaborators
    private var canAddMore: Bool { totalPeople < AppConstants.maxCollaboratorsPerSession }

    var body: some View {
        List {
            // Session Info
            Section {
                LabeledContent("Session", value: session.name)
                LabeledContent("Owner", value: session.ownerName)
                LabeledContent("People", value: "\(totalPeople) / \(AppConstants.maxCollaboratorsPerSession)")
            }

            // Collaborators
            Section("Collaborators") {
                if viewModel.collaborators.isEmpty {
                    Text("No collaborators yet.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(viewModel.collaborators) { collaborator in
                        CollaboratorRow(collaborator: collaborator)
                            .swipeActions(edge: .trailing) {
                                if isOwner {
                                    Button(role: .destructive) {
                                        revokeTarget = collaborator
                                        showingRevokeConfirm = true
                                    } label: {
                                        Label("Revoke", systemImage: "person.badge.minus")
                                    }

                                    Button {
                                        transferTarget = collaborator
                                        showingTransferConfirm = true
                                    } label: {
                                        Label("Transfer", systemImage: "arrow.right.arrow.left")
                                    }
                                    .tint(.orange)
                                }
                            }
                    }
                }
            }

            // Add Collaborator (owner only)
            if isOwner && canAddMore {
                Section("Share Session") {
                    TextField("Email address", text: $email)
                        .keyboardType(.emailAddress)
                        .textContentType(.emailAddress)
                        .textInputAutocapitalization(.never)

                    Toggle(isOn: $sharingConsent) {
                        Text("I confirm I have the right to share the information in this session with the collaborator I\u{2019}m adding. If I\u{2019}m the patient, this is my consent. If I\u{2019}m a caregiver, I have the patient\u{2019}s permission to share it.")
                            .font(.caption)
                    }
                    .toggleStyle(.checkbox)

                    Button {
                        Task { await share() }
                    } label: {
                        if viewModel.isLoading {
                            ProgressView()
                                .frame(maxWidth: .infinity)
                        } else {
                            Text("Share Session")
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .disabled(email.isEmpty || !sharingConsent || viewModel.isLoading)
                }
            } else if isOwner && !canAddMore {
                Section {
                    Text("Maximum of \(AppConstants.maxCollaboratorsPerSession) people reached.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }

            // Pending Invitations (owner only)
            if isOwner && !viewModel.pendingInvitations.isEmpty {
                Section("Pending Invitations") {
                    ForEach(viewModel.pendingInvitations) { invitation in
                        PendingInvitationRow(
                            invitation: invitation,
                            sessionId: session.id,
                            viewModel: viewModel
                        )
                    }
                }
            }

            // Leave Session (non-owner only)
            if !isOwner {
                Section {
                    Button(role: .destructive) {
                        showingLeaveConfirm = true
                    } label: {
                        Label("Leave Session", systemImage: "rectangle.portrait.and.arrow.right")
                            .frame(maxWidth: .infinity)
                    }
                }
            }

            // Messages
            if let error = viewModel.errorMessage {
                Section {
                    ErrorBannerView(message: error) { viewModel.dismissMessages() }
                }
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())
            }

            if let success = viewModel.successMessage {
                Section {
                    HStack {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(.green)
                        Text(success)
                            .font(.subheadline)
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Collaboration")
        .confirmationDialog("Revoke Access", isPresented: $showingRevokeConfirm, titleVisibility: .visible) {
            Button("Revoke", role: .destructive) {
                if let target = revokeTarget {
                    Task { await viewModel.revokeAccess(sessionId: session.id, userId: target.userId) }
                }
            }
        } message: {
            Text("Remove \(revokeTarget?.name ?? "this collaborator") from the session? They will lose access to all session data.")
        }
        .confirmationDialog("Transfer Ownership", isPresented: $showingTransferConfirm, titleVisibility: .visible) {
            Button("Transfer") {
                if let target = transferTarget {
                    Task { await viewModel.transferOwnership(sessionId: session.id, userId: target.userId) }
                }
            }
        } message: {
            Text("Transfer ownership to \(transferTarget?.name ?? "this person")? You will become a collaborator.")
        }
        .confirmationDialog("Leave Session", isPresented: $showingLeaveConfirm, titleVisibility: .visible) {
            Button("Leave", role: .destructive) {
                Task {
                    let left = await viewModel.leaveSession(sessionId: session.id)
                    if left { dismiss() }
                }
            }
        } message: {
            Text("You will lose access to all data in this session.")
        }
        .task {
            viewModel.loadCollaborators(session: session)
            await viewModel.fetchPendingInvitations(sessionId: session.id)
        }
    }

    private func share() async {
        await viewModel.shareSession(sessionId: session.id, email: email)
        if viewModel.errorMessage == nil {
            email = ""
            sharingConsent = false
        }
    }
}

// MARK: - Collaborator Row

private struct CollaboratorRow: View {
    let collaborator: CollaboratorInfo

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "person.circle.fill")
                .font(.title2)
                .foregroundStyle(.secondary)

            VStack(alignment: .leading, spacing: 2) {
                Text(collaborator.name)
                    .font(.subheadline.weight(.medium))
                Text(collaborator.email)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            Text("Joined \(collaborator.addedAt.shortDateString)")
                .font(.caption2)
                .foregroundStyle(.tertiary)
        }
        .padding(.vertical, 2)
    }
}

// MARK: - Pending Invitation Row

private struct PendingInvitationRow: View {
    let invitation: PendingInvitationResponse
    let sessionId: String
    let viewModel: CollaborationViewModel

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(invitation.email)
                    .font(.subheadline)
                Text("\(invitation.daysRemaining) days remaining")
                    .font(.caption)
                    .foregroundStyle(invitation.isExpired ? .red : .secondary)
            }
            Spacer()
            Button {
                Task {
                    await viewModel.sendInvitation(
                        sessionId: sessionId,
                        email: invitation.email
                    )
                }
            } label: {
                Image(systemName: "arrow.clockwise")
                    .foregroundStyle(Color.accentColor)
            }
            .disabled(viewModel.isLoading)
            Button(role: .destructive) {
                Task {
                    await viewModel.cancelInvitation(
                        sessionId: sessionId,
                        invitationId: invitation.id
                    )
                }
            } label: {
                Image(systemName: "xmark.circle")
                    .foregroundStyle(.red)
            }
        }
    }
}

// MARK: - Checkbox Toggle Style

struct CheckboxToggleStyle: ToggleStyle {
    func makeBody(configuration: Configuration) -> some View {
        Button {
            configuration.isOn.toggle()
        } label: {
            HStack(alignment: .top, spacing: 8) {
                Image(systemName: configuration.isOn ? "checkmark.square.fill" : "square")
                    .foregroundStyle(configuration.isOn ? Color.accentColor : Color.secondary)
                configuration.label
            }
        }
        .buttonStyle(.plain)
    }
}

extension ToggleStyle where Self == CheckboxToggleStyle {
    static var checkbox: CheckboxToggleStyle { CheckboxToggleStyle() }
}
