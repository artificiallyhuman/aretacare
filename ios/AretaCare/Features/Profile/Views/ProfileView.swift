import SwiftUI

struct ProfileView: View {
    let sessionId: String

    @State private var viewModel = ProfileViewModel()
    @State private var showingRegenConfirm = false
    @State private var showingPendingChanges = false
    @State private var showingExportPicker = false

    var body: some View {
        Group {
            if viewModel.isLoading && viewModel.profile == nil {
                LoadingView(message: "Loading health profile...")
            } else if viewModel.profile == nil {
                emptyProfileState
            } else {
                VStack(spacing: 0) {
                    if viewModel.needsUpdate && !viewModel.isUpdating {
                        newActivityBanner
                    }
                    profileContent
                }
            }
        }
        .navigationTitle("Health Profile")
        .toolbar {
            if viewModel.profile != nil {
                ToolbarItem(placement: .primaryAction) {
                    Menu {
                        if viewModel.hasPendingChanges {
                            Button {
                                showingPendingChanges = true
                            } label: {
                                Label("Review Changes (\(viewModel.pendingChanges.count))", systemImage: "bell.badge")
                            }
                        }

                        if viewModel.needsUpdate {
                            Button {
                                Task {
                                    await viewModel.updateProfile(sessionId: sessionId)
                                    if viewModel.hasPendingChanges {
                                        showingPendingChanges = true
                                    }
                                }
                            } label: {
                                Label("Update Profile", systemImage: "arrow.triangle.2.circlepath")
                            }
                        }

                        Button {
                            showingRegenConfirm = true
                        } label: {
                            Label("Regenerate Profile", systemImage: "arrow.clockwise")
                        }

                        Button {
                            showingExportPicker = true
                        } label: {
                            Label("Export", systemImage: "square.and.arrow.up")
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                }
            }
        }
        .overlay {
            if viewModel.hasPendingChanges {
                VStack {
                    Spacer()
                    Button {
                        showingPendingChanges = true
                    } label: {
                        Label("\(viewModel.pendingChanges.count) pending changes to review", systemImage: "bell.badge")
                            .font(.subheadline.weight(.medium))
                            .padding(.horizontal, 16)
                            .padding(.vertical, 10)
                            .background(Color.accentColor)
                            .foregroundStyle(.white)
                            .clipShape(Capsule())
                    }
                    .padding(.bottom)
                }
            }
        }
        .overlay {
            if viewModel.isRegenerating || viewModel.isUpdating {
                ZStack {
                    Color.black.opacity(0.3).ignoresSafeArea()
                    VStack(spacing: 12) {
                        ProgressView()
                            .controlSize(.large)
                        Text(viewModel.isRegenerating ? "Regenerating profile..." : "Updating profile...")
                            .font(.subheadline.weight(.medium))
                        if viewModel.isUpdating {
                            Text("Analyzing \(activitySummaryText)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding(24)
                    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
                }
            }
        }
        .confirmationDialog("Regenerate Profile", isPresented: $showingRegenConfirm, titleVisibility: .visible) {
            Button("Regenerate", role: .destructive) {
                Task { await viewModel.regenerateProfile(sessionId: sessionId) }
            }
        } message: {
            Text("This will regenerate your entire health profile from your conversations. Any manual edits will be preserved as pending changes.")
        }
        .confirmationDialog("Export Format", isPresented: $showingExportPicker) {
            Button("PDF") {
                exportProfile(format: "pdf")
            }
            Button("JSON") {
                exportProfile(format: "json")
            }
        }
        .sheet(isPresented: $showingPendingChanges) {
            NavigationStack {
                PendingChangesView(sessionId: sessionId, viewModel: viewModel)
            }
        }
        .task {
            await viewModel.fetchProfile(sessionId: sessionId)
            await viewModel.checkProfile(sessionId: sessionId)
        }
        .refreshable {
            await viewModel.fetchProfile(sessionId: sessionId)
        }
    }

    // MARK: - Profile Content

    private var profileContent: some View {
        List {
            if let data = viewModel.profileData {
                // Patient
                if let patient = data.patient {
                    ProfileSection(title: "Patient Information", systemImage: "person") {
                        OptionalRow("Full Name", value: patient.fullName)
                        OptionalRow("Preferred Name", value: patient.preferredName)
                        OptionalRow("Date of Birth", value: patient.dateOfBirth)
                        OptionalRow("Age", value: patient.age)
                        OptionalRow("Contact", value: patient.contactInfo)
                        OptionalRow("Location", value: patient.location)
                    }
                }

                // Caregivers
                if let caregivers = data.caregivers, !caregivers.isEmpty {
                    ProfileSection(title: "Caregivers", systemImage: "person.2") {
                        ForEach(caregivers) { caregiver in
                            VStack(alignment: .leading, spacing: 4) {
                                Text(caregiver.name ?? "Unknown")
                                    .font(.subheadline.weight(.medium))
                                if let rel = caregiver.relationship {
                                    Text(rel)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                if let role = caregiver.role {
                                    Text(role)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            .padding(.vertical, 2)
                        }
                    }
                }

                // Providers
                if let providers = data.providers, !providers.isEmpty {
                    ProfileSection(title: "Healthcare Providers", systemImage: "stethoscope") {
                        ForEach(providers) { provider in
                            VStack(alignment: .leading, spacing: 4) {
                                Text(provider.name ?? "Unknown")
                                    .font(.subheadline.weight(.medium))
                                if let specialty = provider.specialty {
                                    Text(specialty)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                if let org = provider.organization {
                                    Text(org)
                                        .font(.caption)
                                        .foregroundStyle(.tertiary)
                                }
                            }
                            .padding(.vertical, 2)
                        }
                    }
                }

                // Conditions
                if let conditions = data.conditions, !conditions.isEmpty {
                    ProfileSection(title: "Conditions", systemImage: "heart.text.square") {
                        ForEach(conditions) { condition in
                            VStack(alignment: .leading, spacing: 4) {
                                Text(condition.clinicalTerm ?? condition.description ?? "Unknown")
                                    .font(.subheadline.weight(.medium))
                                HStack(spacing: 8) {
                                    if let status = condition.status {
                                        Text(status.capitalized)
                                            .font(.caption2)
                                            .padding(.horizontal, 6)
                                            .padding(.vertical, 2)
                                            .background(statusColor(status).opacity(0.15))
                                            .foregroundStyle(statusColor(status))
                                            .clipShape(Capsule())
                                    }
                                    if let date = condition.diagnosisDate {
                                        Text(date)
                                            .font(.caption)
                                            .foregroundStyle(.tertiary)
                                    }
                                }
                                if let details = condition.details {
                                    Text(details)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            .padding(.vertical, 2)
                        }
                    }
                }

                // Medications
                if let medications = data.medications, !medications.isEmpty {
                    ProfileSection(title: "Medications", systemImage: "pills") {
                        ForEach(medications) { med in
                            VStack(alignment: .leading, spacing: 4) {
                                Text(med.name ?? "Unknown")
                                    .font(.subheadline.weight(.medium))
                                if let dose = med.dose {
                                    Text(dose + (med.frequency.map { " - \($0)" } ?? ""))
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                if let notes = med.notes {
                                    Text(notes)
                                        .font(.caption)
                                        .foregroundStyle(.tertiary)
                                }
                            }
                            .padding(.vertical, 2)
                        }
                    }
                }

                // Allergies
                if let allergies = data.allergies, !allergies.isEmpty {
                    ProfileSection(title: "Allergies", systemImage: "exclamationmark.triangle") {
                        ForEach(allergies) { allergy in
                            VStack(alignment: .leading, spacing: 4) {
                                Text(allergy.substance ?? "Unknown")
                                    .font(.subheadline.weight(.medium))
                                HStack(spacing: 8) {
                                    if let reaction = allergy.reaction {
                                        Text(reaction)
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                    if let severity = allergy.severity {
                                        Text(severity.capitalized)
                                            .font(.caption2)
                                            .padding(.horizontal, 6)
                                            .padding(.vertical, 2)
                                            .background(severityColor(severity).opacity(0.15))
                                            .foregroundStyle(severityColor(severity))
                                            .clipShape(Capsule())
                                    }
                                }
                            }
                            .padding(.vertical, 2)
                        }
                    }
                }

                // Events
                if let events = data.events, !events.isEmpty {
                    ProfileSection(title: "Key Events", systemImage: "calendar") {
                        ForEach(events) { event in
                            VStack(alignment: .leading, spacing: 4) {
                                HStack {
                                    Text(event.description ?? event.eventType ?? "Event")
                                        .font(.subheadline.weight(.medium))
                                    Spacer()
                                    if let date = event.date {
                                        Text(date)
                                            .font(.caption)
                                            .foregroundStyle(.tertiary)
                                    }
                                }
                                if let details = event.details {
                                    Text(details)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            .padding(.vertical, 2)
                        }
                    }
                }

                // Preferences
                if let prefs = data.preferences {
                    ProfileSection(title: "Preferences", systemImage: "gearshape") {
                        if let commPrefs = prefs.communicationPreferences, !commPrefs.isEmpty {
                            ForEach(commPrefs) { pref in
                                OptionalRow(pref.category ?? "Preference", value: pref.preference)
                            }
                        }
                        if let emergency = prefs.emergencyInstructions {
                            OptionalRow("Emergency Instructions", value: emergency)
                        }
                        if let notes = prefs.additionalNotes {
                            OptionalRow("Additional Notes", value: notes)
                        }
                    }
                }
            }

            if let lastUpdate = viewModel.profile?.updatedAt {
                Section {
                    Text("Last updated: \(lastUpdate.dateTimeString)")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    // MARK: - Empty Profile State

    private var emptyProfileState: some View {
        ScrollView {
            VStack(spacing: 24) {
                Spacer().frame(height: 20)

                Image(systemName: "heart.text.clipboard")
                    .font(.system(size: 56))
                    .foregroundStyle(Color.accentColor)

                Text("No Health Profile Yet")
                    .font(.title2.weight(.bold))

                Text("To get started, have a few conversations or add some journal entries first. Then tap the button below to generate your profile from that activity. You can update it anytime new information is available.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)

                if viewModel.newConversationCount > 0 || viewModel.newJournalCount > 0 {
                    HStack(spacing: 16) {
                        if viewModel.newConversationCount > 0 {
                            Label(
                                "\(viewModel.newConversationCount) conversation\(viewModel.newConversationCount == 1 ? "" : "s")",
                                systemImage: "bubble.left.and.bubble.right"
                            )
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        }
                        if viewModel.newJournalCount > 0 {
                            Label(
                                "\(viewModel.newJournalCount) journal entr\(viewModel.newJournalCount == 1 ? "y" : "ies")",
                                systemImage: "book"
                            )
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        }
                    }
                }

                Button {
                    Task {
                        await viewModel.updateProfile(sessionId: sessionId)
                        if viewModel.hasPendingChanges {
                            showingPendingChanges = true
                        }
                    }
                } label: {
                    Text("Generate Profile")
                        .font(.headline)
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.accentColor)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                }
                .padding(.top, 8)
            }
            .padding(.horizontal, 32)
        }
    }

    // MARK: - Activity Banner

    private var newActivityBanner: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("New activity available")
                    .font(.subheadline.weight(.medium))
                Text(activitySummaryText)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            Button("Update") {
                Task {
                    await viewModel.updateProfile(sessionId: sessionId)
                    if viewModel.hasPendingChanges {
                        showingPendingChanges = true
                    }
                }
            }
            .font(.subheadline.weight(.semibold))
            .buttonStyle(.borderedProminent)
            .controlSize(.small)
        }
        .padding()
        .background(Color.blue.opacity(0.08))
    }

    private var activitySummaryText: String {
        var parts: [String] = []
        if viewModel.newConversationCount > 0 {
            let n = viewModel.newConversationCount
            parts.append("\(n) conversation\(n == 1 ? "" : "s")")
        }
        if viewModel.newJournalCount > 0 {
            let n = viewModel.newJournalCount
            parts.append("\(n) journal entr\(n == 1 ? "y" : "ies")")
        }
        return parts.isEmpty ? "New activity detected" : parts.joined(separator: ", ")
    }

    // MARK: - Helpers

    private func exportProfile(format: String) {
        if let url = viewModel.exportProfileURL(sessionId: sessionId, format: format) {
            UIApplication.shared.open(url)
        }
    }

    private func statusColor(_ status: String) -> Color {
        switch status.lowercased() {
        case "active": return .red
        case "resolved": return .green
        case "monitoring": return .orange
        default: return .gray
        }
    }

    private func severityColor(_ severity: String) -> Color {
        switch severity.lowercased() {
        case "severe": return .red
        case "moderate": return .orange
        case "mild": return .yellow
        default: return .gray
        }
    }
}

// MARK: - Profile Section

private struct ProfileSection<Content: View>: View {
    let title: String
    let systemImage: String
    @ViewBuilder let content: Content

    var body: some View {
        Section {
            content
        } header: {
            Label(title, systemImage: systemImage)
        }
    }
}

// MARK: - Optional Row

private struct OptionalRow: View {
    let label: String
    let value: String?

    init(_ label: String, value: String?) {
        self.label = label
        self.value = value
    }

    var body: some View {
        if let value, !value.isEmpty {
            LabeledContent(label, value: value)
        }
    }
}

// MARK: - Pending Changes View

private struct PendingChangesView: View {
    let sessionId: String
    let viewModel: ProfileViewModel

    @Environment(\.dismiss) private var dismiss
    @State private var decisions: [String: Bool] = [:]

    var body: some View {
        List {
            if viewModel.pendingChanges.isEmpty {
                Text("No pending changes to review.")
                    .foregroundStyle(.secondary)
            } else {
                Section {
                    HStack(spacing: 12) {
                        Button("Accept All") {
                            for change in viewModel.pendingChanges {
                                decisions[change.id] = true
                            }
                        }
                        .font(.subheadline)
                        .foregroundStyle(.green)

                        Button("Reject All") {
                            for change in viewModel.pendingChanges {
                                decisions[change.id] = false
                            }
                        }
                        .font(.subheadline)
                        .foregroundStyle(.red)

                        if !decisions.isEmpty {
                            Button("Clear") {
                                decisions.removeAll()
                            }
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        }
                    }
                    .buttonStyle(.plain)
                }

                ForEach(viewModel.pendingChanges) { change in
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Text(change.changeType.rawValue.capitalized)
                                .font(.caption2.weight(.semibold))
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(changeTypeColor(change.changeType).opacity(0.15))
                                .foregroundStyle(changeTypeColor(change.changeType))
                                .clipShape(Capsule())

                            Text(change.section.capitalized)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }

                        Text(change.reasoning)
                            .font(.subheadline)

                        Text(change.fieldPath)
                            .font(.caption)
                            .foregroundStyle(.tertiary)

                        HStack(spacing: 12) {
                            Button {
                                decisions[change.id] = true
                            } label: {
                                Label("Accept", systemImage: "checkmark")
                                    .font(.subheadline)
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 6)
                                    .background(decisions[change.id] == true ? Color.green.opacity(0.2) : Color(.systemGray5))
                                    .clipShape(Capsule())
                            }

                            Button {
                                decisions[change.id] = false
                            } label: {
                                Label("Reject", systemImage: "xmark")
                                    .font(.subheadline)
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 6)
                                    .background(decisions[change.id] == false ? Color.red.opacity(0.2) : Color(.systemGray5))
                                    .clipShape(Capsule())
                            }
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(.vertical, 4)
                }
            }
        }
        .navigationTitle("Pending Changes")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel") { dismiss() }
            }
            ToolbarItem(placement: .confirmationAction) {
                Button("Submit") {
                    submitDecisions()
                }
                .disabled(decisions.count < viewModel.pendingChanges.count)
            }
        }
    }

    private func submitDecisions() {
        var codableDecisions: [String: AnyCodableValue] = [:]
        for (id, accepted) in decisions {
            codableDecisions[id] = .string(accepted ? "accept" : "reject")
        }
        Task {
            await viewModel.reviewPendingChanges(sessionId: sessionId, decisions: codableDecisions)
            await viewModel.fetchProfile(sessionId: sessionId)
            dismiss()
        }
    }

    private func changeTypeColor(_ type: ChangeType) -> Color {
        switch type {
        case .add: return .green
        case .edit: return .orange
        case .delete: return .red
        }
    }
}
