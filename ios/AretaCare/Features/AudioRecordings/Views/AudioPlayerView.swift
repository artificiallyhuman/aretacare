import SwiftUI
import AVFoundation

struct AudioPlayerView: View {
    let sessionId: String
    let recordingId: Int
    let viewModel: AudioRecordingsViewModel

    @State private var player: AVPlayer?
    @State private var isPlaying = false
    @State private var progress: Double = 0
    @State private var duration: Double = 0
    @State private var isLoading = true
    @State private var timeObserver: Any?

    var body: some View {
        VStack(spacing: 12) {
            if isLoading {
                ProgressView()
                    .frame(height: 44)
            } else {
                HStack(spacing: 16) {
                    // Play/Pause
                    Button {
                        togglePlayback()
                    } label: {
                        Image(systemName: isPlaying ? "pause.circle.fill" : "play.circle.fill")
                            .font(.system(size: 40))
                            .foregroundStyle(Color.accentColor)
                    }
                    .accessibilityLabel(isPlaying ? "Pause" : "Play")

                    VStack(spacing: 4) {
                        // Progress slider
                        Slider(value: $progress, in: 0...max(duration, 1)) { editing in
                            if !editing {
                                seek(to: progress)
                            }
                        }
                        .accessibilityLabel("Playback position")

                        // Time labels
                        HStack {
                            Text(formatTime(progress))
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                                .accessibilityHidden(true)
                            Spacer()
                            Text(formatTime(duration))
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                                .accessibilityHidden(true)
                        }
                    }
                }
            }
        }
        .task {
            await loadAudio()
        }
        .onDisappear {
            cleanup()
        }
    }

    private func loadAudio() async {
        guard let url = await viewModel.getAudioUrl(sessionId: sessionId, recordingId: recordingId) else {
            isLoading = false
            return
        }

        let playerItem = AVPlayerItem(url: url)
        let avPlayer = AVPlayer(playerItem: playerItem)
        player = avPlayer

        // Get duration
        if let asset = try? await playerItem.asset.load(.duration) {
            duration = CMTimeGetSeconds(asset)
        }

        // Observe time
        let interval = CMTime(seconds: 0.5, preferredTimescale: 600)
        timeObserver = avPlayer.addPeriodicTimeObserver(forInterval: interval, queue: .main) { time in
            let currentTime = CMTimeGetSeconds(time)
            if !currentTime.isNaN {
                progress = currentTime
                if isPlaying {
                    NowPlayingManager.shared.updateNowPlayingInfo(
                        title: "Audio Recording",
                        duration: duration,
                        currentTime: currentTime,
                        isPlaying: true
                    )
                }
            }
        }

        // Observe end
        NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: playerItem,
            queue: .main
        ) { _ in
            isPlaying = false
            progress = 0
            avPlayer.seek(to: .zero)
            NowPlayingManager.shared.updateNowPlayingInfo(
                title: "Audio Recording",
                duration: duration,
                currentTime: 0,
                isPlaying: false
            )
        }

        isLoading = false
    }

    private func togglePlayback() {
        guard let player else { return }

        if isPlaying {
            player.pause()
            isPlaying = false
            NowPlayingManager.shared.updateNowPlayingInfo(
                title: "Audio Recording",
                duration: duration,
                currentTime: progress,
                isPlaying: false
            )
        } else {
            try? AudioSessionManager.shared.activateForPlayback()
            setupNowPlaying()
            player.play()
            isPlaying = true
            NowPlayingManager.shared.updateNowPlayingInfo(
                title: "Audio Recording",
                duration: duration,
                currentTime: progress,
                isPlaying: true
            )
        }
    }

    private func setupNowPlaying() {
        NowPlayingManager.shared.registerRemoteCommands()
        NowPlayingManager.shared.onPlay = { [self] in
            if !isPlaying { togglePlayback() }
        }
        NowPlayingManager.shared.onPause = { [self] in
            if isPlaying { togglePlayback() }
        }
        NowPlayingManager.shared.onTogglePlayPause = { [self] in
            togglePlayback()
        }

        AudioSessionManager.shared.onInterruptionBegan = { [self] in
            if isPlaying {
                player?.pause()
                isPlaying = false
            }
        }
        AudioSessionManager.shared.onInterruptionEnded = { [self] shouldResume in
            if shouldResume && !isPlaying {
                player?.play()
                isPlaying = true
            }
        }
    }

    private func seek(to time: Double) {
        player?.seek(to: CMTime(seconds: time, preferredTimescale: 600))
    }

    private func cleanup() {
        player?.pause()
        if let observer = timeObserver {
            player?.removeTimeObserver(observer)
        }
        player = nil
        AudioSessionManager.shared.deactivate()
    }

    private func formatTime(_ seconds: Double) -> String {
        guard !seconds.isNaN && seconds.isFinite else { return "0:00" }
        let mins = Int(seconds) / 60
        let secs = Int(seconds) % 60
        return String(format: "%d:%02d", mins, secs)
    }
}
