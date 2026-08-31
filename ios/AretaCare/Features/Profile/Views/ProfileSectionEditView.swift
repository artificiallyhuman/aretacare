import SwiftUI

struct ProfileSectionEditView: View {
    let sessionId: String
    let section: ProfileEditSection
    let profileData: ProfileData
    let viewModel: ProfileViewModel
    var onSave: (() -> Void)?

    @Environment(\.dismiss) private var dismiss

    // Guards loadData() against onAppear re-firing (see body)
    @State private var didLoad = false
    @State private var showSaveError = false

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
        .onAppear {
            // onAppear re-fires when the view returns to the hierarchy (Picker
            // pushes, returning from background) — reloading then would silently
            // revert unsaved edits
            guard !didLoad else { return }
            didLoad = true
            loadData()
        }
        .alert("Couldn't Save", isPresented: $showSaveError) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(viewModel.errorMessage ?? "Something went wrong. Please try again.")
        }
    }

    /// Item ids come straight from the model output and nothing guarantees they
    /// are present or unique. ForEach uses them as identity, so a nil or
    /// duplicated id renders rows with the wrong bindings and makes Remove
    /// delete every item sharing the id — give each item a unique id before
    /// editing begins.
    private func ensureUniqueIds<T>(_ items: [T], id idPath: WritableKeyPath<T, String?>) -> [T] {
        var seen = Set<String>()
        return items.map { item in
            var item = item
            if let existing = item[keyPath: idPath], !existing.isEmpty, !seen.contains(existing) {
                seen.insert(existing)
            } else {
                let newId = UUID().uuidString
                item[keyPath: idPath] = newId
                seen.insert(newId)
            }
            return item
        }
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
        caregivers = ensureUniqueIds(profileData.caregivers ?? [], id: \.id)
        providers = ensureUniqueIds(profileData.providers ?? [], id: \.id)

        // Sort to match display order in ProfileView
        conditions = profileSortedConditions(ensureUniqueIds(profileData.conditions ?? [], id: \.id))

        let categoryOrder = MedicationCategories.orderIndex
        let medStatusOrder = ["active": 0, "paused": 1, "discontinued": 2]
        medications = ensureUniqueIds(profileData.medications ?? [], id: \.id).sorted { (a: MedicationInfo, b: MedicationInfo) in
            let catA = categoryOrder[(a.category ?? "other").lowercased()] ?? categoryOrder.count
            let catB = categoryOrder[(b.category ?? "other").lowercased()] ?? categoryOrder.count
            if catA != catB { return catA < catB }
            let statA = medStatusOrder[(a.status ?? "active").lowercased()] ?? 0
            let statB = medStatusOrder[(b.status ?? "active").lowercased()] ?? 0
            return statA < statB
        }

        allergies = ensureUniqueIds(profileData.allergies ?? [], id: \.id)
        events = ensureUniqueIds(profileData.events ?? [], id: \.id).sorted { (a: EventInfo, b: EventInfo) in
            (a.date ?? "") > (b.date ?? "")
        }
        if let prefs = profileData.preferences {
            emergencyInstructions = prefs.emergencyInstructions ?? ""
            additionalNotes = prefs.additionalNotes ?? ""
            communicationPreferences = ensureUniqueIds(prefs.communicationPreferences ?? [], id: \.id)
            caregivingGuidelines = ensureUniqueIds(prefs.caregivingGuidelines ?? [], id: \.id)
            importantContext = ensureUniqueIds(prefs.importantContext ?? [], id: \.id)
        }
    }

    // MARK: - Patient Form

    @ViewBuilder
    private var patientForm: some View {
        Section("Basic Information") {
            ProfileEditRow("Full Name", text: $fullName)
            ProfileEditRow("Preferred Name", text: $preferredName)
            ProfileDatePickerRow("Date of Birth", dateString: $dateOfBirth)
            ProfileEditRow("Age", text: $age)
        }
        Section("Contact") {
            ProfileEditRow("Contact Info", text: $contactInfo)
            ProfileEditRow("Location", text: $location)
        }
    }

    // MARK: - Caregivers Form

    @ViewBuilder
    private var caregiversForm: some View {
        Group {
            ForEach($caregivers) { $caregiver in
                Section {
                    ProfileEditRow("Name", text: Binding(get: { caregiver.name ?? "" }, set: { caregiver.name = $0.isEmpty ? nil : $0 }))
                    ProfileEditRow("Relationship", text: Binding(get: { caregiver.relationship ?? "" }, set: { caregiver.relationship = $0.isEmpty ? nil : $0 }))
                    ProfileEditRow("Role", text: Binding(get: { caregiver.role ?? "" }, set: { caregiver.role = $0.isEmpty ? nil : $0 }))
                    ProfileEditRow("Contact", text: Binding(get: { caregiver.contactInfo ?? "" }, set: { caregiver.contactInfo = $0.isEmpty ? nil : $0 }))
                    ProfileEditRow("Location", text: Binding(get: { caregiver.location ?? "" }, set: { caregiver.location = $0.isEmpty ? nil : $0 }))
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
                ProfileAddItemButton("Add Caregiver") {
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
                ProfileEditRow("Name", text: Binding(get: { provider.name ?? "" }, set: { provider.name = $0.isEmpty ? nil : $0 }))
                ProfileEditRow("Specialty", text: Binding(get: { provider.specialty ?? "" }, set: { provider.specialty = $0.isEmpty ? nil : $0 }))
                ProfileEditRow("Organization", text: Binding(get: { provider.organization ?? "" }, set: { provider.organization = $0.isEmpty ? nil : $0 }))
                ProfileEditRow("Phone", text: Binding(get: { provider.phone ?? "" }, set: { provider.phone = $0.isEmpty ? nil : $0 }))
                ProfileEditRow("Email", text: Binding(get: { provider.email ?? "" }, set: { provider.email = $0.isEmpty ? nil : $0 }))
                ProfileEditRow("Address", text: Binding(get: { provider.address ?? "" }, set: { provider.address = $0.isEmpty ? nil : $0 }))
                ProfileEditRow("Other contact details", text: Binding(get: { provider.contactInfo ?? "" }, set: { provider.contactInfo = $0.isEmpty ? nil : $0 }))
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
            ProfileAddItemButton("Add Provider") {
                providers.append(ProviderInfo(id: UUID().uuidString))
            }
        }
    }

    // MARK: - Conditions Form

    @ViewBuilder
    private var conditionsForm: some View {
        ForEach($conditions) { $condition in
            Section {
                ProfileEditRow("Clinical Term", text: Binding(get: { condition.clinicalTerm ?? "" }, set: { condition.clinicalTerm = $0.isEmpty ? nil : $0 }))
                ProfileEditRow("Description", text: Binding(get: { condition.description ?? "" }, set: { condition.description = $0.isEmpty ? nil : $0 }))
                Picker("Status", selection: Binding(get: { condition.status ?? "active" }, set: { condition.status = $0 })) {
                    Text("Active").tag("active")
                    Text("Monitoring").tag("monitoring")
                    Text("Resolved").tag("resolved")
                }
                ProfileDatePickerRow("Diagnosis Date", dateString: Binding(get: { condition.diagnosisDate ?? "" }, set: { condition.diagnosisDate = $0.isEmpty ? nil : $0 }))
                ProfileEditRow("Details", text: Binding(get: { condition.details ?? "" }, set: { condition.details = $0.isEmpty ? nil : $0 }))
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
            ProfileAddItemButton("Add Condition") {
                conditions.append(ConditionInfo(id: UUID().uuidString, status: "active"))
            }
        }
    }

    // MARK: - Medications Form

    @ViewBuilder
    private var medicationsForm: some View {
        ForEach($medications) { $med in
            Section {
                ProfileEditRow("Name", text: Binding(get: { med.name ?? "" }, set: { med.name = $0.isEmpty ? nil : $0 }))
                ProfileEditRow("Description", text: Binding(get: { med.description ?? "" }, set: { med.description = $0.isEmpty ? nil : $0 }))
                ProfileEditRow("Dose", text: Binding(get: { med.dose ?? "" }, set: { med.dose = $0.isEmpty ? nil : $0 }))
                ProfileEditRow("Frequency", text: Binding(get: { med.frequency ?? "" }, set: { med.frequency = $0.isEmpty ? nil : $0 }))
                Picker("Status", selection: Binding(get: { med.status ?? "active" }, set: { med.status = $0 })) {
                    Text("Active").tag("active")
                    Text("Paused").tag("paused")
                    Text("Discontinued").tag("discontinued")
                }
                Picker("Category", selection: Binding(get: { med.category ?? "other" }, set: { med.category = $0 })) {
                    ForEach(MedicationCategories.displayOrder, id: \.self) { category in
                        Text(MedicationCategories.label(category) ?? category).tag(category)
                    }
                }
                ProfileDatePickerRow("Start Date", dateString: Binding(get: { med.startDate ?? "" }, set: { med.startDate = $0.isEmpty ? nil : $0 }))
                ProfileEditRow("Prescriber", text: Binding(get: { med.prescriber ?? "" }, set: { med.prescriber = $0.isEmpty ? nil : $0 }))
                ProfileEditRow("Notes", text: Binding(get: { med.notes ?? "" }, set: { med.notes = $0.isEmpty ? nil : $0 }))
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
            ProfileAddItemButton("Add Medication") {
                medications.append(MedicationInfo(id: UUID().uuidString, status: "active", category: "other"))
            }
        }
    }

    // MARK: - Allergies Form

    @ViewBuilder
    private var allergiesForm: some View {
        ForEach($allergies) { $allergy in
            Section {
                ProfileEditRow("Substance", text: Binding(get: { allergy.substance ?? "" }, set: { allergy.substance = $0.isEmpty ? nil : $0 }))
                ProfileEditRow("Reaction", text: Binding(get: { allergy.reaction ?? "" }, set: { allergy.reaction = $0.isEmpty ? nil : $0 }))
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
            ProfileAddItemButton("Add Allergy") {
                allergies.append(AllergyInfo(id: UUID().uuidString, severity: "moderate"))
            }
        }
    }

    // MARK: - Events Form

    @ViewBuilder
    private var eventsForm: some View {
        ForEach($events) { $event in
            Section {
                Picker("Type", selection: Binding(get: { event.eventType ?? "other" }, set: { event.eventType = $0 })) {
                    Text("Hospitalization").tag("hospitalization")
                    Text("Surgery").tag("surgery")
                    Text("ER Visit").tag("er_visit")
                    Text("Major Diagnosis").tag("major_diagnosis")
                    Text("Procedure").tag("procedure")
                    Text("Other").tag("other")
                }
                ProfileEditRow("Description", text: Binding(get: { event.description ?? "" }, set: { event.description = $0.isEmpty ? nil : $0 }))
                ProfileDatePickerRow("Date", dateString: Binding(get: { event.date ?? "" }, set: { event.date = $0.isEmpty ? nil : $0 }))
                ProfileEditRow("Details", text: Binding(get: { event.details ?? "" }, set: { event.details = $0.isEmpty ? nil : $0 }))
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
            ProfileAddItemButton("Add Event") {
                events.append(EventInfo(id: UUID().uuidString, eventType: "other"))
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
            ProfileAddItemButton("Add Preference") {
                communicationPreferences.append(CommunicationPreference(id: UUID().uuidString, category: "medical_discussions"))
            }
        }
        ForEach($communicationPreferences) { $pref in
            Section {
                ProfileEditRow("Preference", text: Binding(get: { pref.preference ?? "" }, set: { pref.preference = $0.isEmpty ? nil : $0 }))
                Picker("Category", selection: Binding(get: { pref.category ?? "medical_discussions" }, set: { pref.category = $0 })) {
                    Text("Medical Discussions").tag("medical_discussions")
                    Text("Daily Care").tag("daily_care")
                    Text("Emotional Support").tag("emotional_support")
                    Text("Appointments").tag("appointments")
                    Text("Updates").tag("updates")
                }
                ProfileEditRow("Details", text: Binding(get: { pref.details ?? "" }, set: { pref.details = $0.isEmpty ? nil : $0 }))
            } header: {
                HStack {
                    Text(pref.preference ?? "Preference")
                    Spacer()
                    Button("Remove", role: .destructive) {
                        communicationPreferences.removeAll { $0.id == pref.id }
                    }
                    .font(.caption)
                }
            }
        }

        Section("Caregiving Guidelines") {
            ProfileAddItemButton("Add Guideline") {
                caregivingGuidelines.append(CaregivingGuideline(id: UUID().uuidString, category: "daily_routine", importance: "preferred"))
            }
        }
        ForEach($caregivingGuidelines) { $guide in
            Section {
                ProfileEditRow("Guideline", text: Binding(get: { guide.guideline ?? "" }, set: { guide.guideline = $0.isEmpty ? nil : $0 }))
                Picker("Category", selection: Binding(get: { guide.category ?? "daily_routine" }, set: { guide.category = $0 })) {
                    Text("Daily Routine").tag("daily_routine")
                    Text("Medical Care").tag("medical_care")
                    Text("Nutrition").tag("nutrition")
                    Text("Mobility").tag("mobility")
                    Text("Safety").tag("safety")
                    Text("Comfort").tag("comfort")
                    Text("Sleep").tag("sleep")
                }
                Picker("Importance", selection: Binding(get: { guide.importance ?? "preferred" }, set: { guide.importance = $0 })) {
                    Text("Critical").tag("critical")
                    Text("Important").tag("important")
                    Text("Preferred").tag("preferred")
                }
                ProfileEditRow("Details", text: Binding(get: { guide.details ?? "" }, set: { guide.details = $0.isEmpty ? nil : $0 }))
            } header: {
                HStack {
                    Text(guide.guideline ?? "Guideline")
                    Spacer()
                    Button("Remove", role: .destructive) {
                        caregivingGuidelines.removeAll { $0.id == guide.id }
                    }
                    .font(.caption)
                }
            }
        }

        Section("Important Context") {
            ProfileAddItemButton("Add Context") {
                importantContext.append(ImportantContext(id: UUID().uuidString, category: "personality"))
            }
        }
        ForEach($importantContext) { $ctx in
            Section {
                ProfileEditRow("Context", text: Binding(get: { ctx.context ?? "" }, set: { ctx.context = $0.isEmpty ? nil : $0 }))
                Picker("Category", selection: Binding(get: { ctx.category ?? "personality" }, set: { ctx.category = $0 })) {
                    Text("Personality").tag("personality")
                    Text("History").tag("history")
                    Text("Cultural").tag("cultural")
                    Text("Religious").tag("religious")
                    Text("Social").tag("social")
                    Text("Interests").tag("interests")
                    Text("Fears").tag("fears")
                }
                ProfileEditRow("Details", text: Binding(get: { ctx.details ?? "" }, set: { ctx.details = $0.isEmpty ? nil : $0 }))
            } header: {
                HStack {
                    Text(ctx.context ?? "Context")
                    Spacer()
                    Button("Remove", role: .destructive) {
                        importantContext.removeAll { $0.id == ctx.id }
                    }
                    .font(.caption)
                }
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
            var saved = false
            switch sectionName {
            case "patient":
                // Start from the stored object so server fields this build doesn't
                // model (`additionalFields`) survive the save.
                var patient = profileData.patient ?? PatientInfo()
                patient.fullName = fullName.isEmpty ? nil : fullName
                patient.preferredName = preferredName.isEmpty ? nil : preferredName
                patient.dateOfBirth = dateOfBirth.isEmpty ? nil : dateOfBirth
                patient.age = age.isEmpty ? nil : age
                patient.contactInfo = contactInfo.isEmpty ? nil : contactInfo
                patient.location = location.isEmpty ? nil : location
                if let payload = Self.sectionPayload(patient) {
                    saved = await viewModel.updateSection(sessionId: sessionId, section: sectionName, data: payload)
                }
            case "caregivers":
                saved = await saveCodableList(caregivers, section: sectionName)
            case "providers":
                saved = await saveCodableList(providers, section: sectionName)
            case "conditions":
                saved = await saveCodableList(conditions, section: sectionName)
            case "medications":
                saved = await saveCodableList(medications, section: sectionName)
            case "allergies":
                saved = await saveCodableList(allergies, section: sectionName)
            case "events":
                saved = await saveCodableList(events, section: sectionName)
            case "preferences":
                var prefs = profileData.preferences ?? PreferencesInfo()
                prefs.communicationPreferences = communicationPreferences.isEmpty ? nil : communicationPreferences
                prefs.caregivingGuidelines = caregivingGuidelines.isEmpty ? nil : caregivingGuidelines
                prefs.importantContext = importantContext.isEmpty ? nil : importantContext
                prefs.emergencyInstructions = emergencyInstructions.isEmpty ? nil : emergencyInstructions
                prefs.additionalNotes = additionalNotes.isEmpty ? nil : additionalNotes
                if let payload = Self.sectionPayload(prefs) {
                    saved = await viewModel.updateSection(sessionId: sessionId, section: sectionName, data: payload)
                }
            default:
                break
            }
            // A failed PATCH keeps the sheet (and the user's edits) on screen —
            // dismissing with the "Saved" toast on failure silently lost them
            guard saved else {
                showSaveError = true
                return
            }
            onSave?()
            dismiss()
        }
    }

    private func saveCodableList<T: Encodable>(_ items: [T], section: String) async -> Bool {
        guard let payload = Self.sectionPayload(items) else { return false }
        return await viewModel.updateSection(sessionId: sessionId, section: section, data: payload)
    }

    /// Encodes a section with snake_case keys and re-reads it as `AnyCodableValue`
    /// for the request body. Going through JSON text, rather than
    /// `JSONSerialization`'s `Any` bridging, keeps every key the structs carry in
    /// `additionalFields` and keeps value types intact (a `true` stays a Bool
    /// instead of becoming `1`).
    static func sectionPayload<T: Encodable>(_ value: T) -> AnyCodableValue? {
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        guard let json = try? encoder.encode(value) else { return nil }
        return try? JSONDecoder().decode(AnyCodableValue.self, from: json)
    }
}
