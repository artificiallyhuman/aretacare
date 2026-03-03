import Foundation

/// Status of an individual file within a multi-file upload batch.
enum UploadFileStatus: Equatable {
    case pending
    case uploading
    case success
    case error(String)
    case cancelled
}

/// Tracks the upload state for one file in a batch.
struct UploadFileProgress: Identifiable {
    let id: Int
    let filename: String
    var status: UploadFileStatus

    var isFinished: Bool {
        switch status {
        case .pending, .uploading: return false
        default: return true
        }
    }
}

/// Result summary after a batch upload completes.
struct UploadBatchResult {
    let successCount: Int
    let failCount: Int
    let cancelledCount: Int
    let wasCancelled: Bool
}

/// A file ready to upload (data loaded into memory, validated).
struct PendingUpload {
    let data: Data
    let filename: String
    let contentType: String
}
