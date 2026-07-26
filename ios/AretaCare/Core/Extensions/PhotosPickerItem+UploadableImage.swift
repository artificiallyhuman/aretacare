import PhotosUI
import SwiftUI
import UIKit
import UniformTypeIdentifiers

extension PhotosPickerItem {
    /// Loads the photo as upload-ready data with a matching extension and MIME
    /// type. The backend only accepts JPEG/PNG images, but `.photosPicker`
    /// with `matching: .images` can hand back any library format — HEIC, TIFF,
    /// GIF, WebP. Those are re-encoded to JPEG here (mirroring the camera
    /// path) instead of being uploaded verbatim and rejected server-side after
    /// a full round trip. Returns nil if the asset can't be loaded or decoded.
    func loadUploadableImage() async -> (data: Data, ext: String, contentType: String)? {
        guard let data = try? await loadTransferable(type: Data.self) else { return nil }

        if let type = supportedContentTypes.first {
            if type.conforms(to: .jpeg) {
                return (data, "jpg", "image/jpeg")
            }
            if type.conforms(to: .png) {
                return (data, "png", "image/png")
            }
        }

        guard let image = UIImage(data: data),
              let jpegData = image.jpegData(compressionQuality: 0.85) else {
            return nil
        }
        return (jpegData, "jpg", "image/jpeg")
    }
}
