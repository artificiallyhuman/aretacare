import SwiftUI

struct AudioRecorderView: View {
    let sessionId: String
    let viewModel: AudioRecordingsViewModel

    @Environment(\.dismiss) private var dismiss
    @State private var recorder = AudioRecorderManager()
    @State private var showingPermissionAlert = false
    @State private var showingCancelConfirmation = false
    @State private var isUploading = false

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
                    .font(.system(.largeTitle, design: .monospaced).weight(.light))
                    .foregroundStyle(recorder.isRecording ? .primary : .secondary)
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)
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
                        .disabled(isUploading)
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
                    .disabled(isUploading)
                }

                Text(statusCaption)
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
                    .disabled(isUploading)
                }
            }
            .confirmationDialog("Discard Recording?", isPresented: $showingCancelConfirmation, titleVisibility: .visible) {
                Button("Discard", role: .destructive) {
                    recorder.stop()
                    recorder.discardRecording()
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
        // The upload returns once the recording is persisted (transcription
        // continues server-side) — without this the sheet sits on the idle
        // recorder and looks like nothing happened.
        .overlay {
            if isUploading {
                UploadingOverlay(
                    message: "Uploading…",
                    accessibilityLabel: "Uploading your recording"
                )
            }
        }
        .interactiveDismissDisabled(isUploading)
    }

    private var statusCaption: String {
        if isUploading { return "Uploading…" }
        if recorder.isRecording { return "Tap to stop" }
        return recorder.isPaused ? "Paused" : "Tap to record"
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
        guard !isUploading else { return }
        isUploading = true
        Task {
            defer { isUploading = false }
            guard let audioData = await recorder.stopAsync() else { return }
            let filename = "recording_\(Date().apiDateString)_\(Int(Date().timeIntervalSince1970)).m4a"
            // Hold the on-disk copy until the upload lands, so a suspended app
            // doesn't take the recording with it.
            if await viewModel.uploadRecording(sessionId: sessionId, audioData: audioData, filename: filename) {
                recorder.discardRecording()
            }
            dismiss()
        }
    }
}
