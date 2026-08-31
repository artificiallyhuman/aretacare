import Foundation
import Observation

@Observable @MainActor
final class SettingsViewModel {
    private(set) var sessions: [SessionResponse] = []
    private(set) var sessionStatistics: [String: SessionStatistics] = [:]
    private(set) var devicesCount: Int = 0
    private(set) var isLoading = false
    private(set) var errorMessage: String?
    private(set) var successMessage: String?

    /// Set when the server refused a sensitive account change without a fresh MFA
    /// proof. The presenting view opens `MFAStepUpSheet` and replays the call with
    /// the resulting action token. Reactive rather than proactive: no second source
    /// of truth for "is MFA on", and it self-heals an expired or already-used token.
    private(set) var mfaStepUpRequired = false

    /// Set when the server ended every session as part of the change the user just
    /// made (`logout: true`). The view acknowledges it before signing out so the
    /// transition isn't a silent bounce to the login screen.
    private(set) var requiresReauthentication = false

    var user: UserResponse? {
        AuthManager.shared.currentUser
    }

    // MARK: - Fetch Data

    func fetchSessions() async {
        do {
            let fetched: [SessionResponse] = try await APIClient.shared.get(APIEndpoints.Sessions.base)
            sessions = fetched
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func fetchStatistics(sessionId: String) async {
        do {
            let stats: SessionStatistics = try await APIClient.shared.get(
                APIEndpoints.Sessions.statistics(sessionId)
            )
            sessionStatistics[sessionId] = stats
        } catch {
            // Non-fatal
            #if DEBUG
            print("[Settings] Fetch statistics failed for \(sessionId): \(error)")
            #endif
        }
    }

    func fetchDevicesCount() async {
        do {
            let response: DevicesCountResponse = try await APIClient.shared.get(APIEndpoints.Auth.devicesCount)
            devicesCount = response.count
        } catch {
            // Non-fatal
            #if DEBUG
            print("[Settings] Fetch devices count failed: \(error)")
            #endif
        }
    }

    // MARK: - Email Preferences

    /// nil until loaded; the toggle stays disabled so a tap can't race the fetch.
    /// Opting out here is identical to clicking an emailed unsubscribe link — it
    /// affects only admin product-update emails, never transactional email.
    private(set) var productUpdateEmails: Bool?

    func fetchEmailPreferences() async {
        do {
            let response: EmailPreferencesResponse = try await APIClient.shared.get(
                APIEndpoints.EmailPreferences.preferences
            )
            productUpdateEmails = response.productUpdates
        } catch {
            // Non-fatal — the toggle stays disabled
            #if DEBUG
            print("[Settings] Fetch email preferences failed: \(error)")
            #endif
        }
    }

    func setProductUpdateEmails(_ enabled: Bool) async {
        errorMessage = nil

        let previous = productUpdateEmails
        productUpdateEmails = enabled  // optimistic; reverted on failure

        do {
            let response: EmailPreferencesResponse = try await APIClient.shared.put(
                APIEndpoints.EmailPreferences.preferences,
                body: UpdateEmailPreferencesRequest(productUpdates: enabled)
            )
            productUpdateEmails = response.productUpdates
        } catch {
            productUpdateEmails = previous
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Account Operations

    func updateName(name: String, password: String) async -> Bool {
        errorMessage = nil
        successMessage = nil

        do {
            let request = UpdateNameRequest(name: name, currentPassword: password)
            let _: UserResponse = try await APIClient.shared.put(
                APIEndpoints.Auth.name,
                body: request
            )
            try await AuthManager.shared.fetchCurrentUser()
            successMessage = "Name updated successfully."
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func updateEmail(newEmail: String, password: String, actionToken: String? = nil) async -> Bool {
        errorMessage = nil
        successMessage = nil
        mfaStepUpRequired = false

        do {
            let request = UpdateEmailRequest(email: newEmail, currentPassword: password)
            let response: SensitiveChangeResponse = try await APIClient.shared.put(
                APIEndpoints.Auth.email,
                body: request,
                headers: Self.actionTokenHeader(actionToken)
            )
            requiresReauthentication = response.requiresLogout
            // Refreshing the user surfaces the pending-email row in Settings. Skipped
            // when the server has already ended the session: the view is about to sign
            // out, and a throw here would report a successful change as a failure.
            if !requiresReauthentication {
                try await AuthManager.shared.fetchCurrentUser()
            }
            successMessage = "Verification email sent to \(newEmail)."
            return true
        } catch {
            handleSensitiveActionFailure(error)
            return false
        }
    }

    func updatePassword(currentPassword: String, newPassword: String, actionToken: String? = nil) async -> Bool {
        errorMessage = nil
        successMessage = nil
        mfaStepUpRequired = false

        do {
            let request = UpdatePasswordRequest(currentPassword: currentPassword, newPassword: newPassword)
            let response: SensitiveChangeResponse = try await APIClient.shared.put(
                APIEndpoints.Auth.password,
                body: request,
                headers: Self.actionTokenHeader(actionToken)
            )
            requiresReauthentication = response.requiresLogout
            successMessage = "Password updated successfully."
            return true
        } catch {
            handleSensitiveActionFailure(error)
            return false
        }
    }

    func deleteAccount(password: String, actionToken: String? = nil) async -> Bool {
        errorMessage = nil
        mfaStepUpRequired = false

        do {
            let request = DeleteAccountRequest(password: password)
            try await APIClient.shared.delete(
                APIEndpoints.Auth.account,
                body: request,
                headers: Self.actionTokenHeader(actionToken)
            )
            await AuthManager.shared.logout()
            return true
        } catch {
            handleSensitiveActionFailure(error)
            return false
        }
    }

    /// Ends the session the server already invalidated. Called by the view once the
    /// user has read the confirmation.
    func completeReauthentication() async {
        requiresReauthentication = false
        await AuthManager.shared.logout()
    }

    func clearMFAStepUpRequirement() {
        mfaStepUpRequired = false
    }

    private static func actionTokenHeader(_ token: String?) -> [String: String]? {
        guard let token else { return nil }
        return [AppConstants.mfaActionTokenHeader: token]
    }

    /// Routes a failed sensitive action: a step-up demand flags the view to open the
    /// verification sheet, anything else (a wrong password, a taken email) goes to
    /// the error message so the user sees what to fix. Mirrors
    /// `MFAViewModel.handleSensitiveActionFailure`.
    private func handleSensitiveActionFailure(_ error: Error) {
        if case APIError.forbidden(let code) = error,
           code == "MFA_REQUIRED" || code == "MFA_INVALID" {
            mfaStepUpRequired = true
            return
        }
        errorMessage = error.localizedDescription
    }

    func logoutEverywhere() async {
        errorMessage = nil

        do {
            try await APIClient.shared.post(APIEndpoints.Auth.logoutEverywhere)
            await AuthManager.shared.logout()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Session Operations

    func renameSession(id: String, name: String) async {
        errorMessage = nil

        do {
            let request = SessionRenameRequest(name: name)
            let _: SessionResponse = try await APIClient.shared.patch(
                APIEndpoints.Sessions.rename(id),
                body: request
            )
            await fetchSessions()
            NotificationCenter.default.post(name: .sessionsDidChange, object: nil)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func deleteSession(id: String) async -> Bool {
        errorMessage = nil

        do {
            try await APIClient.shared.delete(APIEndpoints.Sessions.delete(id))
            sessions.removeAll { $0.id == id }
            NotificationCenter.default.post(name: .sessionsDidChange, object: nil)
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    /// Remove the current user's access to a care session they collaborate on.
    ///
    /// Mirrors `deleteSession` rather than reusing `CollaborationViewModel.leaveSession`,
    /// which is a bare POST: it neither prunes the local `sessions` array nor posts
    /// `.sessionsDidChange`, so the Settings list would keep showing a session the user
    /// just left.
    func leaveSession(id: String) async -> Bool {
        errorMessage = nil

        do {
            try await APIClient.shared.post(APIEndpoints.Sessions.leave(id))
            sessions.removeAll { $0.id == id }
            NotificationCenter.default.post(name: .sessionsDidChange, object: nil)
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func setSessionColor(sessionId: String, colorKey: String, swapWithSessionId: String? = nil) async {
        errorMessage = nil

        do {
            let body = SessionColorUpdate(colorKey: colorKey, swapWithSessionId: swapWithSessionId)
            let _: EmptyResponse = try await APIClient.shared.put(
                APIEndpoints.Sessions.setColor(sessionId),
                body: body
            )
            await fetchSessions()
            NotificationCenter.default.post(name: .sessionsDidChange, object: nil)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Helpers

    func dismissError() {
        errorMessage = nil
    }

    func dismissSuccess() {
        successMessage = nil
    }

    /// Find a session that already uses a given color key (excluding a specific session).
    func sessionUsingColor(_ colorKey: String, excluding sessionId: String) -> SessionResponse? {
        sessions.first { $0.colorKey == colorKey && $0.id != sessionId }
    }
}
