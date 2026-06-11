import Foundation

/// Removes temporary files that may contain personal health data (downloaded
/// documents, exported profiles, finished audio recordings) so they don't
/// linger in the app's temporary directory between uses.
enum TempFileCleanup {
    /// Removes the Quick Look download directory.
    static func removeQuickLookDirectory() {
        let dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("QuickLook", isDirectory: true)
        try? FileManager.default.removeItem(at: dir)
    }

    /// Sweeps stray temporary files at app launch. Safe here because no
    /// download, export, or recording can be in progress yet. Not run on
    /// backgrounding, which could pull a file out from under an open Quick Look
    /// preview or an in-flight share sheet.
    static func sweepAtLaunch() {
        let fm = FileManager.default
        let tmp = fm.temporaryDirectory

        removeQuickLookDirectory()

        // Exported health profiles written by ProfileViewModel.
        for name in ["health_profile.json", "health_profile.pdf"] {
            try? fm.removeItem(at: tmp.appendingPathComponent(name))
        }

        // Orphaned audio recordings (UUID.m4a) left by an interrupted upload.
        if let entries = try? fm.contentsOfDirectory(at: tmp, includingPropertiesForKeys: nil) {
            for url in entries where url.pathExtension.lowercased() == "m4a" {
                try? fm.removeItem(at: url)
            }
        }
    }
}
