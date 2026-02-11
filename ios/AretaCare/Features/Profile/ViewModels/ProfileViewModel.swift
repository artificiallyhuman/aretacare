import Foundation
import Observation

@Observable
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

    var isProfileEmpty: Bool {
        guard let data = profileData else { return true }
        return data.patient == nil
            && (data.caregivers ?? []).isEmpty
            && (data.providers ?? []).isEmpty
            && (data.conditions ?? []).isEmpty
            && (data.medications ?? []).isEmpty
            && (data.allergies ?? []).isEmpty
            && (data.events ?? []).isEmpty
            && data.preferences == nil
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
            let _: ProfileResponse = try await APIClient.shared.patch(
                APIEndpoints.Profile.updateSection(sessionId),
                body: request
            )
            await fetchProfile(sessionId: sessionId)
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
            let _: ProfileResponse = try await APIClient.shared.post(
                APIEndpoints.Profile.regenerate(sessionId),
                body: request
            )
            await fetchProfile(sessionId: sessionId)
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

    func exportProfileURL(sessionId: String, format: String) -> URL? {
        let path = APIEndpoints.Profile.export(sessionId, format: format)
        return URL(string: APIClient.shared.baseURL.absoluteString + path)
    }

    func dismissError() {
        errorMessage = nil
    }
}
