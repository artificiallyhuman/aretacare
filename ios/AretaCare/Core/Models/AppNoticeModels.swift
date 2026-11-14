import Foundation

/// An admin-published notice shown to every signed-in user (`GET /notice`). It exists for
/// breach notifications: the second electronic channel next to email (docs/BREACH_RESPONSE.md).
/// The body is plain text. `id` changes with every publish, so it is the dismissal key.
struct AppNotice: Decodable, Identifiable, Equatable {
    let id: Int
    let title: String
    let body: String
    let linkUrl: String?
    let linkLabel: String?

    /// The link, only when it is an https page on aretacare.com. The server already refuses
    /// anything else; this keeps a compromised or misconfigured server from turning the
    /// notice into a phishing link.
    var safeLinkURL: URL? {
        guard let linkUrl,
              let components = URLComponents(string: linkUrl),
              components.scheme == "https",
              components.user == nil, components.password == nil,
              let host = components.host?.lowercased(),
              host == "aretacare.com" || host.hasSuffix(".aretacare.com")
        else { return nil }
        return components.url
    }
}

struct CurrentAppNoticeResponse: Decodable {
    let notice: AppNotice?
}
