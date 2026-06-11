import Foundation

/// A URLSession for fetching S3 presigned-URL content (document bytes, image
/// thumbnails) without writing responses to the on-disk URLCache.
///
/// These responses contain personal health data and must not persist in the
/// shared cache. No certificate-pinning delegate is attached: these URLs point
/// to AWS S3/CloudFront, whose certificate chain does not match the app's
/// pinned certificates for aretacare.com (see CachedAsyncImage for context).
enum UncachedURLSession {
    static let shared: URLSession = {
        let config = URLSessionConfiguration.default
        config.urlCache = nil
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        return URLSession(configuration: config)
    }()
}
