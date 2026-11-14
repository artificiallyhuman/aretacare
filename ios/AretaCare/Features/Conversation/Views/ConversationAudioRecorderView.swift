import SwiftUI

struct ConversationAudioRecorderView: View {
    let recorder: AudioRecorderManager
    var onCancel: () -> Void
    /// Receives the recording and its on-disk file, which the caller deletes once the
    /// upload succeeds or keeps for a later upload if it fails.
    var onStop: (Data, URL?) async -> Void

    @State private var sendTrigger = 0
    @State private var showingCancelConfirmation = false

    var body: some View {
        VStack(spacing: 0) {
            Divider()

            // Some states require everyone's consent to be recorded (Terms §10).
            Text("Recording someone else? Get their OK first. Some states require it.")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 12)
                .padding(.top, 6)
                .background(Color(.systemBackground))

            HStack(spacing: 16) {
                // Cancel button
                Button {
                    if recorder.isRecording || recorder.isPaused || recorder.elapsedTime > 0 {
                        showingCancelConfirmation = true
                    } else {
                        recorder.stop()
                        recorder.discardRecording()
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
                    recorder.discardRecording()
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
            // Taken straight away: a second recording started while this one uploads
            // would otherwise replace it as the recorder's last file.
            let file = recorder.takeRecordingFile()
            sendTrigger += 1
            await onStop(audioData, file)
        }
    }
}
