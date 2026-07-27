import AuthenticationServices
import Foundation
import UIKit

/// Handles passkey (WebAuthn) authentication using ASAuthorizationController.
final class PasskeyAuthManager: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    private var continuation: CheckedContinuation<[String: AnyCodableValue], Error>?

    nonisolated override init() {
        super.init()
    }

    /// Defense-in-depth: confirm the backend-supplied relying party identifier
    /// belongs to our frontend domain before handing it to the platform. The
    /// associated-domains entitlement is the primary control; this guards
    /// against a relying party that doesn't match the configured environment.
    private static func isExpectedRelyingParty(_ rpId: String) -> Bool {
        #if DEBUG
        if rpId == "localhost" { return true }
        #endif
        guard let host = URL(string: AppConstants.frontendBaseURL)?.host else {
            return false
        }
        // The RP ID is typically the registrable domain (e.g. aretacare.com)
        // while the frontend host may be a subdomain (e.g. www.aretacare.com).
        return host == rpId || host.hasSuffix("." + rpId)
    }

    /// Performs a passkey assertion using the backend-provided WebAuthn options.
    /// Returns a credential dictionary ready to send to the `/auth/login/mfa-verify` endpoint.
    func authenticate(options: [String: AnyCodableValue]) async throws -> [String: AnyCodableValue] {
        guard continuation == nil else {
            throw PasskeyError.authenticationFailed("A passkey operation is already in progress")
        }

        guard let challengeString = options["challenge"]?.stringValue,
              let challenge = Data.fromBase64URL(challengeString) else {
            throw PasskeyError.invalidOptions("Missing or invalid challenge")
        }

        let rpId: String
        if let rp = options["rpId"]?.stringValue {
            rpId = rp
        } else {
            throw PasskeyError.invalidOptions("Missing rpId")
        }
        guard Self.isExpectedRelyingParty(rpId) else {
            throw PasskeyError.invalidOptions("Unexpected relying party")
        }

        let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: rpId)
        let request = provider.createCredentialAssertionRequest(challenge: challenge)

        // Set allowed credentials if provided
        if let allowCredentials = options["allowCredentials"]?.arrayValue {
            request.allowedCredentials = allowCredentials.compactMap { entry -> ASAuthorizationPlatformPublicKeyCredentialDescriptor? in
                guard let dict = entry.dictionaryValue,
                      let idString = dict["id"]?.stringValue,
                      let idData = Data.fromBase64URL(idString) else {
                    return nil
                }
                return ASAuthorizationPlatformPublicKeyCredentialDescriptor(credentialID: idData)
            }
        }

        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self

        return try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation
            controller.performRequests()
        }
    }

    /// Performs a passkey registration using the backend-provided WebAuthn options.
    /// Returns a credential dictionary ready to send to the `/mfa/passkey/register/verify` endpoint.
    func register(options: [String: AnyCodableValue]) async throws -> [String: AnyCodableValue] {
        guard continuation == nil else {
            throw PasskeyError.registrationFailed("A passkey operation is already in progress")
        }

        guard let challengeString = options["challenge"]?.stringValue,
              let challenge = Data.fromBase64URL(challengeString) else {
            throw PasskeyError.invalidOptions("Missing or invalid challenge")
        }

        guard let rp = options["rp"]?.dictionaryValue,
              let rpId = rp["id"]?.stringValue else {
            throw PasskeyError.invalidOptions("Missing rp.id")
        }
        guard Self.isExpectedRelyingParty(rpId) else {
            throw PasskeyError.invalidOptions("Unexpected relying party")
        }

        guard let user = options["user"]?.dictionaryValue,
              let userIdString = user["id"]?.stringValue,
              let userId = Data.fromBase64URL(userIdString),
              let userName = user["name"]?.stringValue else {
            throw PasskeyError.invalidOptions("Missing user.id or user.name")
        }

        let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: rpId)
        let request = provider.createCredentialRegistrationRequest(
            challenge: challenge,
            name: userName,
            userID: userId
        )

        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self

        return try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation
            controller.performRequests()
        }
    }

    // MARK: - ASAuthorizationControllerDelegate

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        // Handle registration credential
        if let registration = authorization.credential as? ASAuthorizationPlatformPublicKeyCredentialRegistration {
            let credentialID = registration.credentialID
            let clientDataJSON = registration.rawClientDataJSON

            guard let attestationObject = registration.rawAttestationObject else {
                continuation?.resume(throwing: PasskeyError.registrationFailed("Missing attestation object"))
                continuation = nil
                return
            }

            let credential: [String: AnyCodableValue] = [
                "id": .string(credentialID.base64URLEncodedString()),
                "rawId": .string(credentialID.base64URLEncodedString()),
                "type": .string("public-key"),
                "authenticatorAttachment": .string("platform"),
                "response": .dictionary([
                    "clientDataJSON": .string(clientDataJSON.base64URLEncodedString()),
                    "attestationObject": .string(attestationObject.base64URLEncodedString())
                ])
            ]

            continuation?.resume(returning: credential)
            continuation = nil
            return
        }

        // Handle assertion credential (login flow)
        guard let assertion = authorization.credential as? ASAuthorizationPlatformPublicKeyCredentialAssertion else {
            continuation?.resume(throwing: PasskeyError.unexpectedCredentialType)
            continuation = nil
            return
        }

        let credentialID = assertion.credentialID
        let clientDataJSON = assertion.rawClientDataJSON

        guard let authenticatorData = assertion.rawAuthenticatorData,
              let signature = assertion.signature else {
            continuation?.resume(throwing: PasskeyError.authenticationFailed("Missing authenticator data or signature"))
            continuation = nil
            return
        }

        let userHandleString: AnyCodableValue
        if let userID = assertion.userID, !userID.isEmpty {
            userHandleString = .string(userID.base64URLEncodedString())
        } else {
            userHandleString = .null
        }

        let credential: [String: AnyCodableValue] = [
            "id": .string(credentialID.base64URLEncodedString()),
            "rawId": .string(credentialID.base64URLEncodedString()),
            "type": .string("public-key"),
            "authenticatorAttachment": .string("platform"),
            "response": .dictionary([
                "clientDataJSON": .string(clientDataJSON.base64URLEncodedString()),
                "authenticatorData": .string(authenticatorData.base64URLEncodedString()),
                "signature": .string(signature.base64URLEncodedString()),
                "userHandle": userHandleString
            ])
        ]

        continuation?.resume(returning: credential)
        continuation = nil
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        let authError = error as? ASAuthorizationError
        if authError?.code == .canceled {
            continuation?.resume(throwing: PasskeyError.cancelled)
        } else {
            continuation?.resume(throwing: PasskeyError.authenticationFailed(error.localizedDescription))
        }
        continuation = nil
    }

    // MARK: - ASAuthorizationControllerPresentationContextProviding

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
              let window = scene.windows.first(where: \.isKeyWindow)
                ?? scene.windows.first(where: { !($0 is PassthroughWindow) }) else {
            return ASPresentationAnchor()
        }
        return window
    }
}

// MARK: - PasskeyError

enum PasskeyError: LocalizedError {
    case invalidOptions(String)
    case unexpectedCredentialType
    case cancelled
    case authenticationFailed(String)
    case registrationFailed(String)

    var errorDescription: String? {
        switch self {
        case .invalidOptions(let detail):
            return "Invalid passkey options: \(detail)"
        case .unexpectedCredentialType:
            return "Unexpected credential type received."
        case .cancelled:
            return "Passkey authentication was cancelled."
        case .authenticationFailed(let detail):
            return "Passkey authentication failed: \(detail)"
        case .registrationFailed(let detail):
            return "Passkey registration failed: \(detail)"
        }
    }
}

// MARK: - Base64URL Helpers

extension Data {
    /// Decodes a base64url-encoded string (RFC 4648 §5) to Data.
    static func fromBase64URL(_ string: String) -> Data? {
        var base64 = string
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        // Add padding if needed
        let remainder = base64.count % 4
        if remainder > 0 {
            base64 += String(repeating: "=", count: 4 - remainder)
        }
        return Data(base64Encoded: base64)
    }

    /// Encodes Data as a base64url string (RFC 4648 §5, no padding).
    func base64URLEncodedString() -> String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}

// MARK: - AnyCodableValue Helpers

extension AnyCodableValue {
    var stringValue: String? {
        if case .string(let value) = self { return value }
        return nil
    }

    var arrayValue: [AnyCodableValue]? {
        if case .array(let value) = self { return value }
        return nil
    }

    var dictionaryValue: [String: AnyCodableValue]? {
        if case .dictionary(let value) = self { return value }
        return nil
    }
}
