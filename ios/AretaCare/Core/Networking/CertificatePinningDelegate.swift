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
        "OER7+0HU06hZroWKjSjEkqFjo31AJ2PUoxXRLrCNtBk=",
        // Backup / intermediate CA public key hash
        "kIdp6NNEd8wsugYyyIYFsi1ylMCED3hZbSR8ZFsa/A4="
    ]

    /// The production API host — only this host requires certificate pinning.
    private static let productionHost = "api.aretacare.com"

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

        // Only enforce pin checking for the production API host.
        // Non-production hosts (e.g., staging) still pass trust evaluation above
        // but skip the pin check since their certificates rotate independently.
        if challenge.protectionSpace.host != Self.productionHost {
            completionHandler(.useCredential, URLCredential(trust: serverTrust))
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

            let hash = spkiHash(for: publicKey, rawKeyData: publicKeyData)
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

    /// Hashes the public key in SubjectPublicKeyInfo (SPKI) format to match openssl output.
    /// `SecKeyCopyExternalRepresentation` returns raw key bytes without the ASN.1 SPKI header.
    /// We prepend the appropriate header before hashing so the result matches:
    ///   openssl x509 -pubkey -noout | openssl pkey -pubin -outform der | sha256 | base64
    private func spkiHash(for key: SecKey, rawKeyData: Data) -> String {
        var spkiData = Data()

        // Determine key type and prepend the correct ASN.1 SPKI header
        if let attributes = SecKeyCopyAttributes(key) as? [CFString: Any],
           let keyType = attributes[kSecAttrKeyType] as? String,
           let keySize = attributes[kSecAttrKeySizeInBits] as? Int {
            if keyType == (kSecAttrKeyTypeRSA as String) {
                // RSA keys: SPKI header varies by key size
                switch keySize {
                case 2048:
                    spkiData.append(contentsOf: Self.rsa2048SPKIHeader)
                case 4096:
                    spkiData.append(contentsOf: Self.rsa4096SPKIHeader)
                default:
                    // Unsupported RSA size — fall back to raw hash
                    return sha256Base64(data: rawKeyData)
                }
            } else if keyType == (kSecAttrKeyTypeECSECPrimeRandom as String) {
                // EC P-256 key
                spkiData.append(contentsOf: Self.ecDSASecp256r1SPKIHeader)
            } else {
                return sha256Base64(data: rawKeyData)
            }
        } else {
            return sha256Base64(data: rawKeyData)
        }

        spkiData.append(rawKeyData)
        return sha256Base64(data: spkiData)
    }

    private func sha256Base64(data: Data) -> String {
        let hash = SHA256.hash(data: data)
        return Data(hash).base64EncodedString()
    }

    // ASN.1 DER headers for SubjectPublicKeyInfo wrapping.
    // These are fixed byte sequences defined by the ASN.1 structure for each key type.

    // RSA 2048: 30 82 01 22 30 0d 06 09 2a 86 48 86 f7 0d 01 01 01 05 00 03 82 01 0f 00
    private static let rsa2048SPKIHeader: [UInt8] = [
        0x30, 0x82, 0x01, 0x22, 0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86,
        0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00, 0x03, 0x82, 0x01, 0x0f, 0x00
    ]

    // RSA 4096: 30 82 02 22 30 0d 06 09 2a 86 48 86 f7 0d 01 01 01 05 00 03 82 02 0f 00
    private static let rsa4096SPKIHeader: [UInt8] = [
        0x30, 0x82, 0x02, 0x22, 0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86,
        0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00, 0x03, 0x82, 0x02, 0x0f, 0x00
    ]

    // EC P-256 (secp256r1): 30 59 30 13 06 07 2a 86 48 ce 3d 02 01 06 08 2a 86 48 ce 3d 03 01 07 03 42 00
    private static let ecDSASecp256r1SPKIHeader: [UInt8] = [
        0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02,
        0x01, 0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, 0x03,
        0x42, 0x00
    ]
}
