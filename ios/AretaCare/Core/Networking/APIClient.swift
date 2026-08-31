import Foundation

final class APIClient: Sendable {
    static let shared = APIClient()

    private let session: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder
    let baseURL: URL

    /// snake_case → camelCase, but only when `.convertToSnakeCase` would turn
    /// the result back into the exact original; otherwise the key is returned
    /// unchanged. See the decoder setup in `init` for why.
    static func roundTripSafeCamelKey(_ raw: String) -> String {
        // No underscores → nothing to convert; an uppercase-bearing key is not
        // something this API emits and would not round-trip predictably.
        guard raw.contains("_"), !raw.contains(where: { $0.isUppercase }) else { return raw }

        let components = raw.split(separator: "_", omittingEmptySubsequences: false)
        // Leading/trailing/double underscores don't survive the round trip
        guard components.allSatisfy({ !$0.isEmpty }) else { return raw }

        var camel = String(components[0])
        for component in components.dropFirst() {
            camel += component.prefix(1).uppercased() + component.dropFirst()
        }

        // Re-derive snake_case the way JSONEncoder.convertToSnakeCase does for
        // this shape (an underscore before each single uppercase letter) and
        // only accept the conversion when it reproduces the original — a digit
        // component (`icd_10_code` → `icd10Code` → `icd10_code`) fails this.
        var snake = ""
        for ch in camel {
            if ch.isUppercase {
                snake += "_" + ch.lowercased()
            } else {
                snake.append(ch)
            }
        }
        return snake == raw ? camel : raw
    }

    private init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 120
        config.timeoutIntervalForResource = 600
        config.waitsForConnectivity = true
        // API responses carry personal health data and must not be written to
        // the on-disk URLCache. Intentional caching uses the in-memory
        // ResponseCache instead.
        config.urlCache = nil
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        let pinningDelegate = CertificatePinningDelegate()
        self.session = URLSession(configuration: config, delegate: pinningDelegate, delegateQueue: nil)

        self.decoder = JSONDecoder()
        // Round-trip-safe variant of .convertFromSnakeCase. The profile models
        // preserve keys this build doesn't declare (`additionalFields`) and save
        // sections back whole, and snake→camel→snake is not an inverse for keys
        // with digit components: `icd_10_code` decoded to `icd10Code` re-encodes
        // as `icd10_code`, silently renaming a server-added field on the next
        // section save. Convert a key only when the conversion provably reverses
        // (which holds for every key this API serves today); otherwise keep the
        // original string, so it lands in additionalFields verbatim and
        // .convertToSnakeCase re-encodes it unchanged.
        self.decoder.keyDecodingStrategy = .custom { codingPath in
            let key = codingPath.last!
            guard key.intValue == nil else { return key }
            return AnyCodingKey(Self.roundTripSafeCamelKey(key.stringValue))
        }
        self.decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let dateString = try container.decode(String.self)
            if let date = ISO8601DateFormatter().date(from: dateString) {
                return date
            }
            let formatter = DateFormatter()
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.timeZone = TimeZone(secondsFromGMT: 0)
            for format in ["yyyy-MM-dd'T'HH:mm:ss.SSSSSS", "yyyy-MM-dd'T'HH:mm:ss", "yyyy-MM-dd"] {
                formatter.dateFormat = format
                if let date = formatter.date(from: dateString) {
                    return date
                }
            }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unable to parse date: \(dateString)")
        }

        self.encoder = JSONEncoder()
        self.encoder.keyEncodingStrategy = .convertToSnakeCase

        if let plistValue = Bundle.main.infoDictionary?["API_BASE_URL"] as? String,
           !plistValue.isEmpty,
           let url = URL(string: plistValue) {
            self.baseURL = url
        } else {
            #if DEBUG
            self.baseURL = URL(string: "http://localhost:8000/api")!
            #else
            fatalError("API_BASE_URL not configured. Set it in the Release.xcconfig file.")
            #endif
        }
    }

    /// Marketing version (`CFBundleShortVersionString`, e.g. "1.0.9"), sent on every request
    /// as `X-App-Version`. Nothing on the server gates on it yet — it exists so a future
    /// server-side control can tell an out-of-date client apart from a current one and
    /// degrade deliberately, rather than staying disabled until App Store review completes.
    /// Falls back to "unknown" rather than crashing; this is telemetry, not a critical path.
    private static let appVersion: String =
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "unknown"

    // MARK: - HTTP Methods

    func get<T: Decodable>(_ path: String, queryItems: [URLQueryItem]? = nil) async throws -> T {
        let request = try buildRequest(path: path, method: "GET", queryItems: queryItems)
        return try await execute(request)
    }

    func post<T: Decodable>(_ path: String, body: (some Encodable)? = nil as Empty?, queryItems: [URLQueryItem]? = nil, headers: [String: String]? = nil) async throws -> T {
        let request = try buildRequest(path: path, method: "POST", body: body, queryItems: queryItems, headers: headers)
        return try await execute(request)
    }

    func put<T: Decodable>(_ path: String, body: some Encodable, headers: [String: String]? = nil) async throws -> T {
        let request = try buildRequest(path: path, method: "PUT", body: body, headers: headers)
        return try await execute(request)
    }

    func patch<T: Decodable>(_ path: String, body: some Encodable) async throws -> T {
        let request = try buildRequest(path: path, method: "PATCH", body: body)
        return try await execute(request)
    }

    func delete<T: Decodable>(_ path: String, body: (some Encodable)? = nil as Empty?) async throws -> T {
        let request = try buildRequest(path: path, method: "DELETE", body: body)
        return try await execute(request)
    }

    // MARK: - Void variants (for endpoints that return no meaningful body)

    func post(_ path: String, body: (some Encodable)? = nil as Empty?, queryItems: [URLQueryItem]? = nil) async throws {
        let request = try buildRequest(path: path, method: "POST", body: body, queryItems: queryItems)
        try await executeVoid(request)
    }

    func put(_ path: String, body: some Encodable) async throws {
        let request = try buildRequest(path: path, method: "PUT", body: body)
        try await executeVoid(request)
    }

    func delete(_ path: String, body: (some Encodable)? = nil as Empty?, headers: [String: String]? = nil) async throws {
        let request = try buildRequest(path: path, method: "DELETE", body: body, headers: headers)
        try await executeVoid(request)
    }

    // MARK: - Raw Data Download

    func downloadData(_ path: String, queryItems: [URLQueryItem]? = nil) async throws -> Data {
        let request = try buildRequest(path: path, method: "GET", queryItems: queryItems)
        let (data, response) = try await performAuthorizedRequest(request)

        do {
            try checkHTTPResponse(response, data: data, originalRequest: request)
        } catch APIError.unauthorized {
            let outcome = await attemptTokenRefresh(for: request)
            guard case .success = outcome else {
                throw await handleFailedRefresh(outcome)
            }
            let (retryData, retryResponse) = try await performAuthorizedRequest(request)
            try checkHTTPResponse(retryResponse, data: retryData, originalRequest: request)
            return retryData
        } catch let error as APIError where error.requiresLogout {
            await AuthManager.shared.forceLogout()
            throw error
        }

        return data
    }

    // MARK: - Multipart Upload

    func upload<T: Decodable>(_ path: String, multipart: MultipartFormData, queryItems: [URLQueryItem]? = nil) async throws -> T {
        var request = try buildRequest(path: path, method: "POST", queryItems: queryItems)
        request.setValue(multipart.contentType, forHTTPHeaderField: "Content-Type")
        request.httpBody = multipart.data
        request.timeoutInterval = 600
        return try await execute(request)
    }

    // MARK: - Request Building

    private func buildRequest(path: String, method: String, body: (some Encodable)? = nil as Empty?, queryItems: [URLQueryItem]? = nil, headers: [String: String]? = nil) throws -> URLRequest {
        guard var components = URLComponents(url: baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false) else {
            throw APIError.networkError(underlying: URLError(.badURL))
        }
        if let queryItems, !queryItems.isEmpty {
            components.queryItems = queryItems
        }
        guard let url = components.url else {
            throw APIError.networkError(underlying: URLError(.badURL))
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("ios", forHTTPHeaderField: "X-Client-Type")
        request.setValue(Self.appVersion, forHTTPHeaderField: "X-App-Version")

        if let body, !(body is Empty) {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try encoder.encode(body)
        }

        // Per-call headers (e.g. the MFA action token for step-up-gated endpoints)
        for (field, value) in headers ?? [:] {
            request.setValue(value, forHTTPHeaderField: field)
        }

        return request
    }

    // MARK: - Execution

    private func execute<T: Decodable>(_ request: URLRequest) async throws -> T {
        let (data, response) = try await performAuthorizedRequest(request)

        do {
            try checkHTTPResponse(response, data: data, originalRequest: request)
        } catch APIError.unauthorized {
            // Attempt token refresh and retry (mirrors web app's axios interceptor)
            let outcome = await attemptTokenRefresh(for: request)
            guard case .success = outcome else {
                throw await handleFailedRefresh(outcome)
            }
            let (retryData, retryResponse) = try await performAuthorizedRequest(request)
            try checkHTTPResponse(retryResponse, data: retryData, originalRequest: request)
            do {
                return try decoder.decode(T.self, from: retryData)
            } catch {
                throw APIError.decodingError(underlying: error)
            }
        } catch let error as APIError where error.requiresLogout {
            await AuthManager.shared.forceLogout()
            throw error
        }

        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decodingError(underlying: error)
        }
    }

    private func executeVoid(_ request: URLRequest) async throws {
        let (data, response) = try await performAuthorizedRequest(request)

        do {
            try checkHTTPResponse(response, data: data, originalRequest: request)
        } catch APIError.unauthorized {
            let outcome = await attemptTokenRefresh(for: request)
            guard case .success = outcome else {
                throw await handleFailedRefresh(outcome)
            }
            let (retryData, retryResponse) = try await performAuthorizedRequest(request)
            try checkHTTPResponse(retryResponse, data: retryData, originalRequest: request)
        } catch let error as APIError where error.requiresLogout {
            await AuthManager.shared.forceLogout()
            throw error
        }
    }

    // MARK: - Request Helpers

    private func performAuthorizedRequest(_ request: URLRequest) async throws -> (Data, URLResponse) {
        let authorizedRequest = await AuthInterceptor.shared.authorize(request)
        logRequest(authorizedRequest)
        do {
            let (data, response) = try await session.data(for: authorizedRequest)
            logResponse(response, data: data)
            return (data, response)
        } catch {
            throw APIError.networkError(underlying: error)
        }
    }

    /// Attempt token refresh. Only `.rejected` means the session is really over —
    /// `.transient` must leave the Keychain alone so a dropped connection or a
    /// backend 5xx doesn't log the user out.
    private func attemptTokenRefresh(for request: URLRequest) async -> TokenRefreshOutcome {
        let path = request.url?.path ?? ""
        guard await !AuthInterceptor.shared.shouldSkipRefresh(for: path) else {
            return .rejected
        }
        do {
            return try await AuthInterceptor.shared.refreshAccessToken()
        } catch {
            return .transient
        }
    }

    /// Maps a failed refresh to the right terminal state: log out only when the
    /// server rejected the token, otherwise surface a retryable error.
    private func handleFailedRefresh(_ outcome: TokenRefreshOutcome) async -> APIError {
        if case .rejected = outcome {
            await AuthManager.shared.forceLogout()
            return APIError.unauthorized
        }
        return APIError.sessionRefreshUnavailable
    }

    // MARK: - Response Handling

    private func checkHTTPResponse(_ response: URLResponse, data: Data, originalRequest: URLRequest) throws {
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.unknown(statusCode: 0)
        }
        let statusCode = httpResponse.statusCode

        guard !(200...299).contains(statusCode) else { return }

        let detail = parseErrorDetail(from: data)

        switch statusCode {
        case 401:
            // Auth endpoints (login, register): surface the server's message
            // (e.g. "Incorrect email or password") instead of generic "session expired"
            if let path = originalRequest.url?.path,
               path.contains("/auth/login") || path.contains("/auth/register"),
               let message = detail?.message {
                throw APIError.validationError(message: message)
            }
            throw APIError.unauthorized
        case 403:
            let errorCode = detail?.code
            if errorCode == "MFA_REQUIRED", let mfaToken = detail?.mfaToken {
                throw APIError.mfaRequired(mfaToken: mfaToken)
            }
            if errorCode == "SESSION_ACCESS_DENIED" {
                // Access to one care session was revoked. Let the session list
                // recover; this is not a logout.
                Task { @MainActor in
                    NotificationCenter.default.post(name: .sessionAccessRevoked, object: nil)
                }
            }
            throw APIError.forbidden(code: errorCode)
        case 400:
            throw APIError.validationError(message: detail?.message ?? "Invalid request")
        case 404:
            throw APIError.notFound
        case 422:
            throw APIError.validationError(message: detail?.message ?? "Validation error")
        case 429:
            let retryAfter = (response as? HTTPURLResponse)?.value(forHTTPHeaderField: "Retry-After").flatMap(Int.init)
            throw APIError.rateLimited(retryAfter: retryAfter)
        case 500...599:
            throw APIError.serverError(statusCode: statusCode, message: detail?.message)
        default:
            throw APIError.unknown(statusCode: statusCode)
        }
    }

    private func parseErrorDetail(from data: Data) -> ErrorDetail? {
        struct ErrorResponse: Decodable {
            let detail: ErrorDetailValue
        }
        enum ErrorDetailValue: Decodable {
            case string(String)
            case object(ErrorDetail)

            init(from decoder: Decoder) throws {
                let container = try decoder.singleValueContainer()
                if let str = try? container.decode(String.self) {
                    self = .string(str)
                } else if let obj = try? container.decode(ErrorDetail.self) {
                    self = .object(obj)
                } else {
                    self = .string("Unknown error")
                }
            }
        }

        guard let errorResponse = try? JSONDecoder().decode(ErrorResponse.self, from: data) else {
            return nil
        }
        switch errorResponse.detail {
        case .string(let msg):
            return ErrorDetail(message: msg, code: nil, mfaToken: nil)
        case .object(let detail):
            return detail
        }
    }

    // MARK: - Logging

    private func logRequest(_ request: URLRequest) {
        #if DEBUG
        print("[API] \(request.httpMethod ?? "?") \(request.url?.absoluteString ?? "?")")
        #endif
    }

    private func logResponse(_ response: URLResponse, data: Data) {
        #if DEBUG
        if let http = response as? HTTPURLResponse {
            let size = data.count
            print("[API] \(http.statusCode) (\(size) bytes)")
            if !(200...299).contains(http.statusCode) {
                print("[API] URL: \(http.url?.absoluteString ?? "?")")
                if let body = String(data: data, encoding: .utf8) {
                    let truncated = body.count > 300 ? body.prefix(300) + "…(truncated)" : body[...]
                    print("[API] Body: \(truncated)")
                }
            }
        }
        #endif
    }
}

// MARK: - Helper Types

struct Empty: Codable {}

struct ErrorDetail: Decodable {
    let message: String?
    let code: String?
    let mfaToken: String?

    enum CodingKeys: String, CodingKey {
        case message
        case code
        case mfaToken = "mfa_token"
    }
}
