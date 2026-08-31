import SwiftUI

struct ConversationCoachView: View {
    let sessionId: String
    var sessionName: String = ""
    var isGuestMode: Bool = false

    @State private var viewModel = ToolsViewModel()
    @State private var situation = ""
    @State private var copyTrigger = 0

    // Audio recording state
    @State private var isRecordingAudio = false
    @State private var audioRecorder = AudioRecorderManager()
    @State private var isTranscribing = false
    @State private var showingMicPermissionAlert = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                // Hero header
                VStack(spacing: 12) {
                    Image(systemName: "bubble.left.and.text.bubble.right")
                        .font(.title)
                        .foregroundStyle(.white)
                        .frame(width: 60, height: 60)
                        .background(Circle().fill(Color.accentColor.gradient))
                        .accessibilityHidden(true)

                    Text("Prepare for healthcare conversations with personalized coaching tips.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 4)

                // Medical disclaimer
                HStack(spacing: 8) {
                    Image(systemName: "info.circle")
                        .foregroundStyle(.orange)
                        .font(.caption)
                    Text("Suggestions are for preparation purposes only and are not medical advice.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding(10)
                .background(
                    RoundedRectangle(cornerRadius: 8)
                        .fill(Color.orange.opacity(0.08))
                )

                // Input
                VStack(alignment: .leading, spacing: 12) {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Text("Situation")
                                .font(.subheadline.weight(.medium))
                            Spacer()
                            if !isGuestMode && isTranscribing {
                                HStack(spacing: 4) {
                                    ProgressView()
                                        .controlSize(.small)
                                    Text("Transcribing...")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }

                        TextEditor(text: $situation)
                            .frame(minHeight: 100)
                            .padding(8)
                            .overlay(
                                RoundedRectangle(cornerRadius: 8)
                                    .stroke(Color(.separator), lineWidth: 0.5)
                            )
                            .overlay(alignment: .topLeading) {
                                if situation.isEmpty {
                                    Text("e.g., I have an upcoming appointment with my oncologist to discuss treatment options...")
                                        .font(.body)
                                        .foregroundStyle(.tertiary)
                                        .padding(.horizontal, 12)
                                        .padding(.vertical, 16)
                                        .allowsHitTesting(false)
                                }
                            }
                            .disabled(isTranscribing)
                    }

                    // Audio recording for voice input (hidden in guest mode)
                    if !isGuestMode && isRecordingAudio {
                        HStack(spacing: 12) {
                            Circle()
                                .fill(Color.red)
                                .frame(width: 10, height: 10)

                            HStack(spacing: 4) {
                                ForEach(0..<5, id: \.self) { index in
                                    WaveformBar(isAnimating: audioRecorder.isRecording, delay: Double(index) * 0.08)
                                }
                            }
                            .frame(height: 24)

                            Text(audioRecorder.formattedDuration)
                                .font(.system(.caption, design: .monospaced))
                                .foregroundStyle(.secondary)

                            if audioRecorder.elapsedTime > AppConstants.maxRecordingDuration - 60 {
                                Text("< 1 min left")
                                    .font(.caption2)
                                    .foregroundStyle(.orange)
                            }

                            Spacer()

                            Button {
                                stopRecordingAndTranscribe()
                            } label: {
                                Image(systemName: "stop.circle.fill")
                                    .font(.title2)
                                    .foregroundStyle(Color.red)
                            }

                            Button {
                                audioRecorder.stop()
                                isRecordingAudio = false
                            } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .font(.title2)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .padding(10)
                        .background(Color(.tertiarySystemBackground))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                    }

                    HStack(spacing: 12) {
                        if !isGuestMode && !isRecordingAudio {
                            Button {
                                startRecording()
                            } label: {
                                Label("Record", systemImage: "mic.fill")
                            }
                            .buttonStyle(.bordered)
                            .disabled(viewModel.isCoaching || isTranscribing)
                        }

                        Button {
                            Task {
                                await viewModel.getCoaching(situation: situation, sessionId: sessionId)
                            }
                        } label: {
                            if viewModel.isCoaching {
                                ProgressView()
                                    .frame(maxWidth: .infinity)
                            } else {
                                Text("Get Coaching")
                                    .frame(maxWidth: .infinity)
                            }
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(situation.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || viewModel.isCoaching || isRecordingAudio || isTranscribing)
                    }
                }
                .disabled(viewModel.isCoaching)
                .padding()
                .background(Color(.secondarySystemGroupedBackground))
                .clipShape(RoundedRectangle(cornerRadius: 12))

                // Result
                if let result = viewModel.coachingResult {
                    VStack(alignment: .leading, spacing: 0) {
                        Color.accentColor.frame(height: 3)

                        VStack(alignment: .leading, spacing: 12) {
                            HStack {
                                Image(systemName: "bubble.left.and.text.bubble.right")
                                    .foregroundStyle(Color.accentColor)
                                Text("Coaching Advice")
                                    .font(.headline)
                                Spacer()
                                Button {
                                    ClipboardHelper.copyPlain(result)
                                    copyTrigger += 1
                                } label: {
                                    Image(systemName: "doc.on.doc")
                                        .font(.subheadline)
                                        .foregroundStyle(Color.accentColor)
                                }
                            }

                            Divider()

                            MarkdownTextView(content: result)
                        }
                        .padding()
                    }
                    .background(Color(.secondarySystemGroupedBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 12))

                    Text("Sources are AI-generated and may not link to the exact page. Verify information with your healthcare provider.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                // Error
                if let error = viewModel.errorMessage {
                    ErrorBannerView(message: error) { viewModel.dismissError() }
                }
            }
            .padding()
            .frame(maxWidth: 700)
            .frame(maxWidth: .infinity)
        }
        .sensoryFeedback(.success, trigger: copyTrigger)
        .alert("Microphone Access Required", isPresented: $showingMicPermissionAlert) {
            Button("Open Settings") {
                if let url = URL(string: UIApplication.openSettingsURLString) {
                    UIApplication.shared.open(url)
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Please allow microphone access in Settings to record audio.")
        }
        .navigationBarTitleDisplayMode(.inline)
        .onDisappear {
            // The transcription poll can wait for minutes; don't leave it
            // running (with its spinner state) after the user navigates away
            viewModel.cancelTranscription()
        }
        .toolbar {
            ToolbarItem(placement: .principal) {
                VStack(spacing: 1) {
                    Text("Conversation Coach")
                        .font(.headline)
                    if !sessionName.isEmpty {
                        Text(sessionName)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
            }
        }
    }

    // MARK: - Audio Recording

    private func startRecording() {
        Task {
            let granted = await audioRecorder.requestPermission()
            if granted {
                isRecordingAudio = true
                audioRecorder.start(maxDuration: AppConstants.maxRecordingDuration) {
                    stopRecordingAndTranscribe()
                }
            } else {
                showingMicPermissionAlert = true
            }
        }
    }

    private func stopRecordingAndTranscribe() {
        Task {
            // stopAsync waits for AVFoundation to finalize the file and retains
            // it until the transcription lands. The sync stop() read the file
            // immediately (sometimes before the moov atom was written) and
            // deleted it, so a failed upload lost the recording outright.
            guard let audioData = await audioRecorder.stopAsync() else {
                isRecordingAudio = false
                return
            }
            isRecordingAudio = false
            isTranscribing = true

            if let transcription = await viewModel.transcribeAudio(data: audioData, sessionId: sessionId) {
                if situation.isEmpty {
                    situation = transcription
                } else {
                    situation += " " + transcription
                }
                audioRecorder.discardRecording()
            }
            isTranscribing = false
        }
    }
}
