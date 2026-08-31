import Foundation

struct MultipartFormData {
    private let boundary: String
    private var body = Data()

    init(boundary: String = UUID().uuidString) {
        self.boundary = boundary
    }

    var contentType: String {
        "multipart/form-data; boundary=\(boundary)"
    }

    private static func utf8Data(_ string: String) -> Data {
        string.data(using: .utf8) ?? Data()
    }

    var data: Data {
        var result = body
        result.append(Self.utf8Data("--\(boundary)--\r\n"))
        return result
    }

    mutating func addTextField(name: String, value: String) {
        body.append(Self.utf8Data("--\(boundary)\r\n"))
        body.append(Self.utf8Data("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n"))
        body.append(Self.utf8Data("\(value)\r\n"))
    }

    mutating func addFileField(name: String, filename: String, mimeType: String, data fileData: Data) {
        body.append(Self.utf8Data("--\(boundary)\r\n"))
        body.append(Self.utf8Data("Content-Disposition: form-data; name=\"\(name)\"; filename=\"\(filename)\"\r\n"))
        body.append(Self.utf8Data("Content-Type: \(mimeType)\r\n\r\n"))
        body.append(fileData)
        body.append(Self.utf8Data("\r\n"))
    }
}

// MARK: - Transcribe request body

extension MultipartFormData {
    /// Cached — the previous per-call-site DateFormatter was rebuilt on every recording.
    private static let recordingFilenameFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd_h-mma"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f
    }()

    static func generatedRecordingFilename() -> String {
        "Recording_\(recordingFilenameFormatter.string(from: Date())).\(AppConstants.audioFileExtension)"
    }

    /// The `POST /conversation/transcribe` body. One builder for the chat
    /// recorder, Conversation Coach and the Audio Recordings uploads, which
    /// each carried their own copy of these four fields.
    static func transcribeAudioBody(
        sessionId: String,
        audioData: Data,
        filename: String,
        mimeType: String = AppConstants.audioMimeType,
        skipJournalSynthesis: Bool
    ) -> MultipartFormData {
        var multipart = MultipartFormData()
        multipart.addTextField(name: "session_id", value: sessionId)
        multipart.addTextField(name: "skip_journal_synthesis", value: skipJournalSynthesis ? "true" : "false")
        multipart.addTextField(name: "background", value: "true")
        multipart.addFileField(name: "audio", filename: filename, mimeType: mimeType, data: audioData)
        return multipart
    }
}
