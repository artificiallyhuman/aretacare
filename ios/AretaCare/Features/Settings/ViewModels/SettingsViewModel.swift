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

    func updateEmail(newEmail: String, password: String) async -> Bool {
        errorMessage = nil
        successMessage = nil

        do {
            let request = UpdateEmailRequest(email: newEmail, currentPassword: password)
            let _: EmptyResponse = try await APIClient.shared.put(
                APIEndpoints.Auth.email,
                body: request
            )
            try await AuthManager.shared.fetchCurrentUser()
            successMessage = "Verification email sent to \(newEmail)."
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func updatePassword(currentPassword: String, newPassword: String) async -> Bool {
        errorMessage = nil
        successMessage = nil

        do {
            let request = UpdatePasswordRequest(currentPassword: currentPassword, newPassword: newPassword)
            let _: EmptyResponse = try await APIClient.shared.put(
                APIEndpoints.Auth.password,
                body: request
            )
            successMessage = "Password updated successfully."
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func deleteAccount(password: String) async -> Bool {
        errorMessage = nil

        do {
            let request = DeleteAccountRequest(password: password)
            try await APIClient.shared.delete(APIEndpoints.Auth.account, body: request)
            await AuthManager.shared.logout()
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
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
