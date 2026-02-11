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
        case .unknown(let statusCode):
            return "Unexpected error (HTTP \(statusCode))."
        }
    }

    var requiresLogout: Bool {
        switch self {
        case .forbidden(let code):
            return code == "INACTIVE_USER" || code == "SESSION_ACCESS_DENIED"
        case .unauthorized:
            return true
        default:
            return false
        }
    }
}
