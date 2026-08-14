import Foundation

/// Outcome of a refresh attempt. The three cases must stay distinct: only
/// `.rejected` means the stored refresh token is dead and the user has to log in
/// again. Collapsing `.transient` into "logged out" wipes the Keychain — and the
/// 30-day trusted-device token with it — every time the network drops or the
/// backend returns a 5xx during a deploy.
enum TokenRefreshOutcome: Sendable {
    case success(String)
    case rejected
    case transient
}

actor AuthInterceptor {
    static let shared = AuthInterceptor()

    private var accessToken: String?
    private var isRefreshing = false
    private var pendingRequests: [CheckedContinuation<TokenRefreshOutcome, Error>] = []

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

    /// Attempt to refresh the access token.
    /// Coordinates concurrent callers so only one refresh happens at a time.
    func refreshAccessToken() async throws -> TokenRefreshOutcome {
        if isRefreshing {
            return try await withCheckedThrowingContinuation { continuation in
                pendingRequests.append(continuation)
            }
        }

        isRefreshing = true

        do {
            let outcome = try await performRefresh()
            if case .success(let token) = outcome {
                accessToken = token
            }

            for continuation in pendingRequests {
                continuation.resume(returning: outcome)
            }
            pendingRequests.removeAll()
            isRefreshing = false

            return outcome
        } catch {
            for continuation in pendingRequests {
                continuation.resume(throwing: error)
            }
            pendingRequests.removeAll()
            isRefreshing = false

            throw error
        }
    }

    private func performRefresh() async throws -> TokenRefreshOutcome {
        guard let refreshToken = KeychainManager.shared.refreshToken else {
            // Nothing stored — this is a logged-out device, not a failure.
            return .rejected
        }

        let url = APIClient.shared.baseURL.appendingPathComponent(APIEndpoints.Auth.refresh)
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("ios", forHTTPHeaderField: "X-Client-Type")
        request.timeoutInterval = 10

        let body = ["refresh_token": refreshToken]
        request.httpBody = try JSONEncoder().encode(body)

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await pinnedSession.data(for: request)
        } catch {
            // Network error (timeout, DNS, connectivity) — don't clear the token.
            // The caller will retry later when connectivity is restored.
            return .transient
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            return .transient
        }

        if httpResponse.statusCode == 200 {
            struct RefreshResponse: Decodable {
                let access_token: String
                let refresh_token: String?
            }
            guard let refreshResponse = try? JSONDecoder().decode(RefreshResponse.self, from: data) else {
                // A 200 we can't parse is a server/proxy problem, not a rejection.
                return .transient
            }
            if let newRefreshToken = refreshResponse.refresh_token {
                KeychainManager.shared.refreshToken = newRefreshToken
            }
            return .success(refreshResponse.access_token)
        }

        // Server explicitly rejected the token — clear it and force re-login
        if httpResponse.statusCode == 401 || httpResponse.statusCode == 403 {
            KeychainManager.shared.refreshToken = nil
            return .rejected
        }

        // 5xx and anything else is transient: keep the token so the next attempt
        // (or the next launch) can succeed.
        return .transient
    }

    /// Returns true if the given request path should skip auto-refresh on 401.
    func shouldSkipRefresh(for path: String) -> Bool {
        noRefreshPaths.contains(where: { path.contains($0) })
    }
}
