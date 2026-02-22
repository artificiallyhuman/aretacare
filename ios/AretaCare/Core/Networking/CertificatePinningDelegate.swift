import Foundation
import CryptoKit

/// URLSession delegate that performs SSL public key pinning for production builds.
/// In DEBUG mode, localhost/127.0.0.1 connections bypass pinning for development.
final class CertificatePinningDelegate: NSObject, URLSessionDelegate, Sendable {
    // SHA-256 hashes of the SubjectPublicKeyInfo for aretacare.com certificates.
    //
    // IMPORTANT: Replace placeholder hashes before App Store submission.
    //
    // Steps to generate the hash for your certificate:
    //   1. Connect to the production server and extract the public key:
    //        openssl s_client -connect aretacare.com:443 -servername aretacare.com 2>/dev/null \
    //          | openssl x509 -pubkey -noout \
    //          | openssl pkey -pubin -outform der \
    //          | openssl dgst -sha256 -binary \
    //          | base64
    //   2. Copy the base64 output (e.g., "x3pGTSOuJeEVw7jjB/...=") and replace the primary hash below.
    //   3. Repeat for the intermediate/CA certificate to get the backup hash:
    //        openssl s_client -connect aretacare.com:443 -servername aretacare.com -showcerts 2>/dev/null \
    //          | awk '/-----BEGIN CERTIFICATE-----/{n++} n==2' \
    //          | openssl x509 -pubkey -noout \
    //          | openssl pkey -pubin -outform der \
    //          | openssl dgst -sha256 -binary \
    //          | base64
    //   4. Include at least 2 hashes (leaf + backup/CA) to avoid bricking the app on certificate rotation.
    //
    private static let placeholderHashes: Set<String> = [
        "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=",
        "CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC="
    ]

    private let pinnedKeyHashes: Set<String> = [
        // Primary leaf certificate public key hash
        "0LSDaM3YYZuUsSwwuqYc/Xfz2wwppQBsZED6FjqKl4E=",
        // Backup / intermediate CA public key hash
        "kIdp6NNEd8wsugYyyIYFsi1ylMCED3hZbSR8ZFsa/A4="
    ]

    override init() {
        super.init()
        #if !DEBUG
        if !pinnedKeyHashes.isDisjoint(with: Self.placeholderHashes) {
            print("[SSL] WARNING: Certificate pinning is using placeholder hashes. Replace with real hashes before App Store submission.")
            assertionFailure("Certificate pinning placeholder hashes detected in Release build. See CertificatePinningDelegate.swift for instructions.")
        }
        #endif
    }

    func urlSession(
        _ session: URLSession,
        didReceive challenge: URLAuthenticationChallenge,
        completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
    ) {
        guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
              let serverTrust = challenge.protectionSpace.serverTrust else {
            completionHandler(.cancelAuthenticationChallenge, nil)
            return
        }

        #if DEBUG
        // Skip pinning for localhost/simulator and non-production API hosts
        let host = challenge.protectionSpace.host
        let isLocalhost = host == "localhost" || host == "127.0.0.1"
        let isConfiguredAPIHost = Bundle.main.object(forInfoDictionaryKey: "API_BASE_URL")
            .flatMap { ($0 as? String).flatMap { URL(string: $0)?.host } }
            .map { $0 == host } ?? false
        if isLocalhost || (isConfiguredAPIHost && host != "api.aretacare.com") {
            completionHandler(.useCredential, URLCredential(trust: serverTrust))
            return
        }
        #endif

        // Evaluate the trust chain using system root certificates
        var error: CFError?
        guard SecTrustEvaluateWithError(serverTrust, &error) else {
            #if DEBUG
            print("[SSL] Trust evaluation failed: \(error?.localizedDescription ?? "unknown")")
            #endif
            completionHandler(.cancelAuthenticationChallenge, nil)
            return
        }

        // Check if any certificate in the chain matches a pinned public key hash
        guard let certificateChain = SecTrustCopyCertificateChain(serverTrust) as? [SecCertificate] else {
            completionHandler(.cancelAuthenticationChallenge, nil)
            return
        }

        for certificate in certificateChain {
            guard let publicKey = SecCertificateCopyKey(certificate),
                  let publicKeyData = SecKeyCopyExternalRepresentation(publicKey, nil) as Data? else {
                continue
            }

            let hash = sha256Base64(data: publicKeyData)
            if pinnedKeyHashes.contains(hash) {
                completionHandler(.useCredential, URLCredential(trust: serverTrust))
                return
            }
        }

        #if DEBUG
        print("[SSL] Certificate pinning failed — no matching public key hash found")
        #endif
        completionHandler(.cancelAuthenticationChallenge, nil)
    }

    private func sha256Base64(data: Data) -> String {
        let hash = SHA256.hash(data: data)
        return Data(hash).base64EncodedString()
    }
}
