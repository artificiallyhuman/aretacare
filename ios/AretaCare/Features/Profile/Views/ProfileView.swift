import SwiftUI

struct ProfileView: View {
    let sessionId: String
    var sessionName: String = ""

    @State private var viewModel = ProfileViewModel()
    @State private var showingRegenConfirm = false
    @State private var showingPendingChanges = false
    @State private var showingShareSheet = false
    @State private var exportURL: URL?
    @State private var isExporting = false
    @State private var editingSection: ProfileEditSection?
    @State private var showSavedToast = false
    @State private var saveHapticTrigger = 0

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
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                VStack(spacing: 1) {
                    Text("Health Profile")
                        .font(.headline)
                    if !sessionName.isEmpty {
                        Text(sessionName)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
            }
        }
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
        .overlay(alignment: .top) {
            // ProfileViewModel writes errorMessage on every failed load/update,
            // but nothing here rendered it — failures were invisible
            if let error = viewModel.errorMessage {
                ErrorBannerView(message: error) {
                    viewModel.dismissError()
                }
                .padding(.top, 8)
            }
        }
        .confirmationDialog("Regenerate Profile", isPresented: $showingRegenConfirm, titleVisibility: .visible) {
            Button("Regenerate", role: .destructive) {
                Task {
                    guard !viewModel.isLoading && !viewModel.isRegenerating else { return }
                    await viewModel.regenerateProfile(sessionId: sessionId)
                }
            }
        } message: {
            Text("This will regenerate your entire health profile from your conversations. Any manual edits will be preserved as pending changes.")
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
        .sheet(isPresented: $showingShareSheet, onDismiss: {
            if let exportURL {
                try? FileManager.default.removeItem(at: exportURL)
            }
            exportURL = nil
        }) {
            if let exportURL {
                ShareSheet(activityItems: [exportURL])
            }
        }
        .sheet(isPresented: $showingPendingChanges) {
            NavigationStack {
                ProfilePendingChangesView(sessionId: sessionId, viewModel: viewModel)
            }
        }
        .sheet(item: $editingSection) { section in
            NavigationStack {
                ProfileSectionEditView(
                    sessionId: sessionId,
                    section: section,
                    profileData: viewModel.profileData ?? ProfileData(),
                    viewModel: viewModel
                ) {
                    saveHapticTrigger += 1
                    withAnimation(.spring(duration: 0.3)) {
                        showSavedToast = true
                    }
                }
            }
        }
        .sensoryFeedback(.success, trigger: saveHapticTrigger)
        .toast("Saved", icon: "checkmark", isPresented: $showSavedToast)
        .animation(.spring(duration: 0.3), value: showSavedToast)
        .task {
            await viewModel.fetchProfile(sessionId: sessionId)
            await viewModel.checkProfile(sessionId: sessionId)
        }
    }

    // MARK: - Profile Content

    private var profileContent: some View {
        ScrollView {
            VStack(spacing: 0) {
                HStack(spacing: 8) {
                    Image(systemName: "info.circle")
                        .foregroundStyle(.orange)
                        .font(.caption)
                    Text("A shareable summary for caregivers and providers, built from your conversations and journal entries. Review and edit before sharing.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding(10)
                .background(
                    RoundedRectangle(cornerRadius: 8)
                        .fill(Color.orange.opacity(0.08))
                )
                .padding(.horizontal)
                .padding(.top, 8)

                if viewModel.needsUpdate && !viewModel.isUpdating {
                    newActivityBanner
                }

                VStack(spacing: 16) {
                    progressBar

                    if let data = viewModel.profileData {
                        // Every section renders, empty or not: a hidden section still
                        // counts toward the completeness percentage, so omitting it left
                        // the score unexplainable. Completeness comes from
                        // `viewModel.sectionStatuses` — the view never decides it.
                        patientSection(data.patient, status: viewModel.sectionStatus("patient"))
                        caregiversSection(data.caregivers ?? [], status: viewModel.sectionStatus("caregivers"))
                        providersSection(data.providers ?? [], status: viewModel.sectionStatus("providers"))
                        conditionsSection(data.conditions ?? [], status: viewModel.sectionStatus("conditions"))
                        medicationsSection(data.medications ?? [], status: viewModel.sectionStatus("medications"))
                        allergiesSection(data.allergies ?? [], status: viewModel.sectionStatus("allergies"))
                        eventsSection(data.events ?? [], status: viewModel.sectionStatus("events"))
                        preferencesSection(data.preferences, status: viewModel.sectionStatus("preferences"))
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
        .refreshable {
            await viewModel.fetchProfile(sessionId: sessionId)
        }
    }

    // MARK: - Sections

    @ViewBuilder
    private func patientSection(_ patient: PatientInfo?, status: ProfileSectionStatus) -> some View {
        ProfileCardSection(
            title: "Patient Information",
            systemImage: "person.fill",
            color: .purple,
            count: nil,
            onEdit: { editingSection = .init("patient") }
        ) {
            if status.isComplete, let patient {
                ProfileField("Full Name", value: patient.fullName)
                ProfileField("Preferred Name", value: patient.preferredName)
                ProfileField("Date of Birth", value: patient.dateOfBirth)
                ProfileField("Age", value: patient.age)
                ProfileField("Contact", value: patient.contactInfo)
                ProfileField("Location", value: patient.location)
            } else {
                ProfileEmptyText(status.emptyText)
            }
        }
    }

    @ViewBuilder
    private func caregiversSection(_ caregivers: [CaregiverInfo], status: ProfileSectionStatus) -> some View {
        ProfileCardSection(
            title: "Caregivers",
            systemImage: "person.2.fill",
            color: .green,
            count: caregivers.isEmpty ? nil : caregivers.count,
            onEdit: { editingSection = .init("caregivers") }
        ) {
            if status.isComplete {
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
            } else {
                ProfileEmptyText(status.emptyText)
            }
        }
    }

    @ViewBuilder
    private func providersSection(_ providers: [ProviderInfo], status: ProfileSectionStatus) -> some View {
        ProfileCardSection(
            title: "Healthcare Providers",
            systemImage: "stethoscope",
            color: .teal,
            count: providers.isEmpty ? nil : providers.count,
            onEdit: { editingSection = .init("providers") }
        ) {
            if status.isComplete {
                ForEach(providers) { provider in
                    ProviderRowView(provider: provider)
                }
            } else {
                ProfileEmptyText(status.emptyText)
            }
        }
    }

    @ViewBuilder
    private func conditionsSection(_ conditions: [ConditionInfo], status: ProfileSectionStatus) -> some View {
        ProfileCardSection(
            title: "Conditions",
            systemImage: "heart.text.square.fill",
            color: .orange,
            count: conditions.isEmpty ? nil : conditions.count,
            onEdit: { editingSection = .init("conditions") }
        ) {
            if status.isComplete {
                ForEach(sortedConditions(conditions)) { condition in
                    AccentCard(color: profileStatusColor(condition.status ?? "")) {
                        HStack {
                            Text(condition.clinicalTerm ?? condition.description ?? "Unknown")
                                .font(.subheadline.weight(.semibold))
                            Spacer()
                            if let status = condition.status {
                                StatusBadge(text: status.capitalized, color: profileStatusColor(status))
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
            } else {
                ProfileEmptyText(status.emptyText)
            }
        }
    }

    @ViewBuilder
    private func medicationsSection(_ medications: [MedicationInfo], status: ProfileSectionStatus) -> some View {
        ProfileCardSection(
            title: "Medications",
            systemImage: "pills.fill",
            color: .pink,
            count: medications.isEmpty ? nil : medications.count,
            onEdit: { editingSection = .init("medications") }
        ) {
            if status.isComplete {
                ForEach(medicationsGroupedByCategory(medications), id: \.category) { group in
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text(group.label)
                                .font(.caption.weight(.bold))
                                .foregroundStyle(.secondary)
                                .textCase(.uppercase)
                            Spacer()
                            Text("\(group.medications.count)")
                                .font(.caption2.weight(.medium))
                                .foregroundStyle(.tertiary)
                        }
                        .padding(.top, 4)

                        ForEach(group.medications) { med in
                            let medStatus = (med.status ?? "active").lowercased()
                            let isActive = medStatus != "discontinued" && medStatus != "paused"
                            AccentCard(color: isActive ? .pink : .gray) {
                                HStack {
                                    Text(med.name ?? "Unknown")
                                        .font(.subheadline.weight(.semibold))
                                    Spacer()
                                    if let status = med.status {
                                        StatusBadge(text: status.capitalized, color: profileMedicationStatusColor(status))
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
            } else {
                ProfileEmptyText(status.emptyText)
            }
        }
    }

    @ViewBuilder
    private func allergiesSection(_ allergies: [AllergyInfo], status: ProfileSectionStatus) -> some View {
        ProfileCardSection(
            title: "Allergies",
            systemImage: "exclamationmark.triangle.fill",
            color: .red,
            count: allergies.isEmpty ? nil : allergies.count,
            onEdit: { editingSection = .init("allergies") }
        ) {
            if status.isComplete {
                ForEach(allergies) { allergy in
                    AccentCard(color: profileSeverityColor(allergy.severity ?? "")) {
                        HStack {
                            Text(allergy.substance ?? "Unknown")
                                .font(.subheadline.weight(.semibold))
                            Spacer()
                            if let severity = allergy.severity {
                                StatusBadge(text: severity.capitalized, color: profileSeverityColor(severity))
                            }
                        }
                        if let reaction = allergy.reaction {
                            Text(reaction)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            } else {
                ProfileEmptyText(status.emptyText)
            }
        }
    }

    @ViewBuilder
    private func eventsSection(_ events: [EventInfo], status: ProfileSectionStatus) -> some View {
        ProfileCardSection(
            title: "Key Events",
            systemImage: "calendar",
            color: .blue,
            count: events.isEmpty ? nil : events.count,
            onEdit: { editingSection = .init("events") }
        ) {
            if status.isComplete {
                ForEach(sortedEvents(events)) { event in
                    AccentCard(color: profileEventTypeColor(event.eventType)) {
                        HStack {
                            Text(event.description ?? event.eventType ?? "Event")
                                .font(.subheadline.weight(.semibold))
                            Spacer()
                            if let type = event.eventType {
                                StatusBadge(text: profileEventTypeLabel(type), color: profileEventTypeColor(type))
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
            } else {
                ProfileEmptyText(status.emptyText)
            }
        }
    }

    @ViewBuilder
    private func preferencesSection(_ prefs: PreferencesInfo?, status: ProfileSectionStatus) -> some View {
        ProfileCardSection(
            title: "Preferences",
            systemImage: "gearshape.fill",
            color: .indigo,
            count: nil,
            onEdit: { editingSection = .init("preferences") }
        ) {
            if status.isComplete, let prefs {
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
                                    if let cat = pref.category, !cat.isEmpty {
                                        Text(profileCommCategoryLabel(cat))
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
                                AccentCard(color: profileImportanceColor(guideline.importance ?? "")) {
                                    if let cat = guideline.category, !cat.isEmpty {
                                        Text(profileGuideCategoryLabel(cat))
                                            .font(.caption2.weight(.semibold))
                                            .foregroundStyle(profileImportanceColor(guideline.importance ?? ""))
                                    }
                                    HStack {
                                        Text(value)
                                            .font(.caption)
                                        Spacer()
                                        if let importance = guideline.importance {
                                            StatusBadge(
                                                text: importance.capitalized,
                                                color: profileImportanceColor(importance)
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
                                    if let cat = ctx.category, !cat.isEmpty {
                                        Text(profileContextCategoryLabel(cat))
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
            } else {
                ProfileEmptyText(status.emptyText)
            }
        }
    }

    // MARK: - Progress Bar

    private var progressBar: some View {
        let percentage = viewModel.completionPercentage
        // Rounded for display so the label matches the web client, which uses
        // Math.round — truncating showed 87% for a 7-of-8 profile that web called
        // 88%. Only nine values are reachable (0, 12.5 … 100), so this can never
        // round up to a false 100%.
        let shown = Int(percentage.rounded())
        return VStack(spacing: 8) {
            HStack {
                Text("Profile Completeness")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.secondary)
                Spacer()
                Text("\(shown)%")
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

            // Names what the percentage is counting. Empty sections now render as
            // placeholder cards too, but the caption saves scrolling to find them.
            Text(completenessHint)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(12)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .accessibilityElement(children: .combine)
        .accessibilityValue("\(shown) percent complete")
    }

    private var completenessHint: String {
        let missing = viewModel.missingSectionLabels
        switch missing.count {
        case 0:
            return "Your profile is complete"
        case 1, 2:
            return "Add \(missing.formatted(.list(type: .and))) to reach 100%"
        default:
            return "\(missing.count) sections to go \u{2014} tap a section to add details"
        }
    }

    // MARK: - Empty Profile State

    private var emptyProfileState: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("A shareable summary of the patient, caregivers, providers, and care details. You stay in control: edit, copy, download, or reset anytime, and nothing changes without your approval.")
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

    // MARK: - Sorting Helpers

    private func sortedConditions(_ conditions: [ConditionInfo]) -> [ConditionInfo] {
        profileSortedConditions(conditions)
    }

    private let medicationCategoryOrder = MedicationCategories.displayOrder

    private func medicationsGroupedByCategory(_ medications: [MedicationInfo]) -> [(category: String, label: String, medications: [MedicationInfo])] {
        let statusOrder = ["active": 0, "paused": 1, "discontinued": 2]
        return medicationCategoryOrder.compactMap { categoryKey in
            let medsInCategory = medications
                .filter { ($0.category ?? "other").lowercased() == categoryKey }
                .sorted { a, b in
                    let statA = statusOrder[(a.status ?? "active").lowercased()] ?? 0
                    let statB = statusOrder[(b.status ?? "active").lowercased()] ?? 0
                    return statA < statB
                }
            guard !medsInCategory.isEmpty else { return nil }
            let label = profileMedicationCategoryLabel(categoryKey) ?? categoryKey.capitalized
            return (category: categoryKey, label: label, medications: medsInCategory)
        }
    }

    private func sortedEvents(_ events: [EventInfo]) -> [EventInfo] {
        events.sorted { ($0.date ?? "") > ($1.date ?? "") }
    }

    // MARK: - Copy & Export

    private func copyProfileToClipboard() {
        guard let data = viewModel.profileData else { return }
        var text = "# Health Profile\n\n"
        text += "> _This Health Profile was generated by AretaCare from information provided in the app and AI-assisted summaries. It is for informational purposes only and is not medical advice, diagnosis, or treatment. It may be incomplete or contain errors, so please verify with a healthcare provider before acting on it._\n\n"

        if let p = data.patient {
            text += "## Patient Information\n"
            if let v = p.fullName { text += "- **Name:** \(v)\n" }
            if let v = p.preferredName { text += "- **Preferred Name:** \(v)\n" }
            if let v = p.dateOfBirth { text += "- **Date of Birth:** \(v)\n" }
            if let v = p.age { text += "- **Age:** \(v)\n" }
            if let v = p.contactInfo { text += "- **Contact:** \(v)\n" }
            if let v = p.location { text += "- **Location:** \(v)\n" }
            text += "\n"
        }
        if let items = data.caregivers, !items.isEmpty {
            text += "## Caregivers\n"
            for item in items {
                text += "- **\(item.name ?? "Unknown")**"
                if let v = item.relationship { text += " (\(v))" }
                if let v = item.role { text += " - \(v)" }
                text += "\n"
                if let v = item.contactInfo { text += "  - Contact: \(v)\n" }
                if let v = item.location { text += "  - Location: \(v)\n" }
            }
            text += "\n"
        }
        if let items = data.providers, !items.isEmpty {
            text += "## Healthcare Providers\n"
            for item in items {
                text += "- **\(item.name ?? "Unknown")**"
                if let v = item.specialty { text += ", \(v)" }
                if let v = item.organization { text += " at \(v)" }
                text += "\n"
                if let v = item.phone { text += "  - Phone: \(v)\n" }
                if let v = item.email { text += "  - Email: \(v)\n" }
                if let v = item.address { text += "  - Address: \(v)\n" }
                if let v = item.contactInfo { text += "  - Contact: \(v)\n" }
            }
            text += "\n"
        }
        if let items = data.conditions, !items.isEmpty {
            text += "## Conditions & Diagnoses\n"
            for item in sortedConditions(items) {
                text += "- **\(item.clinicalTerm ?? "Unknown")**"
                if let v = item.status { text += " [\(v.uppercased())]" }
                if let v = item.description { text += ": \(v)" }
                text += "\n"
                if let v = item.diagnosisDate { text += "  - Diagnosed: \(v)\n" }
                if let v = item.details { text += "  - \(v)\n" }
            }
            text += "\n"
        }
        if let items = data.medications, !items.isEmpty {
            text += "## Medications\n\n"
            for group in medicationsGroupedByCategory(items) {
                text += "### \(group.label)\n"
                for item in group.medications {
                    text += "- **\(item.name ?? "Unknown")**"
                    if let v = item.dose { text += " \(v)" }
                    if let v = item.frequency { text += ", \(v)" }
                    if let v = item.status { text += " [\(v.uppercased())]" }
                    if let v = item.description, !v.isEmpty { text += " - \(v)" }
                    text += "\n"
                    if let v = item.prescriber { text += "  - Prescribed by: \(v)\n" }
                    if let v = item.startDate { text += "  - Started: \(v)\n" }
                    if let v = item.notes { text += "  - Note: \(v)\n" }
                }
                text += "\n"
            }
        }
        if let items = data.events, !items.isEmpty {
            text += "## Medical History & Events\n"
            for item in sortedEvents(items) {
                text += "- **\(profileEventTypeLabel(item.eventType ?? "Event"))**"
                if let v = item.date { text += " (\(v))" }
                if let v = item.description { text += ": \(v)" }
                text += "\n"
                if let v = item.details { text += "  - \(v)\n" }
            }
            text += "\n"
        }
        if let items = data.allergies, !items.isEmpty {
            text += "## Allergies & Sensitivities\n"
            for item in items {
                text += "- **\(item.substance ?? "Unknown")**"
                if let v = item.severity { text += " [\(v.uppercased())]" }
                if let v = item.reaction { text += ": \(v)" }
                text += "\n"
            }
            text += "\n"
        }
        if let prefs = data.preferences {
            text += "## Preferences & Guidelines\n\n"
            if let v = prefs.emergencyInstructions {
                text += "### Emergency Instructions\n"
                text += "\(v)\n\n"
            }
            if let items = prefs.communicationPreferences, !items.isEmpty {
                text += "### Communication Preferences\n"
                for item in items {
                    if let v = item.preference {
                        text += "- \(v)"
                        if let cat = item.category { text += " *(\(profileCommCategoryLabel(cat)))*" }
                        text += "\n"
                        if let d = item.details { text += "  - \(d)\n" }
                    }
                }
                text += "\n"
            }
            if let items = prefs.caregivingGuidelines, !items.isEmpty {
                text += "### Caregiving Guidelines\n"
                for item in items {
                    if let v = item.guideline {
                        text += "- \(v)"
                        if let imp = item.importance { text += " **[\(imp.uppercased())]**" }
                        if let cat = item.category { text += " *(\(profileGuideCategoryLabel(cat)))*" }
                        text += "\n"
                        if let d = item.details { text += "  - \(d)\n" }
                    }
                }
                text += "\n"
            }
            if let items = prefs.importantContext, !items.isEmpty {
                text += "### Important Context\n"
                for item in items {
                    if let v = item.context {
                        text += "- \(v)"
                        if let cat = item.category { text += " *(\(profileContextCategoryLabel(cat)))*" }
                        text += "\n"
                        if let d = item.details { text += "  - \(d)\n" }
                    }
                }
                text += "\n"
            }
            if let v = prefs.additionalNotes {
                text += "### Additional Notes\n"
                text += "\(v)\n"
            }
        }

        ClipboardHelper.copyFormatted(text)
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
}

// MARK: - Provider Row

private struct ProviderRowView: View {
    let provider: ProviderInfo

    var body: some View {
        let hasStructured = provider.phone != nil || provider.email != nil || provider.address != nil
        let parsed = hasStructured ? ParsedContact() : parseContactInfo(provider.contactInfo)
        let phone = provider.phone ?? parsed.phone
        let email = provider.email ?? parsed.email
        let address = provider.address ?? parsed.address

        return AccentCard(color: .teal) {
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
            if let phone = phone {
                if let url = URL(string: "tel:\(phone.filter { $0.isNumber || $0 == "+" })") {
                    Link(destination: url) {
                        Label(phone, systemImage: "phone.fill")
                            .font(.caption)
                            .foregroundStyle(.teal)
                    }
                } else {
                    Label(phone, systemImage: "phone.fill")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            if let email = email {
                if let url = URL(string: "mailto:\(email)") {
                    Link(destination: url) {
                        Label(email, systemImage: "envelope.fill")
                            .font(.caption)
                            .foregroundStyle(.teal)
                    }
                } else {
                    Label(email, systemImage: "envelope.fill")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            if let address = address {
                Label(address, systemImage: "mappin.and.ellipse")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            if hasStructured, let contact = provider.contactInfo, !contact.isEmpty {
                Text(contact)
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
        }
    }
}
