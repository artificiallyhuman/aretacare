import Foundation
import CryptoKit

/// URLSession delegate that performs SSL public key pinning for production builds.
/// In DEBUG mode, localhost/127.0.0.1 connections bypass pinning for development.
final class CertificatePinningDelegate: NSObject, URLSessionDelegate, Sendable {
    // SHA-256 hashes of the SubjectPublicKeyInfo for aretacare.com certificates.
    //
    // To generate the hash for your certificate:
    //   openssl s_client -connect aretacare.com:443 -servername aretacare.com 2>/dev/null \
    //     | openssl x509 -pubkey -noout \
    //     | openssl pkey -pubin -outform der \
    //     | openssl dgst -sha256 -binary \
    //     | base64
    //
    // Include at least 2 hashes: one for the current certificate and one for a backup/CA
    // to avoid bricking the app when certificates rotate.
    //
    // TODO: Replace these placeholder hashes with actual production certificate hashes before App Store submission.
    private let pinnedKeyHashes: Set<String> = [
        // Primary leaf certificate public key hash
        "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=",
        // Backup / intermediate CA public key hash
        "CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC="
    ]

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
        // Skip pinning for localhost/simulator development
        let host = challenge.protectionSpace.host
        if host == "localhost" || host == "127.0.0.1" {
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
