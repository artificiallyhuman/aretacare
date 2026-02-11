import Foundation
import Observation

@Observable
final class SessionViewModel {
    private(set) var sessions: [SessionResponse] = []
    private(set) var currentSession: SessionResponse? {
        didSet {
            // Persist last session ID for restoration on relaunch
            if let id = currentSession?.id {
                UserDefaults.standard.set(id, forKey: "lastSessionId")
            }
        }
    }
    private(set) var isLoading = false
    private(set) var errorMessage: String?

    var ownedSessionCount: Int {
        sessions.filter(\.isOwner).count
    }

    var canCreateSession: Bool {
        ownedSessionCount < AppConstants.maxOwnedSessions
    }

    // MARK: - Fetch Sessions

    func fetchSessions() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            let fetched: [SessionResponse] = try await APIClient.shared.get(APIEndpoints.Sessions.base)
            sessions = fetched

            // If no current session selected, try to restore last session, else pick first active
            if currentSession == nil {
                let lastId = UserDefaults.standard.string(forKey: "lastSessionId")
                if let lastId, let restored = fetched.first(where: { $0.id == lastId && $0.isActive }) {
                    currentSession = restored
                } else if let first = fetched.first(where: \.isActive) {
                    currentSession = first
                }
            }
            // Refresh current session data from the fetched list
            if let current = currentSession {
                currentSession = fetched.first { $0.id == current.id } ?? fetched.first
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Create Session

    func createSession(name: String?) async {
        guard canCreateSession else {
            errorMessage = "You can have at most \(AppConstants.maxOwnedSessions) sessions."
            return
        }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            let request = SessionCreateRequest(name: name)
            let newSession: SessionResponse = try await APIClient.shared.post(
                APIEndpoints.Sessions.base,
                body: request
            )
            sessions.append(newSession)
            currentSession = newSession
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Switch Session

    func switchSession(to session: SessionResponse) {
        currentSession = session
    }

    // MARK: - Delete Session

    func deleteSession(id: String) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            try await APIClient.shared.delete(APIEndpoints.Sessions.delete(id))
            sessions.removeAll { $0.id == id }

            if currentSession?.id == id {
                if sessions.isEmpty {
                    // Auto-create a new session (matching web behavior)
                    do {
                        let request = SessionCreateRequest(name: "Session 1")
                        let newSession: SessionResponse = try await APIClient.shared.post(
                            APIEndpoints.Sessions.base,
                            body: request
                        )
                        sessions = [newSession]
                        currentSession = newSession
                    } catch {
                        currentSession = nil
                    }
                } else {
                    // Prefer owned sessions, then most recent by activity
                    let owned = sessions.filter(\.isOwner)
                    let candidates = owned.isEmpty ? sessions : owned
                    currentSession = candidates.max(by: {
                        $0.lastActivity < $1.lastActivity
                    }) ?? candidates.first
                }
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Rename Session

    func renameSession(id: String, name: String) async {
        errorMessage = nil

        do {
            let request = SessionRenameRequest(name: name)
            let updated: SessionResponse = try await APIClient.shared.patch(
                APIEndpoints.Sessions.rename(id),
                body: request
            )
            if let index = sessions.firstIndex(where: { $0.id == id }) {
                sessions[index] = updated
            }
            if currentSession?.id == id {
                currentSession = updated
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Session Color

    func setSessionColor(sessionId: String, colorKey: String) async {
        errorMessage = nil

        do {
            let body = SessionColorUpdate(colorKey: colorKey, swapWithSessionId: nil)
            let _: EmptyResponse = try await APIClient.shared.put(
                APIEndpoints.Sessions.setColor(sessionId),
                body: body
            )
            // Refresh sessions to get updated colors
            await fetchSessions()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Dismiss Error

    func dismissError() {
        errorMessage = nil
    }
}
