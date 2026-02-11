import Foundation

// MARK: - Document

struct DocumentResponse: Codable, Identifiable, Sendable {
    let id: Int
    let sessionId: String
    let filename: String
    let contentType: String
    let extractedText: String?
    let uploadedAt: Date
    let category: String?
    let aiDescription: String?
    let uploadedBy: SourceTagInfo?
    let lastEditedBy: SourceTagInfo?
}

struct DocumentUploadResponse: Codable {
    let id: Int
    let filename: String
    let contentType: String
    let uploadedAt: Date
    let extractedText: String?
    let category: String?
    let aiDescription: String?
    let mediaUrl: String?
    let thumbnailUrl: String?
    let processingWarning: String?
    let extractionMethod: String?
}

struct DocumentUpdateRequest: Codable {
    let aiDescription: String?
    let category: String?

    init(aiDescription: String? = nil, category: String? = nil) {
        self.aiDescription = aiDescription
        self.category = category
    }
}

struct DocumentListResponse: Codable {
    let documents: [DocumentResponse]
    let hasMore: Bool
    let total: Int
}

// MARK: - Duplicate Check

struct DuplicateCheckRequest: Codable {
    let sessionId: String
    let filenames: [String]
}

struct DuplicateMatch: Codable, Identifiable {
    let id: Int
    let filename: String
    let uploadedAt: Date
    let category: String?
}

struct DuplicateCheckResponse: Codable {
    let duplicates: [DuplicateMatch]
}

// MARK: - Download / Thumbnail URLs

struct DownloadUrlResponse: Codable {
    let downloadUrl: String
}

struct ThumbnailUrlResponse: Codable {
    let thumbnailUrl: String
}
