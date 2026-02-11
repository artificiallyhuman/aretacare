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

                    VStack(spacing: 4) {
                        // Progress slider
                        Slider(value: $progress, in: 0...max(duration, 1)) { editing in
                            if !editing {
                                seek(to: progress)
                            }
                        }

                        // Time labels
                        HStack {
                            Text(formatTime(progress))
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                            Spacer()
                            Text(formatTime(duration))
                                .font(.caption2)
                                .foregroundStyle(.secondary)
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
        }

        isLoading = false
    }

    private func togglePlayback() {
        guard let player else { return }

        if isPlaying {
            player.pause()
        } else {
            try? AVAudioSession.sharedInstance().setCategory(.playback)
            try? AVAudioSession.sharedInstance().setActive(true)
            player.play()
        }
        isPlaying.toggle()
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
        try? AVAudioSession.sharedInstance().setActive(false)
    }

    private func formatTime(_ seconds: Double) -> String {
        guard !seconds.isNaN && seconds.isFinite else { return "0:00" }
        let mins = Int(seconds) / 60
        let secs = Int(seconds) % 60
        return String(format: "%d:%02d", mins, secs)
    }
}
