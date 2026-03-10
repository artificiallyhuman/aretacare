import Foundation

final class APIClient: Sendable {
    static let shared = APIClient()

    private let session: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder
    let baseURL: URL

    private init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 120
        config.timeoutIntervalForResource = 600
        config.waitsForConnectivity = true
        let pinningDelegate = CertificatePinningDelegate()
        self.session = URLSession(configuration: config, delegate: pinningDelegate, delegateQueue: nil)

        self.decoder = JSONDecoder()
        self.decoder.keyDecodingStrategy = .convertFromSnakeCase
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

    // MARK: - HTTP Methods

    func get<T: Decodable>(_ path: String, queryItems: [URLQueryItem]? = nil) async throws -> T {
        let request = try buildRequest(path: path, method: "GET", queryItems: queryItems)
        return try await execute(request)
    }

    func post<T: Decodable>(_ path: String, body: (some Encodable)? = nil as Empty?, queryItems: [URLQueryItem]? = nil) async throws -> T {
        let request = try buildRequest(path: path, method: "POST", body: body, queryItems: queryItems)
        return try await execute(request)
    }

    func put<T: Decodable>(_ path: String, body: some Encodable) async throws -> T {
        let request = try buildRequest(path: path, method: "PUT", body: body)
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

    func delete(_ path: String, body: (some Encodable)? = nil as Empty?) async throws {
        let request = try buildRequest(path: path, method: "DELETE", body: body)
        try await executeVoid(request)
    }

    // MARK: - Raw Data Download

    func downloadData(_ path: String, queryItems: [URLQueryItem]? = nil) async throws -> Data {
        let request = try buildRequest(path: path, method: "GET", queryItems: queryItems)
        let (data, response) = try await performAuthorizedRequest(request)

        do {
            try checkHTTPResponse(response, data: data, originalRequest: request)
        } catch APIError.unauthorized {
            guard await attemptTokenRefresh(for: request) else {
                await AuthManager.shared.forceLogout()
                throw APIError.unauthorized
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

    private func buildRequest(path: String, method: String, body: (some Encodable)? = nil as Empty?, queryItems: [URLQueryItem]? = nil) throws -> URLRequest {
        var components = URLComponents(url: baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
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

        if let body, !(body is Empty) {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try encoder.encode(body)
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
            guard await attemptTokenRefresh(for: request) else {
                await AuthManager.shared.forceLogout()
                throw APIError.unauthorized
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
            guard await attemptTokenRefresh(for: request) else {
                await AuthManager.shared.forceLogout()
                throw APIError.unauthorized
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

    /// Attempt token refresh. Returns true if refresh succeeded.
    private func attemptTokenRefresh(for request: URLRequest) async -> Bool {
        let path = request.url?.path ?? ""
        guard await !AuthInterceptor.shared.shouldSkipRefresh(for: path) else {
            return false
        }
        do {
            return try await AuthInterceptor.shared.refreshAccessToken() != nil
        } catch {
            return false
        }
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
                    print("[API] Body: \(body)")
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
