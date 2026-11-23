import SwiftUI

struct AudioRecorderView: View {
    let sessionId: String
    let viewModel: AudioRecordingsViewModel

    @Environment(\.dismiss) private var dismiss
    @State private var recorder = AudioRecorderManager()
    @State private var showingPermissionAlert = false
    @State private var showingStartFailedAlert = false
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

                // Some states require everyone's consent to be recorded (Terms §10).
                Text("Recording someone else? Get their OK first. Some states require it.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)

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
            .alert("Couldn't Start Recording", isPresented: $showingStartFailedAlert) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(AudioRecorderManager.startFailedMessage)
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
        // Swiping the sheet away mid-recording skipped Cancel's confirmation and never
        // stopped the recorder: the microphone kept capturing with nothing on screen.
        .interactiveDismissDisabled(isUploading || recorder.isRecording || recorder.isPaused)
        .onDisappear {
            // Anything else that removes the sheet (signing out) ends the recording too.
            // A no-op once Stop or Discard has finished it.
            recorder.stop()
        }
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
                let started = recorder.start(maxDuration: AppConstants.maxRecordingDuration) {
                    // Auto-stop after max duration
                    stopAndUpload()
                }
                if !started { showingStartFailedAlert = true }
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
            let file = recorder.takeRecordingFile()
            let filename = "recording_\(Date().apiDateString)_\(Int(Date().timeIntervalSince1970)).m4a"
            // The file is held on the device for the whole upload, so neither a failure nor
            // iOS ending the app mid-upload loses it. If the upload fails, the Audio
            // Recordings screen under this sheet lists it with Upload and Discard, next to
            // the upload error.
            _ = await PendingRecordingStore.shared.upload(file: file, sessionId: sessionId, filename: filename) {
                await viewModel.uploadRecording(sessionId: sessionId, audioData: audioData, filename: filename)
            }
            dismiss()
        }
    }
}
