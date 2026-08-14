import Foundation

enum APIError: LocalizedError {
    case unauthorized
    case forbidden(code: String?)
    case mfaRequired(mfaToken: String)
    case notFound
    case rateLimited(retryAfter: Int?)
    case validationError(message: String)
    case serverError(statusCode: Int, message: String?)
    case networkError(underlying: Error)
    case decodingError(underlying: Error)
    case offline
    case noData
    /// The session couldn't be renewed for a transient reason (no connectivity,
    /// server 5xx). Retryable — the stored refresh token is still valid.
    case sessionRefreshUnavailable
    case unknown(statusCode: Int)

    var errorDescription: String? {
        switch self {
        case .unauthorized:
            return "Your session has expired. Please log in again."
        case .forbidden(let code):
            if code == "INACTIVE_USER" {
                return "Your account is inactive."
            } else if code == "SESSION_ACCESS_DENIED" {
                return "You no longer have access to this session."
            } else if code == "EMAIL_NOT_VERIFIED" {
                return "Your email has not been verified yet. Please check your inbox for a verification link."
            }
            return "You don't have permission to perform this action."
        case .mfaRequired:
            return "Multi-factor authentication is required."
        case .notFound:
            return "The requested resource was not found."
        case .rateLimited:
            return "Too many requests. Please try again later."
        case .validationError(let message):
            return message
        case .serverError(_, let message):
            return message ?? "An unexpected server error occurred."
        case .offline:
            return "No internet connection. Please check your network and try again."
        case .networkError(let underlying):
            return "Network error: \(underlying.localizedDescription)"
        case .decodingError:
            return "Failed to process server response."
        case .noData:
            return "No data received from server."
        case .sessionRefreshUnavailable:
            return "Couldn't reach the server to renew your session. Please check your connection and try again."
        case .unknown(let statusCode):
            return "Unexpected error (HTTP \(statusCode))."
        }
    }

    var requiresLogout: Bool {
        switch self {
        case .forbidden(let code):
            // SESSION_ACCESS_DENIED is deliberately absent: losing access to one
            // shared care session (an owner revoking a collaborator) is not the
            // end of the user's account. Routing it here ended the whole app
            // session and wiped the Keychain, taking the 30-day trusted-device
            // token with it. It is handled as a session-list change instead —
            // see `.sessionAccessRevoked`.
            return code == "INACTIVE_USER"
        case .unauthorized:
            return true
        default:
            return false
        }
    }
}
