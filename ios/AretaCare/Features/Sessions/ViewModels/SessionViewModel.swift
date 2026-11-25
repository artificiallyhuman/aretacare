import Foundation
import Observation

extension Notification.Name {
    /// A care session was chosen on one screen (the phone or CarPlay); the other follows.
    /// `object` is the `SessionViewModel` that chose it; `userInfo[SessionViewModel.sessionIdKey]`
    /// is the care session's id.
    static let activeSessionDidChange = Notification.Name("activeSessionDidChange")
}

@Observable @MainActor
final class SessionViewModel {
    nonisolated static let sessionIdKey = "sessionId"

    /// The care session most recently chosen in this process, on either screen. The phone
    /// window can open after a choice made in CarPlay, and its first restore would otherwise
    /// use `currentUser.lastActiveSessionId`, which is read once at sign-in.
    private static var chosenInProcess: String?

    /// Sign-out: the next account starts from its own server value.
    static func forgetChoice() {
        chosenInProcess = nil
    }

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

            // A recording kept after a failed upload can only go to a care session the
            // user still has; anything else (or another user's) is dropped.
            if let userId = AuthManager.shared.currentUser?.id {
                PendingRecordingStore.shared.prune(userId: userId, validSessionIds: Set(fetched.map(\.id)))
            }

            // If no current session selected, restore using priority:
            // 1. A choice made since this process started (on the phone or in CarPlay)
            // 2. Backend preference (synced across devices)
            // 3. Local UserDefaults cache (offline fallback)
            // 4. Most recent session by activity
            if currentSession == nil {
                let chosenId = Self.chosenInProcess
                let backendId = AuthManager.shared.currentUser?.lastActiveSessionId
                let localId = UserDefaults.standard.string(forKey: "lastSessionId")

                let activeSessions = fetched.filter(\.isActive)

                if let chosenId, let restored = activeSessions.first(where: { $0.id == chosenId }) {
                    currentSession = restored
                } else if let backendId, let restored = activeSessions.first(where: { $0.id == backendId }) {
                    currentSession = restored
                } else if let localId, let restored = activeSessions.first(where: { $0.id == localId }) {
                    currentSession = restored
                } else {
                    currentSession = activeSessions.max(by: { $0.lastActivity < $1.lastActivity })
                }

                // Final fallback: if no active sessions, use any session
                if currentSession == nil {
                    currentSession = fetched.max(by: { $0.lastActivity < $1.lastActivity })
                }
            }
            // Refresh current session data from the fetched list
            if let current = currentSession {
                currentSession = fetched.first { $0.id == current.id } ?? fetched.first
            }

            // Auto-assign colors if 2+ sessions and any lack a color
            if fetched.count >= 2 && fetched.contains(where: { $0.colorKey == nil }) {
                await autoAssignColors()
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Revoked Access

    /// Recovers after the server reports the user no longer has access to a care
    /// session. Re-fetches the list (the revoked session is gone server-side),
    /// moves off it if it was current, and surfaces a non-fatal banner.
    func handleSessionAccessRevoked() async {
        let previousId = currentSession?.id

        do {
            let fetched: [SessionResponse] = try await APIClient.shared.get(APIEndpoints.Sessions.base)
            sessions = fetched

            if let previousId, !fetched.contains(where: { $0.id == previousId }) {
                let candidates = fetched.filter(\.isActive).isEmpty ? fetched : fetched.filter(\.isActive)
                currentSession = candidates.max(by: { $0.lastActivity < $1.lastActivity }) ?? candidates.first
                errorMessage = "You no longer have access to that care session."
            } else if let current = currentSession {
                currentSession = fetched.first { $0.id == current.id } ?? currentSession
            }
        } catch {
            errorMessage = "You no longer have access to that care session."
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

            // Auto-assign colors when going to 2+ sessions
            if sessions.count >= 2 {
                await autoAssignColors()
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Switch Session

    func switchSession(to session: SessionResponse) {
        currentSession = session
        Self.chosenInProcess = session.id
        // The other screen (phone or CarPlay) follows.
        NotificationCenter.default.post(name: .activeSessionDidChange, object: self,
                                        userInfo: [Self.sessionIdKey: session.id])

        // Notify backend to update last_active_session_id (fire-and-forget, matches web behavior)
        Task {
            let _: SessionResponse? = try? await APIClient.shared.get(APIEndpoints.Sessions.get(session.id))
        }
    }

    /// Takes up a care session chosen on the other screen. No server call or notification:
    /// the screen that chose it made both. Returns false when it's already current or not in
    /// this list (the caller can fetch and try again).
    @discardableResult
    func follow(sessionId: String) -> Bool {
        guard currentSession?.id != sessionId,
              let session = sessions.first(where: { $0.id == sessionId }) else { return false }
        currentSession = session
        return true
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
                        errorMessage = "Unable to create a new session. Please try again."
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

    private func autoAssignColors() async {
        do {
            let _: AutoAssignColorsResponse = try await APIClient.shared.post(
                APIEndpoints.Sessions.autoAssignColors
            )
            // Re-fetch sessions to pick up the assigned colors
            let fetched: [SessionResponse] = try await APIClient.shared.get(APIEndpoints.Sessions.base)
            sessions = fetched
            if let current = currentSession {
                currentSession = fetched.first { $0.id == current.id } ?? currentSession
            }
        } catch {
            // Non-fatal — colors are cosmetic
        }
    }

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
