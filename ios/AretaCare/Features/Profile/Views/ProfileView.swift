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
        .sheet(isPresented: $showingShareSheet) {
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
                    Text("This summary is generated from your conversations and journal entries. Review and edit before sharing with healthcare providers.")
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
        .refreshable {
            await viewModel.fetchProfile(sessionId: sessionId)
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

    // MARK: - Sorting Helpers

    private func sortedConditions(_ conditions: [ConditionInfo]) -> [ConditionInfo] {
        let statusOrder = ["active": 0, "monitoring": 1, "resolved": 2]
        return conditions.sorted { a, b in
            let statusA = statusOrder[(a.status ?? "").lowercased()] ?? 1
            let statusB = statusOrder[(b.status ?? "").lowercased()] ?? 1
            if statusA != statusB { return statusA < statusB }
            return (a.diagnosisDate ?? "") > (b.diagnosisDate ?? "")
        }
    }

    private func sortedMedications(_ medications: [MedicationInfo]) -> [MedicationInfo] {
        let categoryOrder: [String: Int] = [
            "multiple": 0, "pain_management": 1, "cardiovascular": 2, "diabetes": 3,
            "mental_health": 4, "antibiotics": 5, "respiratory": 6, "gastrointestinal": 7,
            "neurological": 8, "endocrine": 9, "oncology": 10, "immunosuppressant": 11,
            "vitamins_supplements": 12, "other": 13
        ]
        let statusOrder = ["active": 0, "paused": 1, "discontinued": 2]
        return medications.sorted { a, b in
            let catA = categoryOrder[(a.category ?? "other").lowercased()] ?? 13
            let catB = categoryOrder[(b.category ?? "other").lowercased()] ?? 13
            if catA != catB { return catA < catB }
            let statA = statusOrder[(a.status ?? "active").lowercased()] ?? 0
            let statB = statusOrder[(b.status ?? "active").lowercased()] ?? 0
            return statA < statB
        }
    }

    private let medicationCategoryOrder: [String] = [
        "multiple", "pain_management", "cardiovascular", "diabetes",
        "mental_health", "antibiotics", "respiratory", "gastrointestinal",
        "neurological", "endocrine", "oncology", "immunosuppressant",
        "vitamins_supplements", "other"
    ]

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
            for item in sortedConditions(items) {
                lines.append("  \(item.clinicalTerm ?? item.description ?? "Unknown") (\(item.status ?? "unknown"))")
                if let v = item.diagnosisDate { lines.append("    Diagnosed: \(v)") }
                if let v = item.details { lines.append("    \(v)") }
            }
            lines.append("")
        }
        if let items = data.medications, !items.isEmpty {
            lines.append("Medications")
            for item in sortedMedications(items) {
                var desc = item.name ?? "Unknown"
                if let dose = item.dose { desc += " - \(dose)" }
                if let freq = item.frequency { desc += " (\(freq))" }
                if let status = item.status { desc += " [\(status.uppercased())]" }
                lines.append("  \(desc)")
                if let v = item.description, !v.isEmpty { lines.append("    \(v)") }
                if let v = item.category, let label = profileMedicationCategoryLabel(v) { lines.append("    Category: \(label)") }
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
            for item in sortedEvents(items) {
                var desc = item.description ?? item.eventType ?? "Event"
                if let type = item.eventType { desc += " [\(profileEventTypeLabel(type))]" }
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
                    let catLabel = item.category.map { profileCommCategoryLabel($0) } ?? "Pref"
                    if let v = item.preference { lines.append("  \(catLabel): \(v)") }
                }
            }
            if let items = prefs.caregivingGuidelines {
                for item in items {
                    let catLabel = item.category.map { profileGuideCategoryLabel($0) } ?? "Guideline"
                    if let v = item.guideline { lines.append("  \(catLabel): \(v)") }
                }
            }
            if let items = prefs.importantContext {
                for item in items {
                    let catLabel = item.category.map { profileContextCategoryLabel($0) } ?? "Context"
                    if let v = item.context { lines.append("  \(catLabel): \(v)") }
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
}
