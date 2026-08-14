import AVFoundation
import Observation

@Observable @MainActor
final class AudioRecorderManager: NSObject, AVAudioRecorderDelegate {
    private var audioRecorder: AVAudioRecorder?
    private var timer: Timer?
    private var onMaxDuration: (() -> Void)?
    private var stopContinuation: CheckedContinuation<Data?, Never>?
    private var meterTickCount = 0

    private(set) var isRecording = false
    private(set) var isPaused = false
    private(set) var elapsedTime: TimeInterval = 0
    private(set) var audioLevel: Float = 0

    /// On-disk copy of the last finished recording. Retained until the caller
    /// confirms the upload landed — reading the bytes into memory and deleting
    /// the file immediately meant a background-task expiry mid-upload destroyed
    /// the only copy. The file is `.completeUnlessOpen`-protected and swept at
    /// next launch by `TempFileCleanup` if it is never claimed.
    private(set) var lastRecordingURL: URL?

    private var maxDuration: TimeInterval = AppConstants.maxRecordingDuration

    var formattedDuration: String {
        let mins = Int(elapsedTime) / 60
        let secs = Int(elapsedTime) % 60
        return String(format: "%02d:%02d", mins, secs)
    }

    func requestPermission() async -> Bool {
        await withCheckedContinuation { continuation in
            AVAudioApplication.requestRecordPermission { granted in
                continuation.resume(returning: granted)
            }
        }
    }

    func start(maxDuration: TimeInterval, onMaxDuration: @escaping () -> Void) {
        self.maxDuration = maxDuration
        self.onMaxDuration = onMaxDuration

        try? AudioSessionManager.shared.activateForRecording()

        let tempURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension(AppConstants.audioFileExtension)

        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: 44100.0,
            AVNumberOfChannelsKey: 1,
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
        ]

        guard let recorder = try? AVAudioRecorder(url: tempURL, settings: settings) else { return }
        recorder.delegate = self
        recorder.isMeteringEnabled = true
        recorder.record()

        // Protect the recording at rest. Use completeUnlessOpen (not complete)
        // so recording can continue if the device locks — the app has the audio
        // background mode.
        try? FileManager.default.setAttributes(
            [.protectionKey: FileProtectionType.completeUnlessOpen],
            ofItemAtPath: tempURL.path
        )

        audioRecorder = recorder
        isRecording = true
        isPaused = false
        elapsedTime = 0
        audioLevel = 0
        meterTickCount = 0
        setupInterruptionHandling()
        startTimer()
    }

    func pause() {
        audioRecorder?.pause()
        isPaused = true
        isRecording = false
        audioLevel = 0
        stopTimer()
    }

    func resume() {
        audioRecorder?.record()
        isPaused = false
        isRecording = true
        meterTickCount = 0
        startTimer()
    }

    /// Stops recording and waits for the file to be finalized before returning data.
    /// Times out after 3 seconds and reads directly from the file if the delegate doesn't fire.
    func stopAsync() async -> Data? {
        stopTimer()
        audioLevel = 0
        guard let recorder = audioRecorder else { return nil }
        let fileURL = recorder.url
        isRecording = false
        isPaused = false

        let result = await withTaskGroup(of: Data?.self) { group -> Data? in
            group.addTask { @MainActor in
                await withCheckedContinuation { continuation in
                    self.stopContinuation = continuation
                    recorder.stop()
                }
            }
            group.addTask {
                try? await Task.sleep(for: .seconds(3))
                return nil // sentinel for timeout
            }

            // Whichever finishes first wins
            if let first = await group.next() {
                group.cancelAll()
                if let data = first {
                    return data
                }
                // Timeout — read directly from file as fallback
                return try? Data(contentsOf: fileURL)
            }
            return nil
        }

        // If we timed out, the continuation may still be pending — resume it to avoid leak
        if let continuation = stopContinuation {
            stopContinuation = nil
            continuation.resume(returning: result)
        }
        audioRecorder = nil
        AudioSessionManager.shared.deactivate()

        // Keep the file until the caller confirms the upload succeeded, then
        // it calls `discardRecording()`. Deleting it here lost the recording
        // outright whenever the background assertion expired mid-upload.
        lastRecordingURL = fileURL

        return result
    }

    /// Deletes the retained on-disk recording. Call once the audio is safely
    /// uploaded, or when the user discards it.
    func discardRecording() {
        guard let url = lastRecordingURL else { return }
        lastRecordingURL = nil
        try? FileManager.default.removeItem(at: url)
    }

    /// Synchronous stop for cancel actions where data isn't needed.
    @discardableResult
    func stop() -> Data? {
        stopTimer()
        audioLevel = 0
        guard let recorder = audioRecorder else { return nil }
        let url = recorder.url
        recorder.stop()
        isRecording = false
        isPaused = false
        audioRecorder = nil

        AudioSessionManager.shared.deactivate()

        let data = try? Data(contentsOf: url)
        // Clean up temp recording file
        try? FileManager.default.removeItem(at: url)
        return data
    }

    private func startTimer() {
        meterTickCount = 0
        timer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            guard let self else { return }
            Task { @MainActor in
                self.meterTickCount += 1

                // Update audio level every tick (0.1s)
                self.audioRecorder?.updateMeters()
                let power = self.audioRecorder?.averagePower(forChannel: 0) ?? -160
                self.audioLevel = max(0, min(1, (power + 50) / 50))

                // Update elapsed time every 10 ticks (1s)
                if self.meterTickCount % 10 == 0 {
                    self.elapsedTime += 1
                    if self.elapsedTime >= self.maxDuration {
                        self.onMaxDuration?()
                    }
                }
            }
        }
    }

    private func stopTimer() {
        timer?.invalidate()
        timer = nil
    }

    private func setupInterruptionHandling() {
        AudioSessionManager.shared.onInterruptionBegan = { [weak self] in
            self?.pause()
        }
        AudioSessionManager.shared.onInterruptionEnded = { [weak self] shouldResume in
            if shouldResume {
                self?.resume()
            }
        }
    }

    // Delegate callback may arrive on a non-main thread, so dispatch to @MainActor
    // to safely access stopContinuation and other mutable state.
    nonisolated func audioRecorderDidFinishRecording(_ recorder: AVAudioRecorder, successfully flag: Bool) {
        let data: Data? = flag ? (try? Data(contentsOf: recorder.url)) : nil
        Task { @MainActor in
            audioRecorder = nil
            AudioSessionManager.shared.deactivate()

            if let continuation = stopContinuation {
                stopContinuation = nil
                continuation.resume(returning: data)
            } else {
                isRecording = false
                isPaused = false
            }
        }
    }
}
