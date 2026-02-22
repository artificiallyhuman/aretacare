import SwiftUI

struct ConversationAudioRecorderView: View {
    let recorder: AudioRecorderManager
    var onCancel: () -> Void
    var onStop: (Data) -> Void

    @State private var sendTrigger = 0
    @State private var showingCancelConfirmation = false

    var body: some View {
        VStack(spacing: 0) {
            Divider()

            HStack(spacing: 16) {
                // Cancel button
                Button {
                    if recorder.isRecording || recorder.isPaused || recorder.elapsedTime > 0 {
                        showingCancelConfirmation = true
                    } else {
                        recorder.stop()
                        onCancel()
                    }
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.title2)
                        .foregroundStyle(.secondary)
                }
                .accessibilityLabel("Cancel recording")

                // Waveform
                HStack(spacing: 4) {
                    ForEach(0..<5, id: \.self) { index in
                        WaveformBar(
                            isAnimating: recorder.isRecording,
                            delay: Double(index) * 0.08,
                            audioLevel: recorder.isRecording ? recorder.audioLevel : nil
                        )
                    }
                }
                .frame(height: 32)
                .accessibilityHidden(true)

                // Timer
                Text(recorder.formattedDuration)
                    .font(.system(.body, design: .monospaced))
                    .foregroundStyle(recorder.isRecording ? Color.red : .secondary)
                    .frame(minWidth: 50)
                    .accessibilityLabel("Recording duration: \(recorder.formattedDuration)")

                Spacer()

                if recorder.isRecording || recorder.isPaused {
                    // Pause / Resume
                    Button {
                        if recorder.isPaused {
                            recorder.resume()
                        } else {
                            recorder.pause()
                        }
                    } label: {
                        Image(systemName: recorder.isPaused ? "play.circle.fill" : "pause.circle.fill")
                            .contentTransition(.symbolEffect(.replace))
                            .font(.title2)
                            .foregroundStyle(Color.accentColor)
                    }
                    .accessibilityLabel(recorder.isPaused ? "Resume recording" : "Pause recording")
                }

                // Stop and send
                Button {
                    stopAndSend()
                } label: {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.title)
                        .foregroundStyle(Color.accentColor)
                        .symbolEffect(.bounce, value: sendTrigger)
                }
                .accessibilityLabel("Stop recording and send")
                .sensoryFeedback(.success, trigger: sendTrigger)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(Color(.systemBackground))
            .confirmationDialog("Discard Recording?", isPresented: $showingCancelConfirmation, titleVisibility: .visible) {
                Button("Discard", role: .destructive) {
                    recorder.stop()
                    onCancel()
                }
                Button("Keep Recording", role: .cancel) {}
            } message: {
                Text("Your recording will be lost if you cancel now.")
            }
        }
    }

    private func stopAndSend() {
        Task {
            guard let audioData = await recorder.stopAsync() else { return }
            sendTrigger += 1
            onStop(audioData)
        }
    }
}
