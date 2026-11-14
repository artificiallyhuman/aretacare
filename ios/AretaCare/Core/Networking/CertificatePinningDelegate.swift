import Foundation
import CryptoKit

/// URLSession delegate that performs SSL public key pinning for production builds.
/// In DEBUG mode, localhost/127.0.0.1 connections bypass pinning for development.
final class CertificatePinningDelegate: NSObject, URLSessionDelegate, Sendable {
    // What is pinned, and why: the ROOT keys of every certificate authority Cloudflare may
    // issue api.aretacare.com's edge certificate from — not the leaf, not an intermediate.
    //
    // The edge certificate is Cloudflare Universal SSL. It renews about every 90 days with a
    // new key, and Cloudflare picks the authority (Google Trust Services, Let's Encrypt,
    // SSL.com, or Sectigo for its backup certificates) and may switch "without prior
    // notification" (developers.cloudflare.com/ssl/reference/certificate-authorities/).
    // Pinning fails closed, so a pin on the leaf or on one intermediate eventually locks
    // every installed copy of the app out of the API until people update. Root keys last
    // decades and still exclude every other authority.
    //
    // A connection passes when any certificate in the chain iOS built and trusted carries
    // one of these keys. Cross-signed copies of a root carry the root's key, so they match
    // too (the GTS Root R4 that Cloudflare sends today is the copy GlobalSign signed).
    //
    // Hashes are base64 SHA-256 of the DER SubjectPublicKeyInfo. Reproduce one from the
    // macOS trust store:
    //   security find-certificate -c "GTS Root R4" -p \
    //       /System/Library/Keychains/SystemRootCertificates.keychain \
    //     | openssl x509 -pubkey -noout | openssl pkey -pubin -outform der \
    //     | openssl dgst -sha256 -binary | base64
    // or for the certificates the server sends now (add -showcerts, take each block):
    //   openssl s_client -connect api.aretacare.com:443 -servername api.aretacare.com
    //
    // When to change this list: only if Cloudflare adds an authority, or one of these roots
    // is retired. Add the new root here and ship that build well before the server can be
    // issued from it (App Store adoption takes weeks). Leaf and intermediate renewals need
    // no app change. If Cloudflare's Advanced Certificate Manager is ever used to fix the
    // authority, the list can shrink to that one family.
    private static let pinnedKeyHashes: Set<String> = [
        // Google Trust Services (Cloudflare's current issuer: WE1 under GTS Root R4 for ECDSA,
        // WR1 under GTS Root R1 for RSA)
        "hxqRlPTu1bMS/0DITB1SSu0vd4u/8l8TjPgfaAp63Gc=", // GTS Root R1 (RSA 4096)
        "Vfd95BwDeSQo+NUYxVEEIlvkOlWY2SalKK1lPhzOx78=", // GTS Root R2 (RSA 4096)
        "QXnt2YHvdHR3tJYmQIr0Paosp6t/nggsEGD4QJZ3Q0g=", // GTS Root R3 (P-384)
        "mEflZT5enoR1FuXLgYYGqnVEoZvmf9c2bVBpiOjYQ0c=", // GTS Root R4 (P-384)
        // Let's Encrypt
        "C5+lpZ7tcVwmwQIMcRtPbsQtWLABXhQzejna0wHFr8M=", // ISRG Root X1 (RSA 4096)
        "diGVwiVYbubAI3RW4hB9xU8e/CH2GnkuvVFZE8zmgzI=", // ISRG Root X2 (P-384)
        // Let's Encrypt's 2025 roots. Live chains already run through them (Root YE is
        // cross-signed by X2, Root YR by X1); once Apple trusts them directly, X1/X2 can
        // drop out of the chain. Hashes from letsencrypt.org/certs/gen-y/.
        "sCkq5UWXjg+7mKu9lMhhYF5bGLsy7VI/UNW3tccdR7w=", // Root YE (P-384)
        "fk6IOKit1ild5647BH06ujSIq5XbCgqlbYl6ANhhi88=", // Root YR (RSA 4096)
        // SSL.com
        "K89VOmb1cJAN3TK6bf4ezAbJGC1mLcG2Dh97dnwr3VQ=", // SSL.com TLS RSA Root CA 2022 (RSA 4096)
        "G/ANXI8TwJTdF+AFBM8IiIUPEv0Gf6H5LA/b9guG4yE=", // SSL.com TLS ECC Root CA 2022 (P-384)
        "0cRTd+vc1hjNFlHcLgLCHXUeWqn80bNDH/bs9qMTSPo=", // SSL.com Root Certification Authority RSA (RSA 4096)
        "oyD01TTXvpfBro3QSZc1vIlcMjrdLTiL/M9mLCPX+Zo=", // SSL.com Root Certification Authority ECC (P-384)
        // Sectigo (Cloudflare backup certificates)
        "Douxi77vs4G+Ib/BogbTFymEYq0QSFXwSgVCaZcI09Q=", // Sectigo Public Server Authentication Root R46 (RSA 4096)
        "sLVjNUaFYfW7n6EtgBeEpjOlcnBdNPMrZDRF36iwBdE=", // Sectigo Public Server Authentication Root E46 (P-384)
        "x4QzPSC810K5/cMjb05Qm4k3Bw5zBn4lTdO/nEW/Td4=", // USERTrust RSA Certification Authority (RSA 4096)
        "ICGRfpgmOUXIWcQ/HXPLQTkFPEFPoDyjvH7ohhQpjzs=", // USERTrust ECC Certification Authority (P-384)
        // AAA Certificate Services (Sectigo, RSA 2048): Cloudflare's SSL.com intermediates are
        // cross-signed by it directly, so such a chain may carry no SSL.com root key at all.
        "vRU+17BDT2iGsXvOi76E7TQMcTLXAqj0+jGPdW7L1vM=",
    ]

    /// The production API host — only this host requires certificate pinning.
    private static let productionHost = "api.aretacare.com"

    override init() {
        super.init()
        // A malformed entry would silently never match; a wrong-but-valid one is caught by
        // the first request. Static data, so this trips on the first launch of any build.
        for pin in Self.pinnedKeyHashes where Data(base64Encoded: pin)?.count != 32 {
            fatalError("Certificate pin \"\(pin)\" is not a base64 SHA-256 hash — see CertificatePinningDelegate.swift.")
        }
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
            if Self.pinnedKeyHashes.contains(hash) {
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
                // EC keys: the header names the curve. Most pinned roots are P-384.
                switch keySize {
                case 256:
                    spkiData.append(contentsOf: Self.ecDSASecp256r1SPKIHeader)
                case 384:
                    spkiData.append(contentsOf: Self.ecDSASecp384r1SPKIHeader)
                default:
                    return sha256Base64(data: rawKeyData)
                }
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

    // EC P-384 (secp384r1): 30 76 30 10 06 07 2a 86 48 ce 3d 02 01 06 05 2b 81 04 00 22 03 62 00
    private static let ecDSASecp384r1SPKIHeader: [UInt8] = [
        0x30, 0x76, 0x30, 0x10, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02,
        0x01, 0x06, 0x05, 0x2b, 0x81, 0x04, 0x00, 0x22, 0x03, 0x62, 0x00
    ]
}
