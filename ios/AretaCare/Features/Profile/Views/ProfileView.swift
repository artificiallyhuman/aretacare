import SwiftUI

struct ProfileView: View {
    let sessionId: String

    @State private var viewModel = ProfileViewModel()
    @State private var showingRegenConfirm = false
    @State private var showingPendingChanges = false
    @State private var showingShareSheet = false
    @State private var exportURL: URL?
    @State private var isExporting = false
    @State private var editingSection: EditSection?

    var body: some View {
        Group {
            if viewModel.isLoading && viewModel.profile == nil {
                LoadingView(message: "Loading health profile...")
            } else if viewModel.isProfileEmpty {
                emptyProfileState
            } else {
                profileContent
            }
        }
        .navigationTitle("Health Profile")
        .toolbar {
            if !viewModel.isProfileEmpty {
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
                            copyProfileToClipboard()
                        } label: {
                            Label("Copy", systemImage: "doc.on.doc")
                        }

                        Button {
                            exportProfile(format: "pdf")
                        } label: {
                            Label("Export PDF", systemImage: "arrow.down.doc")
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
                    .accessibilityLabel("Review \(viewModel.pendingChanges.count) pending changes")
                    .padding(.bottom)
                }
            }
        }
        .overlay {
            if viewModel.isRegenerating || viewModel.isUpdating || isExporting {
                ZStack {
                    Color.black.opacity(0.3).ignoresSafeArea()
                    VStack(spacing: 12) {
                        ProgressView()
                            .controlSize(.large)
                        if isExporting {
                            Text("Preparing export...")
                                .font(.subheadline.weight(.medium))
                        } else {
                            Text(viewModel.isRegenerating ? "Regenerating profile..." : "Updating profile...")
                                .font(.subheadline.weight(.medium))
                            if viewModel.isUpdating {
                                Text("Analyzing \(activitySummaryText)")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
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
        .sheet(isPresented: $showingShareSheet) {
            if let exportURL {
                ShareSheet(activityItems: [exportURL])
            }
        }
        .sheet(isPresented: $showingPendingChanges) {
            NavigationStack {
                PendingChangesView(sessionId: sessionId, viewModel: viewModel)
            }
        }
        .sheet(item: $editingSection) { section in
            NavigationStack {
                ProfileSectionEditView(
                    sessionId: sessionId,
                    section: section,
                    profileData: viewModel.profileData ?? ProfileData(),
                    viewModel: viewModel
                )
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
        ScrollView {
            VStack(spacing: 0) {
                if viewModel.needsUpdate && !viewModel.isUpdating {
                    newActivityBanner
                }

                VStack(spacing: 16) {
                    progressBar

                if let data = viewModel.profileData {
                    // Patient
                    if let patient = data.patient {
                        ProfileCardSection(
                            title: "Patient Information",
                            systemImage: "person.fill",
                            color: .purple,
                            count: nil,
                            onEdit: { editingSection = .init("patient") }
                        ) {
                            ProfileField("Full Name", value: patient.fullName)
                            ProfileField("Preferred Name", value: patient.preferredName)
                            ProfileField("Date of Birth", value: patient.dateOfBirth)
                            ProfileField("Age", value: patient.age)
                            ProfileField("Contact", value: patient.contactInfo)
                            ProfileField("Location", value: patient.location)
                        }
                    }

                    // Caregivers
                    if let caregivers = data.caregivers, !caregivers.isEmpty {
                        ProfileCardSection(
                            title: "Caregivers",
                            systemImage: "person.2.fill",
                            color: .green,
                            count: caregivers.count,
                            onEdit: { editingSection = .init("caregivers") }
                        ) {
                            ForEach(caregivers) { caregiver in
                                AccentCard(color: .green) {
                                    Text(caregiver.name ?? "Unknown")
                                        .font(.subheadline.weight(.semibold))
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
                                    if let contact = caregiver.contactInfo {
                                        Text(contact)
                                            .font(.caption)
                                            .foregroundStyle(.tertiary)
                                    }
                                    if let location = caregiver.location {
                                        Text(location)
                                            .font(.caption)
                                            .foregroundStyle(.tertiary)
                                    }
                                }
                            }
                        }
                    }

                    // Providers
                    if let providers = data.providers, !providers.isEmpty {
                        ProfileCardSection(
                            title: "Healthcare Providers",
                            systemImage: "stethoscope",
                            color: .teal,
                            count: providers.count,
                            onEdit: { editingSection = .init("providers") }
                        ) {
                            ForEach(providers) { provider in
                                AccentCard(color: .teal) {
                                    Text(provider.name ?? "Unknown")
                                        .font(.subheadline.weight(.semibold))
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
                                    if let contact = provider.contactInfo {
                                        Text(contact)
                                            .font(.caption)
                                            .foregroundStyle(.tertiary)
                                    }
                                }
                            }
                        }
                    }

                    // Conditions
                    if let conditions = data.conditions, !conditions.isEmpty {
                        ProfileCardSection(
                            title: "Conditions",
                            systemImage: "heart.text.square.fill",
                            color: .orange,
                            count: conditions.count,
                            onEdit: { editingSection = .init("conditions") }
                        ) {
                            ForEach(conditions) { condition in
                                AccentCard(color: statusColor(condition.status ?? "")) {
                                    HStack {
                                        Text(condition.clinicalTerm ?? condition.description ?? "Unknown")
                                            .font(.subheadline.weight(.semibold))
                                        Spacer()
                                        if let status = condition.status {
                                            StatusBadge(text: status.capitalized, color: statusColor(status))
                                        }
                                    }
                                    if let date = condition.diagnosisDate {
                                        Text("Diagnosed: \(date)")
                                            .font(.caption)
                                            .foregroundStyle(.tertiary)
                                    }
                                    if let details = condition.details {
                                        Text(details)
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                }
                            }
                        }
                    }

                    // Medications
                    if let medications = data.medications, !medications.isEmpty {
                        ProfileCardSection(
                            title: "Medications",
                            systemImage: "pills.fill",
                            color: .pink,
                            count: medications.count,
                            onEdit: { editingSection = .init("medications") }
                        ) {
                            ForEach(medications) { med in
                                let medStatus = (med.status ?? "active").lowercased()
                                let isActive = medStatus != "discontinued" && medStatus != "paused"
                                AccentCard(color: isActive ? .pink : .gray) {
                                    HStack {
                                        Text(med.name ?? "Unknown")
                                            .font(.subheadline.weight(.semibold))
                                        Spacer()
                                        if let status = med.status {
                                            StatusBadge(text: status.capitalized, color: medicationStatusColor(status))
                                        }
                                    }
                                    if let desc = med.description, !desc.isEmpty {
                                        Text(desc)
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                    if let dose = med.dose {
                                        HStack(spacing: 4) {
                                            Image(systemName: "cross.case")
                                                .font(.caption2)
                                                .foregroundStyle(.pink)
                                            Text(dose + (med.frequency.map { " \u{2022} \($0)" } ?? ""))
                                                .font(.caption)
                                                .foregroundStyle(.secondary)
                                        }
                                    }
                                    if let cat = med.category, let label = medicationCategoryLabel(cat) {
                                        Text(label)
                                            .font(.caption2)
                                            .foregroundStyle(.tertiary)
                                    }
                                    if let prescriber = med.prescriber {
                                        Text("Prescribed by \(prescriber)")
                                            .font(.caption)
                                            .foregroundStyle(.tertiary)
                                    }
                                    if let startDate = med.startDate {
                                        Text("Started: \(startDate)")
                                            .font(.caption)
                                            .foregroundStyle(.tertiary)
                                    }
                                    if let notes = med.notes {
                                        Text(notes)
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                }
                                .opacity(isActive ? 1.0 : 0.7)
                            }
                        }
                    }

                    // Allergies
                    if let allergies = data.allergies, !allergies.isEmpty {
                        ProfileCardSection(
                            title: "Allergies",
                            systemImage: "exclamationmark.triangle.fill",
                            color: .red,
                            count: allergies.count,
                            onEdit: { editingSection = .init("allergies") }
                        ) {
                            ForEach(allergies) { allergy in
                                AccentCard(color: severityColor(allergy.severity ?? "")) {
                                    HStack {
                                        Text(allergy.substance ?? "Unknown")
                                            .font(.subheadline.weight(.semibold))
                                        Spacer()
                                        if let severity = allergy.severity {
                                            StatusBadge(text: severity.capitalized, color: severityColor(severity))
                                        }
                                    }
                                    if let reaction = allergy.reaction {
                                        Text(reaction)
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                }
                            }
                        }
                    }

                    // Events
                    if let events = data.events, !events.isEmpty {
                        ProfileCardSection(
                            title: "Key Events",
                            systemImage: "calendar",
                            color: .blue,
                            count: events.count,
                            onEdit: { editingSection = .init("events") }
                        ) {
                            ForEach(events) { event in
                                AccentCard(color: eventTypeColor(event.eventType)) {
                                    HStack {
                                        Text(event.description ?? event.eventType ?? "Event")
                                            .font(.subheadline.weight(.semibold))
                                        Spacer()
                                        if let type = event.eventType {
                                            StatusBadge(text: eventTypeLabel(type), color: eventTypeColor(type))
                                        }
                                    }
                                    if let date = event.date {
                                        Text(date)
                                            .font(.caption)
                                            .foregroundStyle(.tertiary)
                                    }
                                    if let details = event.details {
                                        Text(details)
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                }
                            }
                        }
                    }

                    // Preferences
                    if let prefs = data.preferences {
                        ProfileCardSection(
                            title: "Preferences",
                            systemImage: "gearshape.fill",
                            color: .indigo,
                            count: nil,
                            onEdit: { editingSection = .init("preferences") }
                        ) {
                            if let emergency = prefs.emergencyInstructions, !emergency.isEmpty {
                                HStack(alignment: .top, spacing: 10) {
                                    Image(systemName: "exclamationmark.circle.fill")
                                        .foregroundStyle(.red)
                                        .font(.subheadline)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text("Emergency Instructions")
                                            .font(.caption.weight(.semibold))
                                            .foregroundStyle(.red)
                                        Text(emergency)
                                            .font(.caption)
                                    }
                                }
                                .padding(10)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(Color.red.opacity(0.08))
                                .clipShape(RoundedRectangle(cornerRadius: 8))
                            }

                            if let commPrefs = prefs.communicationPreferences, !commPrefs.isEmpty {
                                PreferencesSubSection(title: "Communication") {
                                    ForEach(commPrefs) { pref in
                                        if let value = pref.preference, !value.isEmpty {
                                            AccentCard(color: .indigo) {
                                                if let cat = pref.category {
                                                    Text(cat)
                                                        .font(.caption2.weight(.semibold))
                                                        .foregroundStyle(.indigo)
                                                }
                                                Text(value)
                                                    .font(.caption)
                                                    .foregroundStyle(.secondary)
                                            }
                                        }
                                    }
                                }
                            }

                            if let guidelines = prefs.caregivingGuidelines, !guidelines.isEmpty {
                                PreferencesSubSection(title: "Caregiving Guidelines") {
                                    ForEach(guidelines) { guideline in
                                        if let value = guideline.guideline, !value.isEmpty {
                                            AccentCard(color: importanceColor(guideline.importance ?? "")) {
                                                HStack {
                                                    Text(value)
                                                        .font(.caption)
                                                    Spacer()
                                                    if let importance = guideline.importance {
                                                        StatusBadge(
                                                            text: importance.capitalized,
                                                            color: importanceColor(importance)
                                                        )
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }

                            if let contexts = prefs.importantContext, !contexts.isEmpty {
                                PreferencesSubSection(title: "Important Context") {
                                    ForEach(contexts) { ctx in
                                        if let value = ctx.context, !value.isEmpty {
                                            AccentCard(color: .indigo) {
                                                if let cat = ctx.category {
                                                    Text(cat)
                                                        .font(.caption2.weight(.semibold))
                                                        .foregroundStyle(.indigo)
                                                }
                                                Text(value)
                                                    .font(.caption)
                                                    .foregroundStyle(.secondary)
                                            }
                                        }
                                    }
                                }
                            }

                            if let notes = prefs.additionalNotes, !notes.isEmpty {
                                PreferencesSubSection(title: "Additional Notes") {
                                    Text(notes)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }

                // Last updated
                if let lastUpdate = viewModel.profile?.updatedAt {
                    Text("Last updated: \(lastUpdate.dateTimeString)")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                        .padding(.top, 4)
                        .padding(.bottom, 24)
                }
                }
                .padding(.horizontal)
                .padding(.top, 8)
            }
        }
    }

    // MARK: - Progress Bar

    private var progressBar: some View {
        let percentage = completionPercentage
        return VStack(spacing: 8) {
            HStack {
                Text("Profile Completeness")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.secondary)
                Spacer()
                Text("\(Int(percentage))%")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(percentage >= 100 ? .green : Color.accentColor)
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color(.systemGray5))
                    RoundedRectangle(cornerRadius: 4)
                        .fill(
                            LinearGradient(
                                colors: [.purple, .blue],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                        .frame(width: geo.size.width * percentage / 100)
                }
            }
            .frame(height: 6)
        }
        .padding(12)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private var completionPercentage: Double {
        guard let data = viewModel.profileData else { return 0 }
        var completed = 0
        let total = 8
        if data.patient != nil { completed += 1 }
        if let c = data.caregivers, !c.isEmpty { completed += 1 }
        if let p = data.providers, !p.isEmpty { completed += 1 }
        if let c = data.conditions, !c.isEmpty { completed += 1 }
        if let m = data.medications, !m.isEmpty { completed += 1 }
        if let a = data.allergies, !a.isEmpty { completed += 1 }
        if let e = data.events, !e.isEmpty { completed += 1 }
        if let p = data.preferences,
           p.emergencyInstructions != nil || !(p.communicationPreferences ?? []).isEmpty
            || !(p.caregivingGuidelines ?? []).isEmpty || !(p.importantContext ?? []).isEmpty
            || p.additionalNotes != nil {
            completed += 1
        }
        return Double(completed) / Double(total) * 100
    }

    // MARK: - Empty Profile State

    private var emptyProfileState: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("A living summary of patient, caregiver, provider, and care details. You stay in control at all times, with full ability to edit, copy, download, or reset it, and nothing is changed without your approval.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)

                VStack(spacing: 20) {
                    Image(systemName: "person.crop.circle")
                        .font(.system(size: 56))
                        .foregroundStyle(Color.accentColor)

                    Text("No Health Profile Yet")
                        .font(.title3.weight(.bold))

                    Text("To get started, have a few conversations or add some journal entries first. Then tap the button below to generate your profile from that activity. You can update it anytime new information is available.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)

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
                    .padding(.top, 4)
                }
                .frame(maxWidth: .infinity)
                .padding(24)
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(Color(.secondarySystemGroupedBackground))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(Color(.separator), lineWidth: 1)
                )
                .padding(.top, 16)
            }
            .padding(.horizontal, 20)
            .padding(.top, 8)
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

    // MARK: - Copy & Export

    private func copyProfileToClipboard() {
        guard let data = viewModel.profileData else { return }
        var lines: [String] = ["Health Profile", ""]

        if let p = data.patient {
            lines.append("Patient Information")
            if let v = p.fullName { lines.append("  Name: \(v)") }
            if let v = p.preferredName { lines.append("  Preferred Name: \(v)") }
            if let v = p.dateOfBirth { lines.append("  Date of Birth: \(v)") }
            if let v = p.age { lines.append("  Age: \(v)") }
            if let v = p.contactInfo { lines.append("  Contact: \(v)") }
            if let v = p.location { lines.append("  Location: \(v)") }
            lines.append("")
        }
        if let items = data.caregivers, !items.isEmpty {
            lines.append("Caregivers")
            for item in items {
                lines.append("  \(item.name ?? "Unknown")")
                if let v = item.relationship { lines.append("    Relationship: \(v)") }
                if let v = item.role { lines.append("    Role: \(v)") }
                if let v = item.contactInfo { lines.append("    Contact: \(v)") }
                if let v = item.location { lines.append("    Location: \(v)") }
            }
            lines.append("")
        }
        if let items = data.providers, !items.isEmpty {
            lines.append("Healthcare Providers")
            for item in items {
                lines.append("  \(item.name ?? "Unknown")")
                if let v = item.specialty { lines.append("    Specialty: \(v)") }
                if let v = item.organization { lines.append("    Organization: \(v)") }
                if let v = item.contactInfo { lines.append("    Contact: \(v)") }
            }
            lines.append("")
        }
        if let items = data.conditions, !items.isEmpty {
            lines.append("Conditions")
            for item in items {
                lines.append("  \(item.clinicalTerm ?? item.description ?? "Unknown") (\(item.status ?? "unknown"))")
                if let v = item.diagnosisDate { lines.append("    Diagnosed: \(v)") }
                if let v = item.details { lines.append("    \(v)") }
            }
            lines.append("")
        }
        if let items = data.medications, !items.isEmpty {
            lines.append("Medications")
            for item in items {
                var desc = item.name ?? "Unknown"
                if let dose = item.dose { desc += " - \(dose)" }
                if let freq = item.frequency { desc += " (\(freq))" }
                if let status = item.status { desc += " [\(status.uppercased())]" }
                lines.append("  \(desc)")
                if let v = item.description, !v.isEmpty { lines.append("    \(v)") }
                if let v = item.category, let label = medicationCategoryLabel(v) { lines.append("    Category: \(label)") }
                if let v = item.prescriber { lines.append("    Prescriber: \(v)") }
                if let v = item.startDate { lines.append("    Started: \(v)") }
                if let v = item.notes { lines.append("    \(v)") }
            }
            lines.append("")
        }
        if let items = data.allergies, !items.isEmpty {
            lines.append("Allergies")
            for item in items {
                var desc = item.substance ?? "Unknown"
                if let sev = item.severity { desc += " [\(sev)]" }
                lines.append("  \(desc)")
                if let v = item.reaction { lines.append("    Reaction: \(v)") }
            }
            lines.append("")
        }
        if let items = data.events, !items.isEmpty {
            lines.append("Key Events")
            for item in items {
                var desc = item.description ?? item.eventType ?? "Event"
                if let type = item.eventType { desc += " [\(eventTypeLabel(type))]" }
                if let date = item.date { desc += " (\(date))" }
                lines.append("  \(desc)")
                if let v = item.details { lines.append("    \(v)") }
            }
            lines.append("")
        }
        if let prefs = data.preferences {
            lines.append("Preferences")
            if let v = prefs.emergencyInstructions { lines.append("  Emergency: \(v)") }
            if let items = prefs.communicationPreferences {
                for item in items {
                    if let v = item.preference { lines.append("  \(item.category ?? "Pref"): \(v)") }
                }
            }
            if let v = prefs.additionalNotes { lines.append("  Notes: \(v)") }
        }

        UIPasteboard.general.string = lines.joined(separator: "\n")
    }

    private func exportProfile(format: String) {
        isExporting = true
        Task {
            do {
                let fileURL = try await viewModel.exportProfile(sessionId: sessionId, format: format)
                exportURL = fileURL
                isExporting = false
                showingShareSheet = true
            } catch {
                isExporting = false
                viewModel.setError("Export failed: \(error.localizedDescription)")
            }
        }
    }

    // MARK: - Color Helpers

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

    private func importanceColor(_ importance: String) -> Color {
        switch importance.lowercased() {
        case "critical": return .red
        case "important": return .orange
        case "preferred": return .gray
        default: return .indigo
        }
    }

    private func medicationStatusColor(_ status: String) -> Color {
        switch status.lowercased() {
        case "active": return .green
        case "paused": return .yellow
        case "discontinued": return .gray
        default: return .green
        }
    }

    private func medicationCategoryLabel(_ category: String) -> String? {
        let labels: [String: String] = [
            "multiple": "Multiple Uses",
            "pain_management": "Pain Relief",
            "cardiovascular": "Heart & Blood Pressure",
            "diabetes": "Diabetes & Blood Sugar",
            "mental_health": "Mental Health",
            "antibiotics": "Infection & Antibiotics",
            "respiratory": "Breathing & Lungs",
            "gastrointestinal": "Stomach & Digestion",
            "neurological": "Brain & Nerves",
            "endocrine": "Hormones",
            "oncology": "Cancer Treatment",
            "immunosuppressant": "Immune System",
            "vitamins_supplements": "Vitamins & Supplements",
            "other": "Other"
        ]
        return labels[category.lowercased()]
    }

    private func eventTypeLabel(_ type: String) -> String {
        let labels: [String: String] = [
            "hospitalization": "Hospitalization",
            "surgery": "Surgery",
            "er_visit": "ER Visit",
            "major_diagnosis": "Major Diagnosis",
            "procedure": "Procedure",
            "other": "Other"
        ]
        return labels[type.lowercased()] ?? type.capitalized
    }

    private func eventTypeColor(_ type: String?) -> Color {
        switch (type ?? "").lowercased() {
        case "hospitalization": return .red
        case "surgery": return .purple
        case "er_visit": return .orange
        case "major_diagnosis": return .pink
        case "procedure": return .blue
        default: return .blue
        }
    }
}

// MARK: - Profile Card Section

private struct ProfileCardSection<Content: View>: View {
    let title: String
    let systemImage: String
    let color: Color
    let count: Int?
    var onEdit: (() -> Void)?
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            // Section header
            HStack(spacing: 10) {
                Image(systemName: systemImage)
                    .font(.subheadline)
                    .foregroundStyle(.white)
                    .frame(width: 30, height: 30)
                    .background(color.gradient)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .accessibilityHidden(true)

                Text(title)
                    .font(.headline)

                if let count {
                    Text("\(count)")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(color.opacity(0.7))
                        .clipShape(Capsule())
                }

                Spacer()

                if let onEdit {
                    Button {
                        onEdit()
                    } label: {
                        Image(systemName: "pencil")
                            .font(.subheadline)
                            .foregroundStyle(color)
                            .frame(width: 30, height: 30)
                            .background(color.opacity(0.1))
                            .clipShape(RoundedRectangle(cornerRadius: 6))
                    }
                    .accessibilityLabel("Edit \(title)")
                }
            }

            content
        }
        .padding(14)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

// MARK: - Profile Field (key-value row)

private struct ProfileField: View {
    let label: String
    let value: String?

    init(_ label: String, value: String?) {
        self.label = label
        self.value = value
    }

    var body: some View {
        if let value, !value.isEmpty {
            HStack(alignment: .top) {
                Text(label)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .frame(width: 100, alignment: .leading)
                Text(value)
                    .font(.subheadline)
            }
        }
    }
}

// MARK: - Accent Card (left-bordered item)

private struct AccentCard<Content: View>: View {
    let color: Color
    @ViewBuilder let content: Content

    var body: some View {
        HStack(spacing: 0) {
            RoundedRectangle(cornerRadius: 2)
                .fill(color)
                .frame(width: 4)

            VStack(alignment: .leading, spacing: 4) {
                content
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
        }
        .background(color.opacity(0.05))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}

// MARK: - Status Badge

private struct StatusBadge: View {
    let text: String
    let color: Color

    var body: some View {
        Text(text)
            .font(.caption2.weight(.semibold))
            .padding(.horizontal, 7)
            .padding(.vertical, 2)
            .background(color.opacity(0.15))
            .foregroundStyle(color)
            .clipShape(Capsule())
    }
}

// MARK: - Preferences Sub-Section

private struct PreferencesSubSection<Content: View>: View {
    let title: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
                .padding(.top, 4)
            content
        }
    }
}

// MARK: - Edit Section Identifier

private struct EditSection: Identifiable {
    let id: String
    init(_ name: String) { self.id = name }
}

// MARK: - Section Edit View

private struct ProfileSectionEditView: View {
    let sessionId: String
    let section: EditSection
    let profileData: ProfileData
    let viewModel: ProfileViewModel

    @Environment(\.dismiss) private var dismiss

    // Patient fields
    @State private var fullName = ""
    @State private var preferredName = ""
    @State private var dateOfBirth = ""
    @State private var age = ""
    @State private var contactInfo = ""
    @State private var location = ""

    // List sections
    @State private var caregivers: [CaregiverInfo] = []
    @State private var providers: [ProviderInfo] = []
    @State private var conditions: [ConditionInfo] = []
    @State private var medications: [MedicationInfo] = []
    @State private var allergies: [AllergyInfo] = []
    @State private var events: [EventInfo] = []

    // Preferences
    @State private var emergencyInstructions = ""
    @State private var additionalNotes = ""
    @State private var communicationPreferences: [CommunicationPreference] = []
    @State private var caregivingGuidelines: [CaregivingGuideline] = []
    @State private var importantContext: [ImportantContext] = []

    var body: some View {
        Form {
            switch section.id {
            case "patient": patientForm
            case "caregivers": caregiversForm
            case "providers": providersForm
            case "conditions": conditionsForm
            case "medications": medicationsForm
            case "allergies": allergiesForm
            case "events": eventsForm
            case "preferences": preferencesForm
            default: Text("Unknown section")
            }
        }
        .navigationTitle("Edit \(sectionTitle)")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel") { dismiss() }
            }
            ToolbarItem(placement: .confirmationAction) {
                Button("Save") { save() }
            }
        }
        .onAppear { loadData() }
    }

    private var sectionTitle: String {
        switch section.id {
        case "patient": return "Patient"
        case "caregivers": return "Caregivers"
        case "providers": return "Providers"
        case "conditions": return "Conditions"
        case "medications": return "Medications"
        case "allergies": return "Allergies"
        case "events": return "Events"
        case "preferences": return "Preferences"
        default: return section.id.capitalized
        }
    }

    private func loadData() {
        if let p = profileData.patient {
            fullName = p.fullName ?? ""
            preferredName = p.preferredName ?? ""
            dateOfBirth = p.dateOfBirth ?? ""
            age = p.age ?? ""
            contactInfo = p.contactInfo ?? ""
            location = p.location ?? ""
        }
        caregivers = profileData.caregivers ?? []
        providers = profileData.providers ?? []
        conditions = profileData.conditions ?? []
        medications = profileData.medications ?? []
        allergies = profileData.allergies ?? []
        events = profileData.events ?? []
        if let prefs = profileData.preferences {
            emergencyInstructions = prefs.emergencyInstructions ?? ""
            additionalNotes = prefs.additionalNotes ?? ""
            communicationPreferences = prefs.communicationPreferences ?? []
            caregivingGuidelines = prefs.caregivingGuidelines ?? []
            importantContext = prefs.importantContext ?? []
        }
    }

    // MARK: - Patient Form

    @ViewBuilder
    private var patientForm: some View {
        Section("Basic Information") {
            EditRow("Full Name", text: $fullName)
            EditRow("Preferred Name", text: $preferredName)
            EditRow("Date of Birth", text: $dateOfBirth)
            EditRow("Age", text: $age)
        }
        Section("Contact") {
            EditRow("Contact Info", text: $contactInfo)
            EditRow("Location", text: $location)
        }
    }

    // MARK: - Caregivers Form

    @ViewBuilder
    private var caregiversForm: some View {
        Group {
            ForEach($caregivers) { $caregiver in
                Section {
                    EditRow("Name", text: Binding(get: { caregiver.name ?? "" }, set: { caregiver.name = $0.isEmpty ? nil : $0 }))
                    EditRow("Relationship", text: Binding(get: { caregiver.relationship ?? "" }, set: { caregiver.relationship = $0.isEmpty ? nil : $0 }))
                    EditRow("Role", text: Binding(get: { caregiver.role ?? "" }, set: { caregiver.role = $0.isEmpty ? nil : $0 }))
                    EditRow("Contact", text: Binding(get: { caregiver.contactInfo ?? "" }, set: { caregiver.contactInfo = $0.isEmpty ? nil : $0 }))
                    EditRow("Location", text: Binding(get: { caregiver.location ?? "" }, set: { caregiver.location = $0.isEmpty ? nil : $0 }))
                } header: {
                    HStack {
                        Text(caregiver.name ?? "Caregiver")
                        Spacer()
                        Button("Remove", role: .destructive) {
                            caregivers.removeAll { $0.id == caregiver.id }
                        }
                        .font(.caption)
                    }
                }
            }
            Section {
                AddItemButton("Add Caregiver") {
                    caregivers.append(CaregiverInfo(id: UUID().uuidString))
                }
            }
        }
    }

    // MARK: - Providers Form

    @ViewBuilder
    private var providersForm: some View {
        ForEach($providers) { $provider in
            Section {
                EditRow("Name", text: Binding(get: { provider.name ?? "" }, set: { provider.name = $0.isEmpty ? nil : $0 }))
                EditRow("Specialty", text: Binding(get: { provider.specialty ?? "" }, set: { provider.specialty = $0.isEmpty ? nil : $0 }))
                EditRow("Organization", text: Binding(get: { provider.organization ?? "" }, set: { provider.organization = $0.isEmpty ? nil : $0 }))
                EditRow("Contact Info", text: Binding(get: { provider.contactInfo ?? "" }, set: { provider.contactInfo = $0.isEmpty ? nil : $0 }))
            } header: {
                HStack {
                    Text(provider.name ?? "Provider")
                    Spacer()
                    Button("Remove", role: .destructive) {
                        providers.removeAll { $0.id == provider.id }
                    }
                    .font(.caption)
                }
            }
        }
        Section {
            AddItemButton("Add Provider") {
                providers.append(ProviderInfo(id: UUID().uuidString))
            }
        }
    }

    // MARK: - Conditions Form

    @ViewBuilder
    private var conditionsForm: some View {
        ForEach($conditions) { $condition in
            Section {
                EditRow("Clinical Term", text: Binding(get: { condition.clinicalTerm ?? "" }, set: { condition.clinicalTerm = $0.isEmpty ? nil : $0 }))
                EditRow("Description", text: Binding(get: { condition.description ?? "" }, set: { condition.description = $0.isEmpty ? nil : $0 }))
                Picker("Status", selection: Binding(get: { condition.status ?? "active" }, set: { condition.status = $0 })) {
                    Text("Active").tag("active")
                    Text("Monitoring").tag("monitoring")
                    Text("Resolved").tag("resolved")
                }
                EditRow("Diagnosis Date", text: Binding(get: { condition.diagnosisDate ?? "" }, set: { condition.diagnosisDate = $0.isEmpty ? nil : $0 }))
                EditRow("Details", text: Binding(get: { condition.details ?? "" }, set: { condition.details = $0.isEmpty ? nil : $0 }))
            } header: {
                HStack {
                    Text(condition.clinicalTerm ?? condition.description ?? "Condition")
                    Spacer()
                    Button("Remove", role: .destructive) {
                        conditions.removeAll { $0.id == condition.id }
                    }
                    .font(.caption)
                }
            }
        }
        Section {
            AddItemButton("Add Condition") {
                conditions.append(ConditionInfo(id: UUID().uuidString, status: "active"))
            }
        }
    }

    // MARK: - Medications Form

    @ViewBuilder
    private var medicationsForm: some View {
        ForEach($medications) { $med in
            Section {
                EditRow("Name", text: Binding(get: { med.name ?? "" }, set: { med.name = $0.isEmpty ? nil : $0 }))
                EditRow("Description", text: Binding(get: { med.description ?? "" }, set: { med.description = $0.isEmpty ? nil : $0 }))
                EditRow("Dose", text: Binding(get: { med.dose ?? "" }, set: { med.dose = $0.isEmpty ? nil : $0 }))
                EditRow("Frequency", text: Binding(get: { med.frequency ?? "" }, set: { med.frequency = $0.isEmpty ? nil : $0 }))
                Picker("Status", selection: Binding(get: { med.status ?? "active" }, set: { med.status = $0 })) {
                    Text("Active").tag("active")
                    Text("Paused").tag("paused")
                    Text("Discontinued").tag("discontinued")
                }
                Picker("Category", selection: Binding(get: { med.category ?? "other" }, set: { med.category = $0 })) {
                    Text("Multiple Uses").tag("multiple")
                    Text("Pain Relief").tag("pain_management")
                    Text("Heart & Blood Pressure").tag("cardiovascular")
                    Text("Diabetes & Blood Sugar").tag("diabetes")
                    Text("Mental Health").tag("mental_health")
                    Text("Infection & Antibiotics").tag("antibiotics")
                    Text("Breathing & Lungs").tag("respiratory")
                    Text("Stomach & Digestion").tag("gastrointestinal")
                    Text("Brain & Nerves").tag("neurological")
                    Text("Hormones").tag("endocrine")
                    Text("Cancer Treatment").tag("oncology")
                    Text("Immune System").tag("immunosuppressant")
                    Text("Vitamins & Supplements").tag("vitamins_supplements")
                    Text("Other").tag("other")
                }
                EditRow("Start Date", text: Binding(get: { med.startDate ?? "" }, set: { med.startDate = $0.isEmpty ? nil : $0 }))
                EditRow("Prescriber", text: Binding(get: { med.prescriber ?? "" }, set: { med.prescriber = $0.isEmpty ? nil : $0 }))
                EditRow("Notes", text: Binding(get: { med.notes ?? "" }, set: { med.notes = $0.isEmpty ? nil : $0 }))
            } header: {
                HStack {
                    Text(med.name ?? "Medication")
                    Spacer()
                    Button("Remove", role: .destructive) {
                        medications.removeAll { $0.id == med.id }
                    }
                    .font(.caption)
                }
            }
        }
        Section {
            AddItemButton("Add Medication") {
                medications.append(MedicationInfo(id: UUID().uuidString, status: "active", category: "other"))
            }
        }
    }

    // MARK: - Allergies Form

    @ViewBuilder
    private var allergiesForm: some View {
        ForEach($allergies) { $allergy in
            Section {
                EditRow("Substance", text: Binding(get: { allergy.substance ?? "" }, set: { allergy.substance = $0.isEmpty ? nil : $0 }))
                EditRow("Reaction", text: Binding(get: { allergy.reaction ?? "" }, set: { allergy.reaction = $0.isEmpty ? nil : $0 }))
                Picker("Severity", selection: Binding(get: { allergy.severity ?? "moderate" }, set: { allergy.severity = $0 })) {
                    Text("Mild").tag("mild")
                    Text("Moderate").tag("moderate")
                    Text("Severe").tag("severe")
                }
            } header: {
                HStack {
                    Text(allergy.substance ?? "Allergy")
                    Spacer()
                    Button("Remove", role: .destructive) {
                        allergies.removeAll { $0.id == allergy.id }
                    }
                    .font(.caption)
                }
            }
        }
        Section {
            AddItemButton("Add Allergy") {
                allergies.append(AllergyInfo(id: UUID().uuidString, severity: "moderate"))
            }
        }
    }

    // MARK: - Events Form

    @ViewBuilder
    private var eventsForm: some View {
        ForEach($events) { $event in
            Section {
                EditRow("Type", text: Binding(get: { event.eventType ?? "" }, set: { event.eventType = $0.isEmpty ? nil : $0 }))
                EditRow("Description", text: Binding(get: { event.description ?? "" }, set: { event.description = $0.isEmpty ? nil : $0 }))
                EditRow("Date", text: Binding(get: { event.date ?? "" }, set: { event.date = $0.isEmpty ? nil : $0 }))
                EditRow("Details", text: Binding(get: { event.details ?? "" }, set: { event.details = $0.isEmpty ? nil : $0 }))
            } header: {
                HStack {
                    Text(event.description ?? event.eventType ?? "Event")
                    Spacer()
                    Button("Remove", role: .destructive) {
                        events.removeAll { $0.id == event.id }
                    }
                    .font(.caption)
                }
            }
        }
        Section {
            AddItemButton("Add Event") {
                events.append(EventInfo(id: UUID().uuidString))
            }
        }
    }

    // MARK: - Preferences Form

    @ViewBuilder
    private var preferencesForm: some View {
        Section("Emergency Instructions") {
            TextEditor(text: $emergencyInstructions)
                .frame(minHeight: 80)
                .font(.subheadline)
        }

        Section("Communication Preferences") {
            ForEach($communicationPreferences) { $pref in
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text(pref.preference ?? "Preference")
                            .font(.subheadline.weight(.medium))
                        Spacer()
                        Button("Remove", role: .destructive) {
                            communicationPreferences.removeAll { $0.id == pref.id }
                        }
                        .font(.caption)
                    }
                    EditRow("Preference", text: Binding(get: { pref.preference ?? "" }, set: { pref.preference = $0.isEmpty ? nil : $0 }))
                    EditRow("Category", text: Binding(get: { pref.category ?? "" }, set: { pref.category = $0.isEmpty ? nil : $0 }))
                    EditRow("Details", text: Binding(get: { pref.details ?? "" }, set: { pref.details = $0.isEmpty ? nil : $0 }))
                }
            }
            AddItemButton("Add Preference") {
                communicationPreferences.append(CommunicationPreference(id: UUID().uuidString))
            }
        }

        Section("Caregiving Guidelines") {
            ForEach($caregivingGuidelines) { $guide in
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text(guide.guideline ?? "Guideline")
                            .font(.subheadline.weight(.medium))
                        Spacer()
                        Button("Remove", role: .destructive) {
                            caregivingGuidelines.removeAll { $0.id == guide.id }
                        }
                        .font(.caption)
                    }
                    EditRow("Guideline", text: Binding(get: { guide.guideline ?? "" }, set: { guide.guideline = $0.isEmpty ? nil : $0 }))
                    EditRow("Category", text: Binding(get: { guide.category ?? "" }, set: { guide.category = $0.isEmpty ? nil : $0 }))
                    Picker("Importance", selection: Binding(get: { guide.importance ?? "preferred" }, set: { guide.importance = $0 })) {
                        Text("Critical").tag("critical")
                        Text("Important").tag("important")
                        Text("Preferred").tag("preferred")
                    }
                    EditRow("Details", text: Binding(get: { guide.details ?? "" }, set: { guide.details = $0.isEmpty ? nil : $0 }))
                }
            }
            AddItemButton("Add Guideline") {
                caregivingGuidelines.append(CaregivingGuideline(id: UUID().uuidString, importance: "preferred"))
            }
        }

        Section("Important Context") {
            ForEach($importantContext) { $ctx in
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text(ctx.context ?? "Context")
                            .font(.subheadline.weight(.medium))
                        Spacer()
                        Button("Remove", role: .destructive) {
                            importantContext.removeAll { $0.id == ctx.id }
                        }
                        .font(.caption)
                    }
                    EditRow("Context", text: Binding(get: { ctx.context ?? "" }, set: { ctx.context = $0.isEmpty ? nil : $0 }))
                    EditRow("Category", text: Binding(get: { ctx.category ?? "" }, set: { ctx.category = $0.isEmpty ? nil : $0 }))
                    EditRow("Details", text: Binding(get: { ctx.details ?? "" }, set: { ctx.details = $0.isEmpty ? nil : $0 }))
                }
            }
            AddItemButton("Add Context") {
                importantContext.append(ImportantContext(id: UUID().uuidString))
            }
        }

        Section("Additional Notes") {
            TextEditor(text: $additionalNotes)
                .frame(minHeight: 80)
                .font(.subheadline)
        }
    }

    // MARK: - Save

    private func save() {
        Task {
            let sectionName = section.id
            switch sectionName {
            case "patient":
                let patient = PatientInfo(
                    fullName: fullName.isEmpty ? nil : fullName,
                    preferredName: preferredName.isEmpty ? nil : preferredName,
                    dateOfBirth: dateOfBirth.isEmpty ? nil : dateOfBirth,
                    age: age.isEmpty ? nil : age,
                    contactInfo: contactInfo.isEmpty ? nil : contactInfo,
                    location: location.isEmpty ? nil : location
                )
                let encoder = JSONEncoder()
                encoder.keyEncodingStrategy = .convertToSnakeCase
                if let jsonData = try? encoder.encode(patient),
                   let dict = try? JSONSerialization.jsonObject(with: jsonData) as? [String: Any] {
                    await viewModel.updateSection(sessionId: sessionId, section: sectionName, data: .dictionary(dict.mapValues { AnyCodableValue.from($0) }))
                }
            case "caregivers":
                await saveCodableList(caregivers, section: sectionName)
            case "providers":
                await saveCodableList(providers, section: sectionName)
            case "conditions":
                await saveCodableList(conditions, section: sectionName)
            case "medications":
                await saveCodableList(medications, section: sectionName)
            case "allergies":
                await saveCodableList(allergies, section: sectionName)
            case "events":
                await saveCodableList(events, section: sectionName)
            case "preferences":
                let prefs = PreferencesInfo(
                    communicationPreferences: communicationPreferences.isEmpty ? nil : communicationPreferences,
                    caregivingGuidelines: caregivingGuidelines.isEmpty ? nil : caregivingGuidelines,
                    importantContext: importantContext.isEmpty ? nil : importantContext,
                    emergencyInstructions: emergencyInstructions.isEmpty ? nil : emergencyInstructions,
                    additionalNotes: additionalNotes.isEmpty ? nil : additionalNotes
                )
                let encoder = JSONEncoder()
                encoder.keyEncodingStrategy = .convertToSnakeCase
                if let jsonData = try? encoder.encode(prefs),
                   let dict = try? JSONSerialization.jsonObject(with: jsonData) as? [String: Any] {
                    await viewModel.updateSection(sessionId: sessionId, section: sectionName, data: .dictionary(dict.mapValues { AnyCodableValue.from($0) }))
                }
            default:
                break
            }
            dismiss()
        }
    }

    private func saveCodableList<T: Encodable>(_ items: [T], section: String) async {
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        if let jsonData = try? encoder.encode(items),
           let array = try? JSONSerialization.jsonObject(with: jsonData) as? [[String: Any]] {
            let codableArray = array.map { dict in
                AnyCodableValue.dictionary(dict.mapValues { AnyCodableValue.from($0) })
            }
            await viewModel.updateSection(sessionId: sessionId, section: section, data: .array(codableArray))
        }
    }
}

// MARK: - Edit Row

private struct EditRow: View {
    let label: String
    @Binding var text: String

    init(_ label: String, text: Binding<String>) {
        self.label = label
        self._text = text
    }

    var body: some View {
        HStack {
            Text(label)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .frame(width: 100, alignment: .leading)
            TextField(label, text: $text)
                .font(.subheadline)
        }
    }
}

// MARK: - Add Item Button

private struct AddItemButton: View {
    let label: String
    let action: () -> Void

    init(_ label: String, action: @escaping () -> Void) {
        self.label = label
        self.action = action
    }

    var body: some View {
        Button {
            action()
        } label: {
            Label(label, systemImage: "plus.circle.fill")
                .font(.subheadline)
                .foregroundStyle(Color.accentColor)
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
                    VStack(alignment: .leading, spacing: 10) {
                        // Header: type badge + section + item name
                        HStack {
                            Text(change.changeType.rawValue.capitalized)
                                .font(.caption2.weight(.semibold))
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(changeTypeColor(change.changeType).opacity(0.15))
                                .foregroundStyle(changeTypeColor(change.changeType))
                                .clipShape(Capsule())

                            Text(change.section.replacingOccurrences(of: "_", with: " ").capitalized)
                                .font(.subheadline.weight(.semibold))

                            if let name = itemName(change) {
                                Text("— \(name)")
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                            }
                        }

                        // Change details
                        changeDetailView(change)

                        // Reasoning
                        HStack(alignment: .top, spacing: 4) {
                            Text("Reasoning:")
                                .font(.caption.weight(.medium))
                                .foregroundStyle(.secondary)
                            Text(change.reasoning)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }

                        Text(change.fieldPath)
                            .font(.caption2)
                            .foregroundStyle(.tertiary)

                        // Accept / Reject buttons
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

    // MARK: - Change Detail View

    @ViewBuilder
    private func changeDetailView(_ change: PendingChange) -> some View {
        switch change.changeType {
        case .add:
            if let newValue = change.newValue {
                VStack(alignment: .leading, spacing: 4) {
                    Text("New item to add:")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(.green)
                    ForEach(dictionaryEntries(newValue), id: \.key) { entry in
                        HStack(alignment: .top, spacing: 4) {
                            Text("\u{2022}")
                                .font(.caption)
                                .foregroundStyle(.green)
                            Text("\(formatKey(entry.key)):")
                                .font(.caption.weight(.medium))
                                .foregroundStyle(Color(.label))
                            Text(entry.value)
                                .font(.caption)
                                .foregroundStyle(.green)
                        }
                    }
                }
                .padding(8)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.green.opacity(0.08))
                .clipShape(RoundedRectangle(cornerRadius: 8))
            }

        case .edit:
            if let oldValue = change.oldValue, let newValue = change.newValue {
                let oldEntries = dictionaryMap(oldValue)
                let newEntries = dictionaryMap(newValue)

                if !oldEntries.isEmpty || !newEntries.isEmpty {
                    // Object edit — show changed fields
                    let allKeys = Array(Set(Array(oldEntries.keys) + Array(newEntries.keys)))
                        .filter { $0 != "id" }
                        .sorted()
                    VStack(alignment: .leading, spacing: 4) {
                        ForEach(allKeys, id: \.self) { key in
                            let oldVal = oldEntries[key]
                            let newVal = newEntries[key]
                            if oldVal != newVal, oldVal != nil || newVal != nil {
                                HStack(alignment: .top, spacing: 4) {
                                    Text("\(formatKey(key)):")
                                        .font(.caption.weight(.medium))
                                        .foregroundStyle(Color(.label))
                                    if let old = oldVal {
                                        Text(old)
                                            .font(.caption)
                                            .strikethrough()
                                            .foregroundStyle(.red)
                                    }
                                    Text("\u{2192}")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                    Text(newVal ?? "(removed)")
                                        .font(.caption)
                                        .foregroundStyle(.green)
                                }
                            }
                        }
                    }
                    .padding(8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color(.systemGray6))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                } else {
                    // Simple value edit
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(spacing: 4) {
                            Text("Current:")
                                .font(.caption.weight(.medium))
                                .foregroundStyle(.red)
                            Text(displayString(oldValue))
                                .font(.caption)
                                .foregroundStyle(.red)
                        }
                        .padding(6)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.red.opacity(0.08))
                        .clipShape(RoundedRectangle(cornerRadius: 6))

                        HStack(spacing: 4) {
                            Text("Proposed:")
                                .font(.caption.weight(.medium))
                                .foregroundStyle(.green)
                            Text(displayString(newValue))
                                .font(.caption)
                                .foregroundStyle(.green)
                        }
                        .padding(6)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.green.opacity(0.08))
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                    }
                }
            }

        case .delete:
            if let oldValue = change.oldValue {
                VStack(alignment: .leading, spacing: 4) {
                    Text("To delete:")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(.red)
                    let entries = dictionaryEntries(oldValue)
                    if !entries.isEmpty {
                        ForEach(entries, id: \.key) { entry in
                            HStack(alignment: .top, spacing: 4) {
                                Text("\u{2022}")
                                    .font(.caption)
                                    .foregroundStyle(.red)
                                Text("\(formatKey(entry.key)):")
                                    .font(.caption.weight(.medium))
                                    .foregroundStyle(Color(.label))
                                Text(entry.value)
                                    .font(.caption)
                                    .foregroundStyle(.red)
                            }
                        }
                    } else {
                        Text(displayString(oldValue))
                            .font(.caption)
                            .foregroundStyle(.red)
                    }
                }
                .padding(8)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.red.opacity(0.08))
                .clipShape(RoundedRectangle(cornerRadius: 8))
            }
        }
    }

    // MARK: - Helpers

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

    private func itemName(_ change: PendingChange) -> String? {
        if let name = extractString(change.newValue, key: "name") { return name }
        if let name = extractString(change.oldValue, key: "name") { return name }
        if let name = extractString(change.newValue, key: "substance") { return name }
        if let name = extractString(change.oldValue, key: "substance") { return name }
        return nil
    }

    private func extractString(_ value: AnyCodableValue?, key: String) -> String? {
        guard case .dictionary(let dict) = value,
              case .string(let str) = dict[key] else { return nil }
        return str.isEmpty ? nil : str
    }

    private func displayString(_ value: AnyCodableValue) -> String {
        switch value {
        case .string(let s): return s
        case .int(let i): return String(i)
        case .double(let d): return String(d)
        case .bool(let b): return b ? "true" : "false"
        case .null: return "(none)"
        case .array, .dictionary: return "(complex value)"
        }
    }

    private func dictionaryEntries(_ value: AnyCodableValue) -> [(key: String, value: String)] {
        guard case .dictionary(let dict) = value else {
            return []
        }
        return dict.compactMap { key, val in
            guard key != "id" else { return nil }
            let str = displayString(val)
            guard !str.isEmpty, str != "(none)" else { return nil }
            return (key: key, value: str)
        }.sorted { $0.key < $1.key }
    }

    private func dictionaryMap(_ value: AnyCodableValue) -> [String: String] {
        guard case .dictionary(let dict) = value else { return [:] }
        var result: [String: String] = [:]
        for (key, val) in dict {
            guard key != "id" else { continue }
            let str = displayString(val)
            if !str.isEmpty, str != "(none)" {
                result[key] = str
            }
        }
        return result
    }

    private func formatKey(_ key: String) -> String {
        key.replacingOccurrences(of: "_", with: " ")
    }
}
