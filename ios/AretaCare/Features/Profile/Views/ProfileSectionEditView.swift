import SwiftUI

struct ProfileSectionEditView: View {
    let sessionId: String
    let section: ProfileEditSection
    let profileData: ProfileData
    let viewModel: ProfileViewModel
    var onSave: (() -> Void)?

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
                ProfileEditRow("Contact Info", text: Binding(get: { provider.contactInfo ?? "" }, set: { provider.contactInfo = $0.isEmpty ? nil : $0 }))
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
                    ProfileEditRow("Preference", text: Binding(get: { pref.preference ?? "" }, set: { pref.preference = $0.isEmpty ? nil : $0 }))
                    ProfileEditRow("Category", text: Binding(get: { pref.category ?? "" }, set: { pref.category = $0.isEmpty ? nil : $0 }))
                    ProfileEditRow("Details", text: Binding(get: { pref.details ?? "" }, set: { pref.details = $0.isEmpty ? nil : $0 }))
                }
            }
            ProfileAddItemButton("Add Preference") {
                communicationPreferences.append(CommunicationPreference(id: UUID().uuidString))
            }
        }

        Section("Caregiving Guidelines") {
            ProfileAddItemButton("Add Guideline") {
                caregivingGuidelines.append(CaregivingGuideline(id: UUID().uuidString, importance: "preferred"))
            }
        }
        ForEach($caregivingGuidelines) { $guide in
            Section {
                ProfileEditRow("Guideline", text: Binding(get: { guide.guideline ?? "" }, set: { guide.guideline = $0.isEmpty ? nil : $0 }))
                ProfileEditRow("Category", text: Binding(get: { guide.category ?? "" }, set: { guide.category = $0.isEmpty ? nil : $0 }))
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
                    ProfileEditRow("Context", text: Binding(get: { ctx.context ?? "" }, set: { ctx.context = $0.isEmpty ? nil : $0 }))
                    ProfileEditRow("Category", text: Binding(get: { ctx.category ?? "" }, set: { ctx.category = $0.isEmpty ? nil : $0 }))
                    ProfileEditRow("Details", text: Binding(get: { ctx.details ?? "" }, set: { ctx.details = $0.isEmpty ? nil : $0 }))
                }
            }
            ProfileAddItemButton("Add Context") {
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
            onSave?()
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
