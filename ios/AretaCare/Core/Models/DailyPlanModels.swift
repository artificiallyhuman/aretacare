import Foundation

// MARK: - Daily Plan

struct DailyPlanResponse: Codable, Identifiable, Sendable {
    let id: Int
    let sessionId: String
    let date: String // "YYYY-MM-DD"
    let content: String
    let userEditedContent: String?
    let viewed: Bool
    let createdAt: Date
    let updatedAt: Date

    /// Returns the display content (user-edited if available, otherwise AI-generated)
    var displayContent: String {
        userEditedContent ?? content
    }
}

struct DailyPlanCheckResponse: Codable {
    let shouldGenerate: Bool
    let latestPlanDate: String?
    let hoursSinceLastPlan: Double?
    let reason: String?
}

struct DailyPlanListResponse: Codable {
    let plans: [DailyPlanResponse]
    let hasMore: Bool
    let total: Int
}

struct DailyPlanUpdateRequest: Codable {
    let userEditedContent: String
}

struct DailyPlanMarkViewedRequest: Codable {
    let viewed: Bool
}
