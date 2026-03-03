import Foundation

// MARK: - Waitlist

struct WaitlistJoinRequest: Codable {
    let email: String
    let message: String?
}

struct WaitlistJoinResponse: Codable {
    let success: Bool
    let message: String
    let alreadyOnList: Bool
}

struct SignupModeResponse: Codable {
    let controlSignups: Bool
}

// MARK: - Feedback

enum FeedbackType: String, Codable, CaseIterable {
    case bug
    case improvement
    case feature
    case other

    var displayName: String {
        switch self {
        case .bug: return "Bug Report"
        case .improvement: return "Improvement"
        case .feature: return "Feature Request"
        case .other: return "Other"
        }
    }
}

struct FeedbackSubmitRequest: Codable {
    let name: String
    let email: String
    let feedbackTypes: [FeedbackType]
    let message: String
    let userAgent: String?
    let pageUrl: String?
}

struct FeedbackResponse: Codable {
    let success: Bool
    let message: String
}

// MARK: - Generic Message Response

struct MessageResponseGeneric: Codable {
    let message: String
}
