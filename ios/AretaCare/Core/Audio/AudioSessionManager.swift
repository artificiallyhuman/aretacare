import AVFoundation
import Observation

@Observable @MainActor
final class AudioSessionManager {
    static let shared = AudioSessionManager()

    private(set) var isInterrupted = false
    private var interruptionObserver: NSObjectProtocol?

    enum AudioMode {
        case idle
        case recording
        case playback
    }

    private(set) var currentMode: AudioMode = .idle

    var onInterruptionBegan: (() -> Void)?
    var onInterruptionEnded: ((_ shouldResume: Bool) -> Void)?

    private init() {
        setupInterruptionObserver()
    }

    func activateForRecording() throws {
        try AVAudioSession.sharedInstance().setCategory(
            .playAndRecord, mode: .default, options: [.defaultToSpeaker]
        )
        try AVAudioSession.sharedInstance().setActive(true)
        currentMode = .recording
        isInterrupted = false
    }

    func activateForPlayback() throws {
        try AVAudioSession.sharedInstance().setCategory(.playback)
        try AVAudioSession.sharedInstance().setActive(true)
        currentMode = .playback
        isInterrupted = false
    }

    func deactivate() {
        try? AVAudioSession.sharedInstance().setActive(
            false, options: .notifyOthersOnDeactivation
        )
        currentMode = .idle
        isInterrupted = false
        NowPlayingManager.shared.clearNowPlayingInfo()
    }

    private func setupInterruptionObserver() {
        interruptionObserver = NotificationCenter.default.addObserver(
            forName: AVAudioSession.interruptionNotification,
            object: AVAudioSession.sharedInstance(),
            queue: nil
        ) { [weak self] notification in
            Task { @MainActor [weak self] in
                self?.handleInterruption(notification)
            }
        }
    }

    private func handleInterruption(_ notification: Notification) {
        guard let info = notification.userInfo,
              let typeValue = info[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: typeValue) else { return }

        switch type {
        case .began:
            isInterrupted = true
            onInterruptionBegan?()
        case .ended:
            isInterrupted = false
            let shouldResume: Bool
            if let optionsValue = info[AVAudioSessionInterruptionOptionKey] as? UInt {
                shouldResume = AVAudioSession.InterruptionOptions(rawValue: optionsValue)
                    .contains(.shouldResume)
            } else {
                shouldResume = false
            }
            onInterruptionEnded?(shouldResume)
        @unknown default:
            break
        }
    }
}
