import SwiftUI

struct AudioRecordingsView: View {
    let sessionId: String

    @State private var viewModel = AudioRecordingsViewModel()
    @State private var showingRecorder = false
    @State private var selectedRecording: AudioRecordingResponse?
    @State private var selectedCategory: AudioCategory?
    @State private var showingDatePicker = false
    @State private var deleteHapticTrigger = 0

    private let currentUserId = AuthManager.shared.currentUser?.id ?? ""

    private var filteredRecordings: [AudioRecordingResponse] {
        guard let category = selectedCategory else { return viewModel.recordings }
        return viewModel.recordings.filter { $0.category == category.rawValue }
    }

    var body: some View {
        VStack(spacing: 0) {
            categoryFilter

            Group {
                if viewModel.isLoading && viewModel.recordings.isEmpty {
                    SkeletonListView()
                } else if viewModel.recordings.isEmpty {
                    EmptyStateView(
                        systemImage: "mic",
                        title: "No Audio Recordings",
                        subtitle: "Record voice memos about symptoms, appointments, or care notes."
                    )
                } else {
                    recordingsList
                }
            }
        }
        .navigationTitle("Audio Recordings")
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                if !viewModel.allDates.isEmpty {
                    Button {
                        showingDatePicker = true
                    } label: {
                        Image(systemName: "calendar")
                    }
                }
            }
            ToolbarItem(placement: .primaryAction) {
                Button {
                    showingRecorder = true
                } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .sheet(isPresented: $showingRecorder) {
            AudioRecorderView(sessionId: sessionId, viewModel: viewModel)
        }
        .sheet(item: $selectedRecording) { recording in
            NavigationStack {
                AudioRecordingDetailView(recording: recording, sessionId: sessionId, viewModel: viewModel)
            }
        }
        .sheet(isPresented: $showingDatePicker) {
            DateCalendarSheetView(
                sortedDates: viewModel.sortedDates,
                selectedDate: viewModel.selectedDateString,
                title: "Recording Dates",
                countLabel: { "\($0) \($0 == 1 ? "recording" : "recordings")" },
                onSelect: { dateInfo in
                    showingDatePicker = false
                    Task { await viewModel.jumpToDate(sessionId: sessionId, date: dateInfo.date) }
                },
                onDismiss: { showingDatePicker = false }
            )
        }
        .overlay {
            if viewModel.isUploading {
                UploadingOverlay()
            }
        }
        .sensoryFeedback(.impact(flexibility: .rigid), trigger: deleteHapticTrigger)
        .task {
            await viewModel.fetchRecordings(sessionId: sessionId)
            await viewModel.fetchDates(sessionId: sessionId)
        }
        .refreshable {
            await viewModel.fetchRecordings(sessionId: sessionId, date: viewModel.selectedDateString)
            await viewModel.fetchDates(sessionId: sessionId)
        }
    }

    private var categoryFilter: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                FilterChipView(title: "All", isSelected: selectedCategory == nil) {
                    selectedCategory = nil
                }

                ForEach(AudioCategory.allCases) { category in
                    FilterChipView(title: category.displayName, isSelected: selectedCategory == category) {
                        selectedCategory = category
                    }
                }
            }
            .padding(.horizontal)
            .padding(.vertical, 8)
        }
    }

    private var recordingsList: some View {
        VStack(spacing: 0) {
            if viewModel.isJumpedToDate {
                DateNavigatorBar(
                    selectedDateString: viewModel.selectedDateString,
                    canGoBack: viewModel.selectedDateString.flatMap { viewModel.previousDate(before: $0) } != nil,
                    canGoForward: viewModel.selectedDateString.flatMap { viewModel.nextDate(after: $0) } != nil,
                    isViewingLatest: viewModel.isViewingLatest,
                    onPrevious: {
                        if let current = viewModel.selectedDateString,
                           let older = viewModel.previousDate(before: current) {
                            Task { await viewModel.jumpToDate(sessionId: sessionId, date: older.date) }
                        }
                    },
                    onNext: {
                        if let current = viewModel.selectedDateString,
                           let newer = viewModel.nextDate(after: current) {
                            Task { await viewModel.jumpToDate(sessionId: sessionId, date: newer.date) }
                        }
                    },
                    onGoToLatest: {
                        Task { await viewModel.jumpToLatest(sessionId: sessionId) }
                    }
                )
            }

            List {
                ForEach(filteredRecordings) { recording in
                    Button {
                        selectedRecording = recording
                    } label: {
                        AudioRecordingRowView(recording: recording, sessionId: sessionId, viewModel: viewModel, currentUserId: currentUserId)
                    }
                    .onAppear {
                        if recording.id == viewModel.recordings.last?.id {
                            Task { await viewModel.loadMoreIfNeeded(sessionId: sessionId) }
                        }
                    }
                }
                .onDelete { offsets in
                    deleteHapticTrigger += 1
                    for index in offsets {
                        let rec = viewModel.recordings[index]
                        Task { await viewModel.deleteRecording(sessionId: sessionId, recordingId: rec.id) }
                    }
                }
            }
            .listStyle(.plain)
        }
    }
}

// MARK: - Row View

private struct AudioRecordingRowView: View {
    let recording: AudioRecordingResponse
    let sessionId: String
    let viewModel: AudioRecordingsViewModel
    let currentUserId: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: categoryIcon)
                .font(.title2)
                .foregroundStyle(Color.accentColor)
                .frame(width: 36)

            VStack(alignment: .leading, spacing: 4) {
                Text(recording.aiSummary ?? recording.filename)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(.primary)
                    .lineLimit(2)

                if let transcript = recording.transcribedText {
                    Text(transcript)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }

                HStack(spacing: 8) {
                    if let duration = recording.duration {
                        Text(formatDuration(duration))
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                    }

                    if let category = recording.category,
                       let cat = AudioCategory(rawValue: category) {
                        Text(cat.displayName)
                            .font(.caption2)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.accentColor.opacity(0.1))
                            .foregroundStyle(Color.accentColor)
                            .clipShape(Capsule())
                    }

                    Text(recording.createdAt.shortDateString)
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
            }

            Spacer()

            if let createdBy = recording.createdBy {
                SourceTagView(sourceTag: createdBy, currentUserId: currentUserId)
            }
        }
        .padding(.vertical, 4)
    }

    private var categoryIcon: String {
        if let category = recording.category,
           let cat = AudioCategory(rawValue: category) {
            return cat.systemImage
        }
        return "mic"
    }

    private func formatDuration(_ seconds: Double) -> String {
        let mins = Int(seconds) / 60
        let secs = Int(seconds) % 60
        return String(format: "%d:%02d", mins, secs)
    }
}

// MARK: - Detail View

private struct AudioRecordingDetailView: View {
    let recording: AudioRecordingResponse
    let sessionId: String
    let viewModel: AudioRecordingsViewModel

    @Environment(\.dismiss) private var dismiss
    @State private var showingDeleteConfirm = false
    @State private var editingCategory: AudioCategory?
    @State private var editingSummary: String = ""
    @State private var isEditing = false
    @State private var isSaving = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                // Player
                AudioPlayerView(sessionId: sessionId, recordingId: recording.id, viewModel: viewModel)
                    .padding()
                    .background(Color(.secondarySystemGroupedBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 12))

                // Metadata
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("Details")
                            .font(.headline)
                        Spacer()
                        if !isEditing {
                            Button {
                                editingCategory = recording.category.flatMap { AudioCategory(rawValue: $0) }
                                editingSummary = recording.aiSummary ?? ""
                                isEditing = true
                            } label: {
                                Image(systemName: "pencil")
                                    .font(.subheadline)
                            }
                        }
                    }

                    if isEditing {
                        // Editable category picker
                        LabeledContent("Category") {
                            Picker("Category", selection: $editingCategory) {
                                Text("None").tag(nil as AudioCategory?)
                                ForEach(AudioCategory.allCases) { cat in
                                    Text(cat.displayName).tag(cat as AudioCategory?)
                                }
                            }
                            .labelsHidden()
                        }
                    } else if let category = recording.category,
                              let cat = AudioCategory(rawValue: category) {
                        LabeledContent("Category") {
                            HStack(spacing: 4) {
                                Image(systemName: cat.systemImage)
                                Text(cat.displayName)
                            }
                        }
                    }

                    if let duration = recording.duration {
                        LabeledContent("Duration", value: formatDuration(duration))
                    }

                    LabeledContent("Recorded", value: recording.createdAt.dateTimeString)
                }
                .padding()
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color(.secondarySystemGroupedBackground))
                .clipShape(RoundedRectangle(cornerRadius: 12))

                // AI Summary (editable)
                VStack(alignment: .leading, spacing: 8) {
                    Text("AI Summary")
                        .font(.headline)

                    if isEditing {
                        TextEditor(text: $editingSummary)
                            .frame(minHeight: 80)
                            .padding(8)
                            .background(Color(.systemGray6))
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                    } else if let summary = recording.aiSummary, !summary.isEmpty {
                        Text(summary)
                            .font(.body)
                            .foregroundStyle(.secondary)
                    } else {
                        Text("No summary available.")
                            .font(.body)
                            .foregroundStyle(.tertiary)
                            .italic()
                    }
                }
                .padding()
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color(.secondarySystemGroupedBackground))
                .clipShape(RoundedRectangle(cornerRadius: 12))

                // Edit action buttons
                if isEditing {
                    HStack {
                        Button("Cancel") {
                            isEditing = false
                        }
                        .foregroundStyle(.secondary)

                        Spacer()

                        Button {
                            Task { await saveEdits() }
                        } label: {
                            if isSaving {
                                ProgressView()
                            } else {
                                Text("Save")
                                    .fontWeight(.semibold)
                            }
                        }
                        .disabled(isSaving)
                    }
                    .padding(.horizontal, 4)
                }

                // Transcription
                if let transcript = recording.transcribedText, !transcript.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Transcription")
                            .font(.headline)
                        Text(transcript)
                            .font(.body)
                            .foregroundStyle(.secondary)
                    }
                    .padding()
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color(.secondarySystemGroupedBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }

                Button(role: .destructive) {
                    showingDeleteConfirm = true
                } label: {
                    Label("Delete Recording", systemImage: "trash")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
            }
            .padding()
        }
        .navigationTitle(recording.aiSummary ?? recording.filename)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Done") { dismiss() }
            }
        }
        .confirmationDialog("Delete Recording", isPresented: $showingDeleteConfirm, titleVisibility: .visible) {
            Button("Delete", role: .destructive) {
                Task {
                    await viewModel.deleteRecording(sessionId: sessionId, recordingId: recording.id)
                    dismiss()
                }
            }
        } message: {
            Text("This recording will be permanently deleted.")
        }
    }

    private func saveEdits() async {
        isSaving = true
        defer { isSaving = false }

        let newCategory = editingCategory?.rawValue
        let newSummary = editingSummary.trimmingCharacters(in: .whitespacesAndNewlines)

        await viewModel.updateRecording(
            sessionId: sessionId,
            recordingId: recording.id,
            category: newCategory,
            aiSummary: newSummary.isEmpty ? nil : newSummary
        )
        isEditing = false
    }

    private func formatDuration(_ seconds: Double) -> String {
        let mins = Int(seconds) / 60
        let secs = Int(seconds) % 60
        return String(format: "%d:%02d", mins, secs)
    }
}

// MARK: - Filter Chip

private struct FilterChipView: View {
    let title: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.subheadline)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(isSelected ? Color.accentColor : Color(.systemGray5))
                .foregroundStyle(isSelected ? .white : .primary)
                .clipShape(Capsule())
        }
    }
}

// MARK: - Upload Overlay

private struct UploadingOverlay: View {
    var body: some View {
        ZStack {
            Color.black.opacity(0.3).ignoresSafeArea()
            VStack(spacing: 12) {
                ProgressView()
                    .controlSize(.large)
                Text("Uploading & Transcribing...")
                    .font(.subheadline.weight(.medium))
            }
            .padding(24)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
        }
    }
}
