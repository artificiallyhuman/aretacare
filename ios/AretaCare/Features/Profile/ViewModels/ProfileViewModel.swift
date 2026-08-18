import Foundation
import Observation

@Observable @MainActor
final class ProfileViewModel {
    private(set) var profile: ProfileResponse?
    private(set) var pendingChanges: [PendingChange] = []
    private(set) var isLoading = false
    private(set) var isRegenerating = false
    private(set) var isUpdating = false
    private(set) var needsUpdate = false
    private(set) var newActivityCount = 0
    private(set) var newConversationCount = 0
    private(set) var newJournalCount = 0
    private(set) var errorMessage: String?

    var profileData: ProfileData? {
        profile?.profileData
    }

    var hasPendingChanges: Bool {
        !pendingChanges.isEmpty
    }

    // MARK: - Section Completeness

    /// One row per profile section, in display order. Single source of truth for
    /// the completeness percentage, the "what's missing" caption, the empty-section
    /// placeholders, and `isProfileEmpty`. These were three separate copies of the
    /// same eight checks and had drifted: the score counted a `patient` object with
    /// every field nil, and counted `preferences` only when a field inside it was
    /// populated while the card rendered on `!= nil`. A section is complete iff it
    /// has content the card can actually display, which is the same rule a reader
    /// applies looking at the screen.
    var sectionStatuses: [ProfileSectionStatus] {
        let data = profileData
        let patient = data?.patient
        let prefs = data?.preferences

        let hasPatient = [
            patient?.fullName, patient?.preferredName, patient?.dateOfBirth,
            patient?.age, patient?.contactInfo, patient?.location
        ].contains { !($0 ?? "").isEmpty }

        let hasPreferences = !(prefs?.emergencyInstructions ?? "").isEmpty
            || !(prefs?.communicationPreferences ?? []).isEmpty
            || !(prefs?.caregivingGuidelines ?? []).isEmpty
            || !(prefs?.importantContext ?? []).isEmpty
            || !(prefs?.additionalNotes ?? "").isEmpty

        return [
            ProfileSectionStatus(
                key: "patient", label: "Patient Information",
                emptyText: "No patient information yet", isComplete: hasPatient
            ),
            ProfileSectionStatus(
                key: "caregivers", label: "Caregivers",
                emptyText: "No caregivers added yet",
                isComplete: !(data?.caregivers ?? []).isEmpty
            ),
            ProfileSectionStatus(
                key: "providers", label: "Healthcare Providers",
                emptyText: "No providers added yet",
                isComplete: !(data?.providers ?? []).isEmpty
            ),
            ProfileSectionStatus(
                key: "conditions", label: "Conditions",
                emptyText: "No conditions recorded yet",
                isComplete: !(data?.conditions ?? []).isEmpty
            ),
            ProfileSectionStatus(
                key: "medications", label: "Medications",
                emptyText: "No medications recorded yet",
                isComplete: !(data?.medications ?? []).isEmpty
            ),
            ProfileSectionStatus(
                key: "allergies", label: "Allergies",
                emptyText: "No allergies recorded yet",
                isComplete: !(data?.allergies ?? []).isEmpty
            ),
            ProfileSectionStatus(
                key: "events", label: "Key Events",
                emptyText: "No events recorded yet",
                isComplete: !(data?.events ?? []).isEmpty
            ),
            ProfileSectionStatus(
                key: "preferences", label: "Preferences",
                emptyText: "No preferences set yet", isComplete: hasPreferences
            )
        ]
    }

    /// 0-100. Each of the eight sections is worth 12.5%.
    var completionPercentage: Double {
        let statuses = sectionStatuses
        let completed = statuses.filter(\.isComplete).count
        return Double(completed) / Double(statuses.count) * 100
    }

    /// Status for one section by `ProfileSectionStatus.key`. Keys are the same
    /// strings `ProfileEditSection` uses to open the edit sheet.
    func sectionStatus(_ key: String) -> ProfileSectionStatus {
        sectionStatuses.first { $0.key == key }
            ?? ProfileSectionStatus(key: key, label: key, emptyText: "Nothing here yet", isComplete: false)
    }

    var missingSectionLabels: [String] {
        sectionStatuses.filter { !$0.isComplete }.map(\.label)
    }

    var isProfileEmpty: Bool {
        profileData == nil || sectionStatuses.allSatisfy { !$0.isComplete }
    }

    // MARK: - Fetch Profile

    func fetchProfile(sessionId: String) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            let response: ProfileResponse = try await APIClient.shared.get(
                APIEndpoints.Profile.get(sessionId)
            )
            profile = response
            pendingChanges = response.pendingChanges ?? []
        } catch let error as APIError {
            if case .notFound = error {
                profile = nil
                pendingChanges = []
            } else {
                errorMessage = error.localizedDescription
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Check Profile

    func checkProfile(sessionId: String) async {
        do {
            let response: ProfileCheckResponse = try await APIClient.shared.get(
                APIEndpoints.Profile.check(sessionId)
            )
            needsUpdate = response.needsUpdate
            newActivityCount = response.newActivityCount
            newConversationCount = response.newConversationCount
            newJournalCount = response.newJournalCount
        } catch {
            // Non-fatal; just skip the badge
        }
    }

    // MARK: - Fetch Pending Changes

    func fetchPendingChanges(sessionId: String) async {
        do {
            let response: PendingChangesResponse = try await APIClient.shared.get(
                APIEndpoints.Profile.pendingChanges(sessionId)
            )
            pendingChanges = response.pendingChanges
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Update Section

    func updateSection(sessionId: String, section: String, data: AnyCodableValue) async {
        errorMessage = nil

        do {
            let request = ProfileSectionUpdateRequest(section: section, data: data)
            let response: ProfileResponse = try await APIClient.shared.patch(
                APIEndpoints.Profile.updateSection(sessionId),
                body: request
            )
            profile = response
            pendingChanges = response.pendingChanges ?? []
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Review Pending Changes

    func reviewPendingChanges(sessionId: String, decisions: [String: AnyCodableValue]) async {
        errorMessage = nil

        do {
            let request = PendingChangesReviewRequest(decisions: decisions)
            let response: ProfileResponse = try await APIClient.shared.post(
                APIEndpoints.Profile.reviewPendingChanges(sessionId),
                body: request
            )
            profile = response
            pendingChanges = response.pendingChanges ?? []
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Regenerate Profile

    func regenerateProfile(sessionId: String) async {
        isRegenerating = true
        errorMessage = nil
        defer { isRegenerating = false }

        do {
            let request = ProfileRegenerateRequest(confirm: true)
            let response: ProfileResponse = try await APIClient.shared.post(
                APIEndpoints.Profile.regenerate(sessionId),
                body: request
            )
            profile = response
            pendingChanges = response.pendingChanges ?? []
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Update Profile (Incremental)

    func updateProfile(sessionId: String) async {
        isUpdating = true
        errorMessage = nil
        defer { isUpdating = false }

        do {
            let response: ProfileResponse = try await APIClient.shared.post(
                APIEndpoints.Profile.update(sessionId)
            )
            profile = response
            pendingChanges = response.pendingChanges ?? []
            needsUpdate = false
            newActivityCount = 0
            newConversationCount = 0
            newJournalCount = 0
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Export Profile

    func exportProfile(sessionId: String, format: String) async throws -> URL {
        let path = APIEndpoints.Profile.export(sessionId)
        let queryItems = [URLQueryItem(name: "format", value: format)]
        let data = try await APIClient.shared.downloadData(path, queryItems: queryItems)

        let ext = format == "pdf" ? "pdf" : "json"
        let filename = "health_profile.\(ext)"
        let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(filename)

        // Protect at rest: exported health profile is unreadable while locked.
        try data.write(to: tempURL, options: [.atomic, .completeFileProtection])
        return tempURL
    }

    func setError(_ message: String) {
        errorMessage = message
    }

    func dismissError() {
        errorMessage = nil
    }
}
