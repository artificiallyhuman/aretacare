import Foundation

extension String {
    /// Returns the MIME type for a file extension.
    var mimeTypeForExtension: String {
        switch lowercased() {
        case "pdf": return "application/pdf"
        case "jpg", "jpeg": return "image/jpeg"
        case "png": return "image/png"
        case "txt": return "text/plain"
        default: return "application/octet-stream"
        }
    }
}
