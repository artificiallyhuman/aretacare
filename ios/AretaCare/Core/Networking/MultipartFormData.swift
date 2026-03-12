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
