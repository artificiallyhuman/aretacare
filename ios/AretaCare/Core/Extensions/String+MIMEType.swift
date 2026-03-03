import Foundation

extension String {
    /// Returns the MIME type for a file extension.
    var mimeTypeForExtension: String {
        switch lowercased() {
        case "pdf": return "application/pdf"
        case "jpg", "jpeg": return "image/jpeg"
        case "png": return "image/png"
        case "txt": return "text/plain"
        case "mp3": return "audio/mpeg"
        case "m4a": return "audio/m4a"
        case "wav": return "audio/wav"
        case "mp4": return "audio/mp4"
        case "webm": return "audio/webm"
        case "ogg": return "audio/ogg"
        default: return "application/octet-stream"
        }
    }
}
