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
    @State private var playbackRate: Float = 1.0

    private static let playbackRates: [Float] = [1.0, 1.25, 1.5, 2.0]

    var body: some View {
        VStack(spacing: 12) {
            if isLoading {
                ProgressView()
                    .frame(height: 44)
            } else {
                VStack(spacing: 8) {
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
                        Text("-\(formatTime(max(duration - progress, 0)))")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .accessibilityHidden(true)
                    }

                    // Playback controls
                    HStack(spacing: 24) {
                        // Skip backward 15s
                        Button {
                            skip(by: -15)
                        } label: {
                            Image(systemName: "gobackward.15")
                                .font(.title2)
                                .foregroundStyle(.primary)
                        }
                        .accessibilityLabel("Skip back 15 seconds")
                        .disabled(progress <= 0)

                        // Play/Pause
                        Button {
                            togglePlayback()
                        } label: {
                            Image(systemName: isPlaying ? "pause.circle.fill" : "play.circle.fill")
                                .contentTransition(.symbolEffect(.replace))
                                .font(.largeTitle)
                                .foregroundStyle(Color.accentColor)
                        }
                        .accessibilityLabel(isPlaying ? "Pause" : "Play")

                        // Skip forward 15s
                        Button {
                            skip(by: 15)
                        } label: {
                            Image(systemName: "goforward.15")
                                .font(.title2)
                                .foregroundStyle(.primary)
                        }
                        .accessibilityLabel("Skip forward 15 seconds")
                        .disabled(progress >= duration)
                    }

                    // Playback speed
                    HStack {
                        Spacer()
                        Button {
                            cyclePlaybackRate()
                        } label: {
                            Text(playbackRate == 1.0 ? "1x" : String(format: "%.2gx", playbackRate))
                                .font(.caption.weight(.semibold))
                                .padding(.horizontal, 10)
                                .padding(.vertical, 4)
                                .background(Color(.systemGray5))
                                .clipShape(Capsule())
                        }
                        .accessibilityLabel("Playback speed \(String(format: "%.2g", playbackRate))x")
                        .accessibilityHint("Double tap to change speed")
                        Spacer()
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
                self.progress = currentTime
                if self.isPlaying {
                    let dur = self.duration
                    let rate = self.playbackRate
                    MainActor.assumeIsolated {
                        NowPlayingManager.shared.updateNowPlayingInfo(
                            title: "Audio Recording",
                            duration: dur,
                            currentTime: currentTime,
                            isPlaying: true,
                            rate: rate
                        )
                    }
                }
            }
        }

        // Observe end
        NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: playerItem,
            queue: .main
        ) { _ in
            self.isPlaying = false
            self.progress = 0
            avPlayer.seek(to: .zero)
            let dur = self.duration
            MainActor.assumeIsolated {
                NowPlayingManager.shared.updateNowPlayingInfo(
                    title: "Audio Recording",
                    duration: dur,
                    currentTime: 0,
                    isPlaying: false
                )
            }
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
            player.rate = playbackRate
            isPlaying = true
            NowPlayingManager.shared.updateNowPlayingInfo(
                title: "Audio Recording",
                duration: duration,
                currentTime: progress,
                isPlaying: true,
                rate: playbackRate
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
        NowPlayingManager.shared.onSkipForward = { [self] in
            skip(by: 15)
        }
        NowPlayingManager.shared.onSkipBackward = { [self] in
            skip(by: -15)
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

    private func skip(by seconds: Double) {
        let newTime = min(max(progress + seconds, 0), duration)
        seek(to: newTime)
        progress = newTime
    }

    private func cyclePlaybackRate() {
        guard let currentIndex = Self.playbackRates.firstIndex(of: playbackRate) else {
            playbackRate = 1.0
            player?.rate = isPlaying ? 1.0 : 0
            return
        }
        let nextIndex = (currentIndex + 1) % Self.playbackRates.count
        playbackRate = Self.playbackRates[nextIndex]
        if isPlaying {
            player?.rate = playbackRate
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
