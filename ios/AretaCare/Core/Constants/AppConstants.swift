import Foundation

enum AppConstants {

    // MARK: - API

    /// Base URL is set via xcconfig (API_BASE_URL) per build configuration.
    static var apiBaseURL: String {
        guard let url = Bundle.main.infoDictionary?["API_BASE_URL"] as? String, !url.isEmpty else {
            fatalError("API_BASE_URL not set in xcconfig")
        }
        return url
    }

    /// Frontend URL is set via xcconfig (FRONTEND_URL) per build configuration.
    static var frontendBaseURL: String {
        guard let url = Bundle.main.infoDictionary?["FRONTEND_URL"] as? String, !url.isEmpty else {
            return "https://www.aretacare.com"
        }
        return url
    }

    // MARK: - Legal

    static var termsURL: URL { URL(string: "\(frontendBaseURL)/terms") ?? URL(string: "https://www.aretacare.com/terms")! }
    static var privacyURL: URL { URL(string: "\(frontendBaseURL)/privacy") ?? URL(string: "https://www.aretacare.com/privacy")! }
    static var contactURL: URL { URL(string: "\(frontendBaseURL)/contact") ?? URL(string: "https://www.aretacare.com/contact")! }
    static var aboutURL: URL { URL(string: "\(frontendBaseURL)/about") ?? URL(string: "https://www.aretacare.com/about")! }

    static let clientType = "ios"
    static let clientTypeHeader = "X-Client-Type"
    static let trustedDeviceHeader = "X-Trusted-Device"
    static let mfaActionTokenHeader = "X-MFA-Action-Token"

    // MARK: - Timeouts

    /// Idle timeout before automatic logout (seconds).
    static let idleTimeoutSeconds: TimeInterval = 30 * 60 // 30 minutes
    /// Warning shown before idle logout (seconds).
    static let idleWarningSeconds: TimeInterval = 60 // 1 minute before timeout
    /// Background duration before requiring biometric re-auth (seconds).
    static let biometricReauthSeconds: TimeInterval = 5 * 60 // 5 minutes

    // MARK: - Session Limits

    static let maxOwnedSessions = 5
    static let maxCollaboratorsPerSession = 10 // owner + 9
    static let sessionNameMaxLength = 15

    // MARK: - File Upload

    static let maxFileSizeBytes: Int = 30 * 1024 * 1024 // 30 MB
    static let allowedDocumentTypes = ["application/pdf", "image/jpeg", "image/png", "text/plain"]
    static let allowedImageExtensions = ["jpg", "jpeg", "png"]
    static let allowedDocumentExtensions = ["pdf", "txt"]

    // MARK: - Audio Recording

    /// Maximum recording duration (seconds).
    static let maxRecordingDuration: TimeInterval = 15 * 60 // 15 minutes
    static let audioFileExtension = "m4a"
    static let audioMimeType = "audio/m4a"
    static let maxAudioFileSizeBytes: Int = 100 * 1024 * 1024 // 100 MB

    // MARK: - Pagination

    static let defaultPageSize = 20
    static let journalPageSize = 50

    // MARK: - Keychain

    static let keychainService = "com.aretacare.ios"
    static let refreshTokenKey = "refresh_token"
    static let trustedDeviceTokenKey = "trusted_device_token"

    // MARK: - Token

    /// Access token lifetime (for preemptive refresh if needed).
    static let accessTokenLifetimeSeconds: TimeInterval = 60 * 60 // 1 hour

    // MARK: - Subscription (RevenueCat)

    /// RevenueCat API key, set via xcconfig (REVENUECAT_API_KEY) in Secrets.xcconfig.
    static var revenueCatAPIKey: String {
        guard let key = Bundle.main.infoDictionary?["REVENUECAT_API_KEY"] as? String, !key.isEmpty else {
            fatalError("REVENUECAT_API_KEY not set in Secrets.xcconfig")
        }
        return key
    }

    static let entitlementID = "AretaCare LLC Pro"
    static let monthlyProductID = "monthly"
    static let yearlyProductID = "yearly"

    // MARK: - Monitoring (Sentry)

    /// Sentry DSN, set via xcconfig (SENTRY_DSN) in Secrets.xcconfig. Nil when
    /// unset (e.g. simulator without Secrets.xcconfig) — crash reporting is
    /// skipped gracefully, unlike revenueCatAPIKey there is no fatalError.
    static var sentryDSN: String? {
        guard let dsn = Bundle.main.infoDictionary?["SENTRY_DSN"] as? String, !dsn.isEmpty else {
            return nil
        }
        return dsn
    }

    /// Sentry environment (production/staging/development), set per branch by
    /// the Xcode Cloud CI script.
    static var sentryEnvironment: String {
        (Bundle.main.infoDictionary?["SENTRY_ENVIRONMENT"] as? String).flatMap {
            $0.isEmpty ? nil : $0
        } ?? "development"
    }

}
