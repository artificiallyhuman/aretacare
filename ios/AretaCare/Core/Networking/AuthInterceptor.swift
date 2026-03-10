import Foundation

actor AuthInterceptor {
    static let shared = AuthInterceptor()

    private var accessToken: String?
    private var isRefreshing = false
    private var pendingRequests: [CheckedContinuation<String?, Error>] = []

    // Auth endpoints that should not trigger token refresh on 401
    private let noRefreshPaths = ["/auth/refresh", "/auth/login", "/auth/register", "/auth/logout"]

    /// Dedicated URLSession with certificate pinning for token refresh requests.
    /// Uses the same CertificatePinningDelegate as the main APIClient to ensure
    /// refresh requests are not vulnerable to MITM attacks.
    private let pinnedSession: URLSession = {
        let delegate = CertificatePinningDelegate()
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 10
        config.waitsForConnectivity = true
        return URLSession(configuration: config, delegate: delegate, delegateQueue: nil)
    }()

    // MARK: - Token Management

    func setAccessToken(_ token: String?) {
        self.accessToken = token
    }

    func getAccessToken() -> String? {
        accessToken
    }

    func clearAccessToken() {
        accessToken = nil
    }

    // MARK: - Request Authorization

    func authorize(_ request: URLRequest) -> URLRequest {
        var request = request
        if let token = accessToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let trustedDevice = KeychainManager.shared.trustedDeviceToken {
            request.setValue(trustedDevice, forHTTPHeaderField: "X-Trusted-Device")
        }
        return request
    }

    // MARK: - Token Refresh

    /// Attempt to refresh the access token. Returns the new token or nil if refresh failed.
    /// Coordinates concurrent callers so only one refresh happens at a time.
    func refreshAccessToken() async throws -> String? {
        if isRefreshing {
            return try await withCheckedThrowingContinuation { continuation in
                pendingRequests.append(continuation)
            }
        }

        isRefreshing = true

        do {
            let newToken = try await performRefresh()
            accessToken = newToken

            for continuation in pendingRequests {
                continuation.resume(returning: newToken)
            }
            pendingRequests.removeAll()
            isRefreshing = false

            return newToken
        } catch {
            for continuation in pendingRequests {
                continuation.resume(throwing: error)
            }
            pendingRequests.removeAll()
            isRefreshing = false

            throw error
        }
    }

    private func performRefresh() async throws -> String? {
        guard let refreshToken = KeychainManager.shared.refreshToken else {
            return nil
        }

        let url = APIClient.shared.baseURL.appendingPathComponent(APIEndpoints.Auth.refresh)
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("ios", forHTTPHeaderField: "X-Client-Type")
        request.timeoutInterval = 10

        let body = ["refresh_token": refreshToken]
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await pinnedSession.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            return nil
        }

        if httpResponse.statusCode == 200 {
            struct RefreshResponse: Decodable {
                let access_token: String
                let refresh_token: String?
            }
            let refreshResponse = try JSONDecoder().decode(RefreshResponse.self, from: data)
            if let newRefreshToken = refreshResponse.refresh_token {
                KeychainManager.shared.refreshToken = newRefreshToken
            }
            return refreshResponse.access_token
        }

        // Refresh failed - clear stored tokens
        KeychainManager.shared.refreshToken = nil
        return nil
    }

    /// Returns true if the given request path should skip auto-refresh on 401.
    func shouldSkipRefresh(for path: String) -> Bool {
        noRefreshPaths.contains(where: { path.contains($0) })
    }
}
