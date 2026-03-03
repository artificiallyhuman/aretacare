import SwiftUI

struct CachedAsyncImage<Content: View, Placeholder: View, Failure: View>: View {
    let url: URL?
    let content: (Image) -> Content
    let placeholder: () -> Placeholder
    let failure: () -> Failure

    @State private var phase: AsyncImagePhase = .empty

    init(
        url: URL?,
        @ViewBuilder content: @escaping (Image) -> Content,
        @ViewBuilder placeholder: @escaping () -> Placeholder,
        @ViewBuilder failure: @escaping () -> Failure
    ) {
        self.url = url
        self.content = content
        self.placeholder = placeholder
        self.failure = failure
    }

    var body: some View {
        Group {
            switch phase {
            case .success(let image):
                content(image)
            case .failure:
                failure()
            case .empty:
                placeholder()
            @unknown default:
                placeholder()
            }
        }
        .task(id: url) {
            await loadImage()
        }
    }

    private func loadImage() async {
        guard let url else {
            phase = .failure(URLError(.badURL))
            return
        }

        // Check cache first
        if let cached = ImageCache.shared.get(url) {
            phase = .success(Image(uiImage: cached))
            return
        }

        // Download using URLSession.shared intentionally. Image URLs are S3 presigned URLs
        // pointing to AWS CloudFront/S3 infrastructure, which uses its own certificate chain
        // that does not match the app's pinned certificates for aretacare.com. Using the
        // pinned session here would cause all image downloads to fail.
        do {
            let (data, response) = try await URLSession.shared.data(from: url)
            guard let httpResponse = response as? HTTPURLResponse,
                  (200...299).contains(httpResponse.statusCode),
                  let uiImage = UIImage(data: data) else {
                phase = .failure(URLError(.badServerResponse))
                return
            }
            ImageCache.shared.set(uiImage, for: url)
            phase = .success(Image(uiImage: uiImage))
        } catch {
            phase = .failure(error)
        }
    }
}

// MARK: - Image Cache

final class ImageCache: @unchecked Sendable {
    static let shared = ImageCache()

    private let cache = NSCache<NSURL, UIImage>()

    private init() {
        cache.countLimit = 100
        cache.totalCostLimit = 50 * 1024 * 1024 // 50 MB
    }

    /// Returns a cache key URL with query parameters stripped.
    /// Presigned S3 URLs share the same path but rotate query params on each request;
    /// using the path-only key avoids duplicate downloads.
    private func cacheKey(for url: URL) -> NSURL {
        var components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        components?.query = nil
        return (components?.url ?? url) as NSURL
    }

    func get(_ url: URL) -> UIImage? {
        cache.object(forKey: cacheKey(for: url))
    }

    func set(_ image: UIImage, for url: URL) {
        let cost = image.jpegData(compressionQuality: 1.0)?.count ?? 0
        cache.setObject(image, forKey: cacheKey(for: url), cost: cost)
    }

    func clear() {
        cache.removeAllObjects()
    }
}
