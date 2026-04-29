import SwiftUI

struct CollaborationView: View {
    let session: SessionResponse

    @State private var viewModel = CollaborationViewModel()
    @State private var email = ""
    @State private var sharingConsent = false
    @State private var showingLeaveConfirm = false
    @State private var shareHapticTrigger = 0
    @State private var showingInviteConfirm = false
    @State private var checkedUserName: String?

    @Environment(\.dismiss) private var dismiss

    private var isOwner: Bool { session.isOwner }
    private var totalPeople: Int { viewModel.collaborators.count + 1 } // owner + collaborators
    private var canAddMore: Bool { totalPeople < AppConstants.maxCollaboratorsPerSession }

    private var isEmailFormatValid: Bool {
        let trimmed = email.trimmingCharacters(in: .whitespacesAndNewlines)
        let pattern = #"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$"#
        return trimmed.range(of: pattern, options: .regularExpression) != nil
    }

    var body: some View {
        List {
            // Session Info
            Section {
                LabeledContent("Care Session", value: session.name)
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
                        CollaboratorRow(
                            collaborator: collaborator,
                            isOwner: isOwner,
                            session: session,
                            viewModel: viewModel
                        )
                    }
                }
            }

            // Add Collaborator (owner only)
            if isOwner && canAddMore {
                Section("Share Care Session") {
                    HStack {
                        TextField("Email address", text: $email)
                            .keyboardType(.emailAddress)
                            .textContentType(.emailAddress)
                            .textInputAutocapitalization(.never)

                        if !email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                            Image(systemName: isEmailFormatValid ? "checkmark.circle.fill" : "xmark.circle.fill")
                                .foregroundStyle(isEmailFormatValid ? .green : .red)
                                .font(.subheadline)
                        }
                    }

                    Toggle(isOn: $sharingConsent) {
                        Text("I confirm I have the right to share the information in this care session with the collaborator I\u{2019}m adding. If I\u{2019}m the patient, this is my consent. If I\u{2019}m a caregiver, I have the patient\u{2019}s permission to share it.")
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
                            Text("Share Care Session")
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .disabled(!isEmailFormatValid || !sharingConsent || viewModel.isLoading)
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
                        Label("Leave Care Session", systemImage: "rectangle.portrait.and.arrow.right")
                            .frame(maxWidth: .infinity)
                    }
                    .confirmationDialog("Leave Care Session", isPresented: $showingLeaveConfirm, titleVisibility: .visible) {
                        Button("Leave", role: .destructive) {
                            Task {
                                let left = await viewModel.leaveSession(sessionId: session.id)
                                if left { dismiss() }
                            }
                        }
                    } message: {
                        Text("You will lose access to all data in this care session.")
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
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.secondary)
                }
            }
        }
        .alert("Send Invitation?", isPresented: $showingInviteConfirm) {
            Button("Send Invitation") {
                Task { await sendInvitation() }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("\(email) doesn\u{2019}t have an AretaCare account yet. Send them an email invitation to join this care session?")
        }
        .sensoryFeedback(.success, trigger: shareHapticTrigger)
        .task {
            viewModel.loadCollaborators(session: session)
            await viewModel.fetchPendingInvitations(sessionId: session.id)
        }
    }

    private func share() async {
        guard let result = await viewModel.checkUser(sessionId: session.id, email: email) else {
            return
        }

        if result.exists {
            checkedUserName = result.name
            await viewModel.shareSession(sessionId: session.id, email: email)
            if viewModel.errorMessage == nil {
                email = ""
                sharingConsent = false
                checkedUserName = nil
                shareHapticTrigger += 1
            }
        } else {
            showingInviteConfirm = true
        }
    }

    private func sendInvitation() async {
        await viewModel.sendInvitation(sessionId: session.id, email: email)
        if viewModel.errorMessage == nil {
            email = ""
            sharingConsent = false
            shareHapticTrigger += 1
        }
    }
}

// MARK: - Collaborator Row

private struct CollaboratorRow: View {
    let collaborator: CollaboratorInfo
    var isOwner: Bool = false
    let session: SessionResponse
    let viewModel: CollaborationViewModel

    @State private var showingRevokeConfirm = false
    @State private var showingTransferConfirm = false

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

            if isOwner {
                Menu {
                    Button { showingTransferConfirm = true } label: {
                        Label("Transfer Ownership", systemImage: "arrow.right.arrow.left")
                    }
                    Divider()
                    Button(role: .destructive) { showingRevokeConfirm = true } label: {
                        Label("Revoke Access", systemImage: "person.badge.minus")
                    }
                } label: {
                    Image(systemName: "ellipsis")
                        .font(.body)
                        .foregroundStyle(.secondary)
                        .frame(width: 28, height: 28)
                        .contentShape(Rectangle())
                }
            } else {
                Text("Joined \(collaborator.addedAt.shortDateString)")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(.vertical, 2)
        .swipeActions(edge: .trailing) {
            if isOwner {
                Button {
                    showingRevokeConfirm = true
                } label: {
                    Label("Revoke", systemImage: "person.badge.minus")
                }
                .tint(.red)
                Button {
                    showingTransferConfirm = true
                } label: {
                    Label("Transfer", systemImage: "arrow.right.arrow.left")
                }
                .tint(.orange)
            }
        }
        .confirmationDialog("Revoke Access", isPresented: $showingRevokeConfirm, titleVisibility: .visible) {
            Button("Revoke", role: .destructive) {
                Task { await viewModel.revokeAccess(sessionId: session.id, userId: collaborator.userId) }
            }
        } message: {
            Text("Remove \(collaborator.name) from the care session? They will lose access to all care session data.")
        }
        .confirmationDialog("Transfer Ownership", isPresented: $showingTransferConfirm, titleVisibility: .visible) {
            Button("Transfer") {
                Task { await viewModel.transferOwnership(sessionId: session.id, userId: collaborator.userId) }
            }
        } message: {
            Text("Transfer ownership to \(collaborator.name)? You will become a collaborator.")
        }
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
                    await viewModel.resendInvitation(
                        sessionId: sessionId,
                        email: invitation.email
                    )
                }
            } label: {
                Image(systemName: "arrow.clockwise")
                    .font(.body)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.borderless)
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
                    .font(.body)
                    .foregroundStyle(.red)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.borderless)
            .disabled(viewModel.isLoading)
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
