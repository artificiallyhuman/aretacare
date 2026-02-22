import SwiftUI

struct AudioRecorderView: View {
    let sessionId: String
    let viewModel: AudioRecordingsViewModel

    @Environment(\.dismiss) private var dismiss
    @State private var recorder = AudioRecorderManager()
    @State private var showingPermissionAlert = false
    @State private var showingCancelConfirmation = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 32) {
                Spacer()

                // Waveform animation
                HStack(spacing: 6) {
                    ForEach(0..<5, id: \.self) { index in
                        WaveformBar(
                            isAnimating: recorder.isRecording,
                            delay: Double(index) * 0.1,
                            audioLevel: recorder.isRecording ? recorder.audioLevel : nil
                        )
                    }
                }
                .frame(height: 60)
                .accessibilityHidden(true)

                // Timer
                Text(recorder.formattedDuration)
                    .font(.system(size: 48, weight: .light, design: .monospaced))
                    .foregroundStyle(recorder.isRecording ? .primary : .secondary)
                    .accessibilityLabel("Recording time: \(recorder.formattedDuration)")

                // Max duration warning
                if recorder.elapsedTime > AppConstants.maxRecordingDuration - 60 {
                    Text("Less than 1 minute remaining")
                        .font(.caption)
                        .foregroundStyle(.orange)
                }

                Spacer()

                // Controls
                HStack(spacing: 40) {
                    if recorder.isRecording || recorder.isPaused {
                        // Pause / Resume
                        Button {
                            if recorder.isPaused {
                                recorder.resume()
                            } else {
                                recorder.pause()
                            }
                        } label: {
                            Image(systemName: recorder.isPaused ? "play.fill" : "pause.fill")
                                .contentTransition(.symbolEffect(.replace))
                                .font(.title2)
                                .frame(width: 56, height: 56)
                                .background(Color(.systemGray5))
                                .clipShape(Circle())
                        }
                        .accessibilityLabel(recorder.isPaused ? "Resume recording" : "Pause recording")
                    }

                    // Record / Stop
                    Button {
                        if recorder.isRecording || recorder.isPaused {
                            stopAndUpload()
                        } else {
                            startRecording()
                        }
                    } label: {
                        ZStack {
                            Circle()
                                .fill(Color.red)
                                .frame(width: 72, height: 72)

                            if recorder.isRecording || recorder.isPaused {
                                RoundedRectangle(cornerRadius: 4)
                                    .fill(.white)
                                    .frame(width: 24, height: 24)
                            } else {
                                Circle()
                                    .fill(.white)
                                    .frame(width: 28, height: 28)
                            }
                        }
                    }
                    .accessibilityLabel(recorder.isRecording || recorder.isPaused ? "Stop recording" : "Start recording")
                }

                Text(recorder.isRecording ? "Tap to stop" : (recorder.isPaused ? "Paused" : "Tap to record"))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)

                Spacer()
            }
            .padding()
            .navigationTitle("Record Audio")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        if recorder.isRecording || recorder.isPaused || recorder.elapsedTime > 0 {
                            showingCancelConfirmation = true
                        } else {
                            dismiss()
                        }
                    }
                }
            }
            .confirmationDialog("Discard Recording?", isPresented: $showingCancelConfirmation, titleVisibility: .visible) {
                Button("Discard", role: .destructive) {
                    recorder.stop()
                    dismiss()
                }
                Button("Keep Recording", role: .cancel) {}
            } message: {
                Text("Your recording will be lost if you leave now.")
            }
            .alert("Microphone Access Required", isPresented: $showingPermissionAlert) {
                Button("Open Settings") {
                    if let url = URL(string: UIApplication.openSettingsURLString) {
                        UIApplication.shared.open(url)
                    }
                }
                Button("Cancel", role: .cancel) { dismiss() }
            } message: {
                Text("Please allow microphone access in Settings to record audio.")
            }
        }
    }

    private func startRecording() {
        Task {
            let granted = await recorder.requestPermission()
            if granted {
                recorder.start(maxDuration: AppConstants.maxRecordingDuration) {
                    // Auto-stop after max duration
                    stopAndUpload()
                }
            } else {
                showingPermissionAlert = true
            }
        }
    }

    private func stopAndUpload() {
        Task {
            guard let audioData = await recorder.stopAsync() else { return }
            let filename = "recording_\(Date().apiDateString)_\(Int(Date().timeIntervalSince1970)).m4a"
            await viewModel.uploadRecording(sessionId: sessionId, audioData: audioData, filename: filename)
            dismiss()
        }
    }
}
