import Foundation

/// Performs runtime device integrity checks to detect jailbroken/compromised devices.
/// Checks only run on real devices (simulator is always considered safe).
final class DeviceIntegrityChecker {

    /// Returns true if any integrity check fails, indicating the device may be compromised.
    var isCompromised: Bool {
        !compromiseReasons.isEmpty
    }

    /// Human-readable descriptions of all detected integrity issues.
    var compromiseReasons: [String] {
        #if targetEnvironment(simulator)
        return []
        #else
        var reasons: [String] = []

        if hasSuspiciousFiles {
            reasons.append("Suspicious files detected (common jailbreak artifacts)")
        }
        if canWriteOutsideSandbox {
            reasons.append("App can write outside sandbox")
        }
        if isDebuggerAttached {
            reasons.append("Debugger attached")
        }

        #if DEBUG
        if !reasons.isEmpty {
            print("[DeviceIntegrity] Compromise reasons: \(reasons)")
        }
        #endif

        return reasons
        #endif
    }

    // MARK: - Checks

    #if !targetEnvironment(simulator)

    /// Check for common files and paths associated with jailbreaking tools.
    private var hasSuspiciousFiles: Bool {
        let suspiciousPaths = [
            "/Applications/Cydia.app",
            "/usr/sbin/sshd",
            "/etc/apt",
            "/usr/bin/ssh",
            "/private/var/lib/apt/",
            "/Library/MobileSubstrate/MobileSubstrate.dylib",
            "/bin/bash",
            "/usr/libexec/sftp-server",
            "/var/log/syslog",
            "/private/var/stash"
        ]
        return suspiciousPaths.contains { FileManager.default.fileExists(atPath: $0) }
    }

    /// Attempt to write a file outside the app sandbox. On a non-jailbroken device this
    /// will be denied by the kernel sandbox.
    private var canWriteOutsideSandbox: Bool {
        let testPath = "/private/jailbreak_test_\(UUID().uuidString).txt"
        do {
            try "test".write(toFile: testPath, atomically: true, encoding: .utf8)
            // If write succeeded, clean up and report compromised
            try? FileManager.default.removeItem(atPath: testPath)
            return true
        } catch {
            return false
        }
    }

    /// Check for an attached debugger via sysctl. A debugger attached in production
    /// may indicate runtime tampering.
    private var isDebuggerAttached: Bool {
        var info = kinfo_proc()
        var size = MemoryLayout<kinfo_proc>.stride
        var mib: [Int32] = [CTL_KERN, KERN_PROC, KERN_PROC_PID, getpid()]
        let result = sysctl(&mib, UInt32(mib.count), &info, &size, nil, 0)
        guard result == 0 else { return false }
        return (info.kp_proc.p_flag & P_TRACED) != 0
    }

    #endif
}
