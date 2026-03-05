import SwiftUI
import UniformTypeIdentifiers

struct AudioRecordingsView: View {
    let sessionId: String
    var sessionName: String = ""

    @Environment(\.horizontalSizeClass) private var sizeClass
    @State private var viewModel = AudioRecordingsViewModel()
    @State private var showingRecorder = false
    @State private var selectedRecording: AudioRecordingResponse?
    @State private var selectedCategory: AudioCategory?
    @State private var showingDatePicker = false
    @State private var deleteHapticTrigger = 0
    @State private var searchText = ""
    @State private var debouncedSearchText = ""
    @State private var searchDebounceTask: Task<Void, Never>?
    @State private var showingAddChoice = false
    @State private var showingFilePicker = false
    @State private var showFileSizeAlert = false
    @State private var oversizedFilenames: [String] = []
    @State private var showBatchResultToast = false
    @State private var batchResultMessage = ""

    private let currentUserId = AuthManager.shared.currentUser?.id ?? ""

    private var filteredRecordings: [AudioRecordingResponse] {
        var results = viewModel.recordings
        if let category = selectedCategory {
            results = results.filter { $0.category == category.rawValue }
        }
        if !debouncedSearchText.isEmpty {
            let lowered = debouncedSearchText.lowercased()
            results = results.filter {
                ($0.aiSummary?.lowercased().contains(lowered) ?? false) ||
                $0.filename.lowercased().contains(lowered) ||
                ($0.transcribedText?.lowercased().contains(lowered) ?? false)
            }
        }
        return results
    }

    var body: some View {
        HStack(spacing: 0) {
            if sizeClass == .regular, !viewModel.allDates.isEmpty {
                DateSidebarView(
                    sortedDates: viewModel.sortedDates,
                    selectedDate: viewModel.selectedDateString,
                    countLabel: { "\($0) \($0 == 1 ? "recording" : "recordings")" },
                    onSelect: { dateInfo in
                        Task { await viewModel.jumpToDate(sessionId: sessionId, date: dateInfo.date) }
                    },
                    onShowAll: {
                        Task { await viewModel.jumpToLatest(sessionId: sessionId) }
                    }
                )
                .frame(width: 375)
                Divider()
            }

            Group {
                if let error = viewModel.errorMessage {
                    ErrorBannerView(message: error) {
                        viewModel.dismissError()
                    }
                    .padding(.top, 4)
                }

                if viewModel.isLoading && viewModel.recordings.isEmpty {
                    SkeletonListView()
                } else if viewModel.recordings.isEmpty {
                    ContentUnavailableView(
                        "No Audio Recordings",
                        systemImage: "mic",
                        description: Text("Record or upload audio about symptoms, appointments, or care notes.")
                    )
                } else {
                    recordingsList
                }
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $searchText, prompt: "Search recordings...")
        .toolbar {
            ToolbarItem(placement: .principal) {
                VStack(spacing: 1) {
                    Text("Audio Recordings")
                        .font(.headline)
                    if !sessionName.isEmpty {
                        Text(sessionName)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            ToolbarItem(placement: .topBarLeading) {
                if sizeClass != .regular, !viewModel.allDates.isEmpty {
                    Button {
                        showingDatePicker = true
                    } label: {
                        Image(systemName: "calendar")
                    }
                    .accessibilityLabel("Open calendar")
                }
            }
            ToolbarItem(placement: .primaryAction) {
                Button {
                    showingAddChoice = true
                } label: {
                    Image(systemName: "plus")
                }
                .accessibilityLabel("Add audio recording")
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
        .confirmationDialog("Add Audio", isPresented: $showingAddChoice) {
            Button("Record Audio") { showingRecorder = true }
            Button("Choose File") { showingFilePicker = true }
            Button("Cancel", role: .cancel) {}
        }
        .fileImporter(isPresented: $showingFilePicker, allowedContentTypes: [.mp3, .mpeg4Audio, .wav, .audio], allowsMultipleSelection: true) { result in
            handleAudioFileImport(result)
        }
        .alert("File Too Large", isPresented: $showFileSizeAlert) {
            Button("OK", role: .cancel) { oversizedFilenames = [] }
        } message: {
            if oversizedFilenames.count == 1 {
                Text("\"\(oversizedFilenames.first ?? "")\" exceeds the 100 MB limit and was skipped.")
            } else if oversizedFilenames.count > 1 {
                Text("\(oversizedFilenames.count) files exceed the 100 MB limit and were skipped.")
            } else {
                Text("Audio files must be under 100 MB.")
            }
        }
        .overlay {
            if viewModel.isBatchUploading {
                UploadingOverlay(
                    message: "Uploading & Transcribing...",
                    fileProgress: viewModel.batchUploadProgress,
                    currentIndex: viewModel.batchCurrentIndex,
                    totalCount: viewModel.batchUploadProgress.count,
                    onCancel: { viewModel.cancelBatchUpload() }
                )
            } else if viewModel.isUploading {
                UploadingOverlay(message: "Uploading & Transcribing...")
            }
        }
        .toast(batchResultMessage, icon: "checkmark", isPresented: $showBatchResultToast)
        .sensoryFeedback(.impact(flexibility: .rigid), trigger: deleteHapticTrigger)
        .onChange(of: searchText) { _, newValue in
            searchDebounceTask?.cancel()
            searchDebounceTask = Task {
                try? await Task.sleep(for: .milliseconds(200))
                guard !Task.isCancelled else { return }
                debouncedSearchText = newValue
            }
        }
        .task {
            await viewModel.fetchRecordings(sessionId: sessionId)
            await viewModel.fetchDates(sessionId: sessionId)
        }
        .refreshable {
            await viewModel.fetchRecordings(sessionId: sessionId, date: viewModel.selectedDateString)
            await viewModel.fetchDates(sessionId: sessionId)
        }
    }

    private func handleAudioFileImport(_ result: Result<[URL], Error>) {
        switch result {
        case .success(let urls):
            var uploads: [PendingUpload] = []
            var oversized: [String] = []

            for url in urls {
                guard url.startAccessingSecurityScopedResource() else { continue }
                defer { url.stopAccessingSecurityScopedResource() }

                guard let data = try? Data(contentsOf: url) else { continue }
                if data.count > AppConstants.maxAudioFileSizeBytes {
                    oversized.append(url.lastPathComponent)
                    continue
                }
                uploads.append(PendingUpload(
                    data: data,
                    filename: url.lastPathComponent,
                    contentType: url.pathExtension.mimeTypeForExtension
                ))
            }

            if !oversized.isEmpty {
                oversizedFilenames = oversized
                showFileSizeAlert = true
            }

            guard !uploads.isEmpty else { return }

            if uploads.count == 1 {
                Task {
                    await viewModel.uploadRecording(
                        sessionId: sessionId,
                        audioData: uploads[0].data,
                        filename: uploads[0].filename,
                        mimeType: uploads[0].contentType
                    )
                }
            } else {
                Task {
                    let result = await viewModel.uploadRecordings(sessionId: sessionId, files: uploads)

                    if result.wasCancelled && result.successCount > 0 {
                        batchResultMessage = "Cancelled. \(result.successCount) uploaded."
                    } else if result.failCount > 0 && result.successCount > 0 {
                        batchResultMessage = "\(result.successCount) uploaded, \(result.failCount) failed."
                    } else if result.failCount > 0 {
                        batchResultMessage = "\(result.failCount) upload\(result.failCount == 1 ? "" : "s") failed."
                    } else if result.successCount > 1 {
                        batchResultMessage = "\(result.successCount) recordings uploaded."
                    } else {
                        viewModel.clearBatchProgress()
                        return
                    }

                    try? await Task.sleep(for: .seconds(1.5))
                    viewModel.clearBatchProgress()
                    showBatchResultToast = true
                }
            }

        case .failure:
            break
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
            HStack(spacing: 8) {
                Image(systemName: "info.circle")
                    .foregroundStyle(.orange)
                    .font(.caption)
                Text("AI transcriptions and summaries may contain errors. Please review for accuracy.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(10)
            .background(
                RoundedRectangle(cornerRadius: 8)
                    .fill(Color.orange.opacity(0.08))
            )
            .padding(.horizontal)
            .padding(.top, 8)

            if sizeClass != .regular, viewModel.isJumpedToDate {
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
                Section {
                    if filteredRecordings.isEmpty {
                        ContentUnavailableView(
                            "No Recordings in This Category",
                            systemImage: "line.3.horizontal.decrease.circle",
                            description: Text("Try selecting a different category or tap \"All\" to see everything.")
                        )
                        .listRowSeparator(.hidden)
                    } else {
                        ForEach(filteredRecordings) { recording in
                            Button {
                                selectedRecording = recording
                            } label: {
                                AudioRecordingRowView(recording: recording, sessionId: sessionId, viewModel: viewModel, currentUserId: currentUserId)
                            }
                            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                Button(role: .destructive) {
                                    deleteHapticTrigger += 1
                                    Task { await viewModel.deleteRecording(sessionId: sessionId, recordingId: recording.id) }
                                } label: {
                                    Label("Delete", systemImage: "trash")
                                }
                                .disabled(viewModel.isLoading)
                            }
                            .contextMenu {
                                if let summary = recording.aiSummary {
                                    Button {
                                        UIPasteboard.general.string = summary
                                    } label: {
                                        Label("Copy Summary", systemImage: "doc.on.doc")
                                    }
                                }
                                Button {
                                    selectedRecording = recording
                                } label: {
                                    Label("View Details", systemImage: "info.circle")
                                }
                                Button(role: .destructive) {
                                    deleteHapticTrigger += 1
                                    Task { await viewModel.deleteRecording(sessionId: sessionId, recordingId: recording.id) }
                                } label: {
                                    Label("Delete", systemImage: "trash")
                                }
                                .disabled(viewModel.isLoading)
                            }
                            .onAppear {
                                if recording.id == viewModel.recordings.last?.id {
                                    Task { await viewModel.loadMoreIfNeeded(sessionId: sessionId) }
                                }
                            }
                        }
                    }
                } header: {
                    categoryFilter
                        .textCase(nil)
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

            if let sourceTag = recording.lastEditedBy ?? recording.createdBy {
                SourceTagView(sourceTag: sourceTag, currentUserId: currentUserId)
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
    @State private var showSavedToast = false
    @State private var saveHapticTrigger = 0

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
        .sensoryFeedback(.success, trigger: saveHapticTrigger)
        .toast("Saved", icon: "checkmark", isPresented: $showSavedToast)
        .animation(.spring(duration: 0.3), value: showSavedToast)
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
        saveHapticTrigger += 1
        withAnimation(.spring(duration: 0.3)) {
            showSavedToast = true
        }
    }

    private func formatDuration(_ seconds: Double) -> String {
        let mins = Int(seconds) / 60
        let secs = Int(seconds) % 60
        return String(format: "%d:%02d", mins, secs)
    }
}

