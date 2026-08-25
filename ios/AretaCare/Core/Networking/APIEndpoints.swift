import Foundation

enum APIEndpoints {
    // MARK: - Auth
    enum Auth {
        static let register = "/auth/register"
        static let login = "/auth/login"
        static let me = "/auth/me"
        static let refresh = "/auth/refresh"
        static let logout = "/auth/logout"
        static let logoutEverywhere = "/auth/logout-everywhere"
        static let name = "/auth/name"
        static let email = "/auth/email"
        static let emailVerify = "/auth/email/verify"
        static let emailPending = "/auth/email/pending"
        static let verifyEmail = "/auth/verify-email"
        static let resendVerification = "/auth/resend-verification"
        static let password = "/auth/password"
        static let passwordResetRequest = "/auth/password-reset/request"
        static let passwordResetReset = "/auth/password-reset/reset"
        static let account = "/auth/account"
        static let devicesCount = "/auth/devices/count"
        static let sessionValid = "/auth/session-valid"
        static let loginMFAVerify = "/auth/login/mfa-verify"
        static let loginMFAPasskeyOptions = "/auth/login/mfa-passkey-options"
        static let consentAIDataSharing = "/auth/consent/ai-data-sharing"
    }

    // MARK: - Sessions
    enum Sessions {
        static let base = "/sessions/"
        static func get(_ id: String) -> String { "/sessions/\(id)" }
        static func rename(_ id: String) -> String { "/sessions/\(id)/rename" }
        static func statistics(_ id: String) -> String { "/sessions/\(id)/statistics" }
        static func delete(_ id: String) -> String { "/sessions/\(id)" }
        static func cleanup(_ id: String) -> String { "/sessions/\(id)/cleanup" }
        static func checkUser(_ id: String) -> String { "/sessions/\(id)/check-user" }
        static func share(_ id: String) -> String { "/sessions/\(id)/share" }
        static func revokeAccess(_ id: String, userId: String) -> String { "/sessions/\(id)/collaborators/\(userId)" }
        static func leave(_ id: String) -> String { "/sessions/\(id)/leave" }
        static func transferOwnership(_ id: String) -> String { "/sessions/\(id)/transfer-ownership" }
        static func sendInvitation(_ id: String) -> String { "/sessions/\(id)/send-invitation" }
        static func pendingInvitations(_ id: String) -> String { "/sessions/\(id)/pending-invitations" }
        static func cancelInvitation(_ id: String, invitationId: String) -> String { "/sessions/\(id)/pending-invitations/\(invitationId)" }
        static func setColor(_ id: String) -> String { "/sessions/\(id)/color" }
        static let autoAssignColors = "/sessions/auto-assign-colors"
    }

    // MARK: - Conversation
    enum Conversation {
        static let sendMessage = "/conversation/message"
        static func history(_ sessionId: String) -> String { "/conversation/\(sessionId)/history" }
        static let transcribe = "/conversation/transcribe"
        static func editMessage(_ messageId: String) -> String { "/conversation/\(messageId)" }
        static func resetToMessage(_ messageId: String) -> String { "/conversation/\(messageId)/reset" }
    }

    // MARK: - Documents
    enum Documents {
        static let upload = "/documents/upload"
        static let checkDuplicate = "/documents/check-duplicate"
        static func session(_ sessionId: String) -> String { "/documents/session/\(sessionId)" }
        static func get(_ id: String) -> String { "/documents/\(id)" }
        static func update(_ id: String) -> String { "/documents/\(id)" }
        static func delete(_ id: String) -> String { "/documents/\(id)" }
        static func downloadUrl(_ id: String) -> String { "/documents/\(id)/download-url" }
        static func thumbnailUrl(_ id: String) -> String { "/documents/\(id)/thumbnail-url" }
        static func dates(_ sessionId: String) -> String { "/documents/session/\(sessionId)/dates" }
    }

    // MARK: - Journal
    enum Journal {
        static func entries(_ sessionId: String) -> String { "/journal/\(sessionId)" }
        static func entriesForDate(_ sessionId: String, date: String) -> String { "/journal/\(sessionId)/date/\(date)" }
        static func create(_ sessionId: String) -> String { "/journal/\(sessionId)" }
        static func update(_ entryId: String) -> String { "/journal/\(entryId)" }
        static func delete(_ entryId: String) -> String { "/journal/\(entryId)" }
        static func dates(_ sessionId: String) -> String { "/journal/\(sessionId)/dates" }
    }

    // MARK: - Audio Recordings
    enum AudioRecordings {
        static func list(_ sessionId: String) -> String { "/audio-recordings/\(sessionId)" }
        static func get(_ sessionId: String, recordingId: String) -> String { "/audio-recordings/\(sessionId)/\(recordingId)" }
        static func update(_ sessionId: String, recordingId: String) -> String { "/audio-recordings/\(sessionId)/\(recordingId)" }
        static func delete(_ sessionId: String, recordingId: String) -> String { "/audio-recordings/\(sessionId)/\(recordingId)" }
        static func audioUrl(_ sessionId: String, recordingId: String) -> String { "/audio-recordings/\(sessionId)/\(recordingId)/url" }
        static func retranscribe(_ sessionId: String, recordingId: String) -> String { "/audio-recordings/\(sessionId)/\(recordingId)/retranscribe" }
        static func dates(_ sessionId: String) -> String { "/audio-recordings/\(sessionId)/dates" }
    }

    // MARK: - Daily Plans
    enum DailyPlans {
        static func all(_ sessionId: String) -> String { "/daily-plans/\(sessionId)" }
        static func latest(_ sessionId: String) -> String { "/daily-plans/\(sessionId)/latest" }
        static func check(_ sessionId: String) -> String { "/daily-plans/\(sessionId)/check" }
        static func generate(_ sessionId: String) -> String { "/daily-plans/\(sessionId)/generate" }
        static func update(_ planId: String) -> String { "/daily-plans/\(planId)" }
        static func markViewed(_ planId: String) -> String { "/daily-plans/\(planId)/mark-viewed" }
        static func delete(_ planId: String) -> String { "/daily-plans/\(planId)" }
    }

    // MARK: - Tools
    enum Tools {
        static let jargonTranslator = "/tools/jargon-translator"
        static let conversationCoach = "/tools/conversation-coach"
    }

    // MARK: - Profile
    enum Profile {
        static func get(_ sessionId: String) -> String { "/profile/\(sessionId)" }
        static func check(_ sessionId: String) -> String { "/profile/\(sessionId)/check" }
        static func update(_ sessionId: String) -> String { "/profile/\(sessionId)/update" }
        static func save(_ sessionId: String) -> String { "/profile/\(sessionId)" }
        static func updateSection(_ sessionId: String) -> String { "/profile/\(sessionId)/section" }
        static func pendingChanges(_ sessionId: String) -> String { "/profile/\(sessionId)/pending-changes" }
        static func reviewPendingChanges(_ sessionId: String) -> String { "/profile/\(sessionId)/pending-changes/review" }
        static func regenerate(_ sessionId: String) -> String { "/profile/\(sessionId)/regenerate" }
        static func delete(_ sessionId: String) -> String { "/profile/\(sessionId)" }
        static func export(_ sessionId: String) -> String { "/profile/\(sessionId)/export" }
    }

    // MARK: - MFA
    enum MFA {
        static let status = "/mfa/status"
        static let totpSetup = "/mfa/totp/setup"
        static let totpVerifySetup = "/mfa/totp/verify-setup"
        static let totpDelete = "/mfa/totp"
        static let passkeyRegisterOptions = "/mfa/passkey/register/options"
        static let passkeyRegisterVerify = "/mfa/passkey/register/verify"
        static let passkeyAuthOptions = "/mfa/passkey/auth/options"
        static let passkeys = "/mfa/passkeys"
        static func deletePasskey(_ id: String) -> String { "/mfa/passkeys/\(id)" }
        static let generateBackupCodes = "/mfa/backup-codes/generate"
        static let backupCodesCount = "/mfa/backup-codes/count"
        static let trustedDevices = "/mfa/trusted-devices"
        static func revokeTrustedDevice(_ id: String) -> String { "/mfa/trusted-devices/\(id)" }
        static let enableMFA = "/mfa/enable"
        static let disableMFA = "/mfa/disable"
        static let verifyForAction = "/mfa/verify-for-action"
    }

    // MARK: - Feedback
    enum Feedback {
        static let submit = "/feedback/submit"
    }

    // MARK: - Notifications
    enum Notifications {
        static let registerToken = "/notifications/device-token"
        static let unregisterToken = "/notifications/device-token"
    }

    // MARK: - Waitlist
    enum Waitlist {
        static let signupMode = "/waitlist/signup-mode"
        static let join = "/waitlist/join"
    }
}
