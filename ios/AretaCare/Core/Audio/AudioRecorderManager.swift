import AVFoundation
import Observation

@Observable @MainActor
final class AudioRecorderManager: NSObject, AVAudioRecorderDelegate {
    private var audioRecorder: AVAudioRecorder?
    private var timer: Timer?
    private var onMaxDuration: (() -> Void)?
    private var stopContinuation: CheckedContinuation<Data?, Never>?

    private(set) var isRecording = false
    private(set) var isPaused = false
    private(set) var elapsedTime: TimeInterval = 0

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

        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker])
        try? session.setActive(true)

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
        recorder.record()

        audioRecorder = recorder
        isRecording = true
        isPaused = false
        elapsedTime = 0
        startTimer()
    }

    func pause() {
        audioRecorder?.pause()
        isPaused = true
        isRecording = false
        stopTimer()
    }

    func resume() {
        audioRecorder?.record()
        isPaused = false
        isRecording = true
        startTimer()
    }

    /// Stops recording and waits for the file to be finalized before returning data.
    func stopAsync() async -> Data? {
        stopTimer()
        guard let recorder = audioRecorder else { return nil }
        isRecording = false
        isPaused = false

        return await withCheckedContinuation { continuation in
            stopContinuation = continuation
            recorder.stop()
        }
    }

    /// Synchronous stop for cancel actions where data isn't needed.
    @discardableResult
    func stop() -> Data? {
        stopTimer()
        guard let recorder = audioRecorder else { return nil }
        let url = recorder.url
        recorder.stop()
        isRecording = false
        isPaused = false
        audioRecorder = nil

        try? AVAudioSession.sharedInstance().setActive(false)

        return try? Data(contentsOf: url)
    }

    private func startTimer() {
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            guard let self else { return }
            Task { @MainActor in
                self.elapsedTime += 1
                if self.elapsedTime >= self.maxDuration {
                    self.onMaxDuration?()
                }
            }
        }
    }

    private func stopTimer() {
        timer?.invalidate()
        timer = nil
    }

    // Delegate callback may arrive on a non-main thread, so dispatch to @MainActor
    // to safely access stopContinuation and other mutable state.
    nonisolated func audioRecorderDidFinishRecording(_ recorder: AVAudioRecorder, successfully flag: Bool) {
        let data: Data? = flag ? (try? Data(contentsOf: recorder.url)) : nil
        Task { @MainActor in
            audioRecorder = nil
            try? AVAudioSession.sharedInstance().setActive(false)

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
