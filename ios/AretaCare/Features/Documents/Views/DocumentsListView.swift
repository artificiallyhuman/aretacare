import SwiftUI
import PhotosUI
import UniformTypeIdentifiers

struct DocumentsListView: View {
    let sessionId: String
    var sessionName: String = ""

    @Environment(\.horizontalSizeClass) private var sizeClass
    @State private var viewModel = DocumentsViewModel()
    @State private var showingFilePicker = false
    @State private var showingPhotoPicker = false
    @State private var showingPickerChoice = false
    @State private var showingDuplicateAlert = false
    @State private var duplicateMatches: [DuplicateMatch] = []
    @State private var pendingUploads: [PendingUpload] = []
    @State private var selectedPhotoItems: [PhotosPickerItem] = []
    @State private var searchText = ""
    @State private var debouncedSearchText = ""
    @State private var searchDebounceTask: Task<Void, Never>?
    @State private var showingDatePicker = false
    @State private var uploadHapticTrigger = 0
    @State private var deleteHapticTrigger = 0
    @State private var showFileSizeAlert = false
    @State private var oversizedFilenames: [String] = []
    @State private var showBatchResultToast = false
    @State private var batchResultMessage = ""
    @State private var shareFileUrl: URL?
    @State private var showingDocumentShareSheet = false
    @State private var isLoadingShare = false
    @State private var showCopiedToast = false

    private let currentUserId = AuthManager.shared.currentUser?.id ?? ""

    private var filteredDocuments: [DocumentResponse] {
        guard !debouncedSearchText.isEmpty else { return viewModel.documents }
        let lowered = debouncedSearchText.lowercased()
        return viewModel.documents.filter {
            $0.filename.lowercased().contains(lowered) ||
            ($0.aiDescription?.lowercased().contains(lowered) ?? false)
        }
    }

    var body: some View {
        HStack(spacing: 0) {
            if sizeClass == .regular, !viewModel.allDates.isEmpty {
                DateSidebarView(
                    sortedDates: viewModel.sortedDates,
                    selectedDate: viewModel.selectedDateString,
                    countLabel: { "\($0) \($0 == 1 ? "document" : "documents")" },
                    onSelect: { dateInfo in
                        Task { await viewModel.jumpToDate(sessionId: sessionId, date: dateInfo.date) }
                    },
                    onShowAll: {
                        Task { await viewModel.jumpToLatest(sessionId: sessionId) }
                    }
                )
                .frame(minWidth: 280, idealWidth: 375, maxWidth: 480)
                Divider()
            }

            mainContent
        }
            .onChange(of: selectedPhotoItems) { _, items in
                handlePhotoSelection(items)
            }
            .onChange(of: viewModel.selectedCategory) { _, _ in
                Task { await viewModel.fetchDocuments(sessionId: sessionId, category: viewModel.selectedCategory, date: viewModel.selectedDateString) }
            }
            .onChange(of: searchText) { _, newValue in
                debounceSearch(newValue)
            }
            .task {
                await viewModel.fetchDocuments(sessionId: sessionId)
                await viewModel.fetchDates(sessionId: sessionId)
            }
            .sensoryFeedback(.success, trigger: uploadHapticTrigger)
            .sensoryFeedback(.impact(flexibility: .rigid), trigger: deleteHapticTrigger)
            .refreshable {
                await viewModel.fetchDocuments(sessionId: sessionId, category: viewModel.selectedCategory, date: viewModel.selectedDateString)
                await viewModel.fetchDates(sessionId: sessionId)
            }
    }

    private var mainContent: some View {
        Group {
            if let error = viewModel.errorMessage {
                ErrorBannerView(message: error) {
                    viewModel.dismissError()
                }
                .padding(.top, 4)
            }

            if viewModel.isLoading && viewModel.documents.isEmpty {
                SkeletonListView()
            } else if viewModel.documents.isEmpty && viewModel.selectedCategory == nil {
                ContentUnavailableView(
                    "No Documents Uploaded Yet",
                    systemImage: "doc.text",
                    description: Text("Tap the + button to upload medical documents, lab results, and more.")
                )
            } else {
                documentList
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .dynamicTypeSize(...DynamicTypeSize.accessibility2)
        .searchable(text: $searchText, prompt: "Search documents...")
        .toolbar {
            ToolbarItem(placement: .principal) {
                VStack(spacing: 1) {
                    Text("Document Manager")
                        .font(.headline)
                    if !sessionName.isEmpty {
                        Text(sessionName)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
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
                    showingPickerChoice = true
                } label: {
                    Image(systemName: "plus")
                }
                .accessibilityLabel("Upload document")
            }
        }
        .confirmationDialog("Upload Document", isPresented: $showingPickerChoice) {
            Button("Photo Library") { showingPhotoPicker = true }
            Button("Files") { showingFilePicker = true }
            Button("Cancel", role: .cancel) {}
        }
        .photosPicker(isPresented: $showingPhotoPicker, selection: $selectedPhotoItems, maxSelectionCount: 20, matching: .images)
        .fileImporter(isPresented: $showingFilePicker, allowedContentTypes: [.pdf, .plainText, .jpeg, .png], allowsMultipleSelection: true) { result in
            handleFileImport(result)
        }
        .alert(
            duplicateMatches.count == 1 ? "Duplicate Document Found" : "Duplicate Documents Found",
            isPresented: $showingDuplicateAlert
        ) {
            Button("Upload Anyway") {
                performBatchUpload(pendingUploads)
            }
            Button("Cancel", role: .cancel) {
                pendingUploads = []
                viewModel.setPreparingUpload(false)
            }
        } message: {
            if duplicateMatches.count == 1 {
                Text("A document named \"\(duplicateMatches.first?.filename ?? "")\" already exists in this care session.")
            } else {
                Text("\(duplicateMatches.count) documents with matching filenames already exist in this care session.")
            }
        }
        .sheet(isPresented: $showingDatePicker) {
            DateCalendarSheetView(
                sortedDates: viewModel.sortedDates,
                selectedDate: viewModel.selectedDateString,
                title: "Document Dates",
                countLabel: { "\($0) \($0 == 1 ? "document" : "documents")" },
                onSelect: { dateInfo in
                    showingDatePicker = false
                    Task { await viewModel.jumpToDate(sessionId: sessionId, date: dateInfo.date) }
                },
                onDismiss: { showingDatePicker = false }
            )
        }
        .sheet(isPresented: $showingDocumentShareSheet, onDismiss: {
            if let url = shareFileUrl {
                try? FileManager.default.removeItem(at: url)
            }
            shareFileUrl = nil
        }) {
            if let url = shareFileUrl {
                ShareSheet(activityItems: [url])
            }
        }
        .overlay {
            if viewModel.isBatchUploading {
                UploadingOverlay(
                    fileProgress: viewModel.batchUploadProgress,
                    currentIndex: viewModel.batchCurrentIndex,
                    totalCount: viewModel.batchUploadProgress.count,
                    onCancel: { viewModel.cancelBatchUpload() }
                )
            } else if viewModel.isUploading {
                UploadingOverlay()
            } else if viewModel.isPreparingUpload {
                UploadingOverlay(message: "Preparing files...")
            }
        }
        .toast(batchResultMessage, icon: "checkmark", isPresented: $showBatchResultToast)
        .toast("Copied", icon: "doc.on.doc", isPresented: $showCopiedToast)
        .alert("File Too Large", isPresented: $showFileSizeAlert) {
            Button("OK", role: .cancel) { oversizedFilenames = [] }
        } message: {
            if oversizedFilenames.count == 1 {
                Text("\"\(oversizedFilenames.first ?? "")\" exceeds the 30 MB limit and was skipped.")
            } else if oversizedFilenames.count > 1 {
                Text("\(oversizedFilenames.count) files exceed the 30 MB limit and were skipped.")
            } else {
                Text("File too large. Maximum file size is 30 MB.")
            }
        }
    }

    // MARK: - Category Filter

    private var categoryFilter: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                FilterChipView(title: "All", isSelected: viewModel.selectedCategory == nil) {
                    viewModel.selectedCategory = nil
                }

                ForEach(DocumentCategory.allCases) { category in
                    FilterChipView(title: category.displayName, isSelected: viewModel.selectedCategory == category) {
                        viewModel.selectedCategory = category
                    }
                }
            }
            .padding(.horizontal)
            .padding(.vertical, 8)
        }
    }

    // MARK: - Document List

    private var documentList: some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                Image(systemName: "info.circle")
                    .foregroundStyle(.orange)
                    .font(.caption)
                Text("AI-generated descriptions may contain errors. Please review for accuracy.")
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
                    if viewModel.documents.isEmpty {
                        ContentUnavailableView(
                            "No Documents in This Category",
                            systemImage: "line.3.horizontal.decrease.circle",
                            description: Text("Try selecting a different category or tap \"All\" to see everything.")
                        )
                        .listRowSeparator(.hidden)
                    } else {
                        ForEach(filteredDocuments) { document in
                            DocumentListRow(
                                document: document,
                                viewModel: viewModel,
                                currentUserId: currentUserId,
                                sessionId: sessionId,
                                onCopy: { showCopiedToast = true },
                                onShare: { shareDocument(document) },
                                onDelete: {
                                    deleteHapticTrigger += 1
                                    Task { await viewModel.deleteDocument(id: document.id, sessionId: sessionId) }
                                }
                            )
                            .onAppear {
                                Task { await viewModel.fetchPreviewUrl(for: document) }
                                if document.id == viewModel.documents.last?.id {
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

    // MARK: - File Handling

    private func handleFileImport(_ result: Result<[URL], Error>) {
        switch result {
        case .success(let urls):
            var uploads: [PendingUpload] = []
            var oversized: [String] = []

            for url in urls {
                guard url.startAccessingSecurityScopedResource() else { continue }
                defer { url.stopAccessingSecurityScopedResource() }

                guard let data = try? Data(contentsOf: url) else { continue }
                if data.count > AppConstants.maxFileSizeBytes {
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
            if !uploads.isEmpty {
                viewModel.setPreparingUpload(true)
                prepareUploads(uploads)
            }

        case .failure:
            break
        }
    }

    private func debounceSearch(_ text: String) {
        searchDebounceTask?.cancel()
        searchDebounceTask = Task {
            try? await Task.sleep(for: .milliseconds(200))
            guard !Task.isCancelled else { return }
            debouncedSearchText = text
        }
    }

    private func handlePhotoSelection(_ items: [PhotosPickerItem]) {
        guard !items.isEmpty else { return }
        selectedPhotoItems = []
        viewModel.setPreparingUpload(true)

        Task {
            var uploads: [PendingUpload] = []
            var oversized: [String] = []

            for (index, item) in items.enumerated() {
                // Re-encodes HEIC/TIFF/etc. to JPEG — the backend only accepts JPEG/PNG
                guard let image = await item.loadUploadableImage() else { continue }

                let filename = items.count == 1
                    ? "photo_\(Date().apiDateString).\(image.ext)"
                    : "photo_\(Date().apiDateString)_\(index + 1).\(image.ext)"

                if image.data.count > AppConstants.maxFileSizeBytes {
                    oversized.append(filename)
                    continue
                }
                uploads.append(PendingUpload(data: image.data, filename: filename, contentType: image.contentType))
            }

            if !oversized.isEmpty {
                oversizedFilenames = oversized
                showFileSizeAlert = true
            }
            if uploads.isEmpty {
                viewModel.setPreparingUpload(false)
            } else {
                prepareUploads(uploads)
            }
        }
    }

    private func prepareUploads(_ uploads: [PendingUpload]) {
        Task {
            let filenames = uploads.map(\.filename)
            let duplicates = await viewModel.checkDuplicates(sessionId: sessionId, filenames: filenames)

            if duplicates.isEmpty {
                performBatchUpload(uploads)
            } else {
                pendingUploads = uploads
                duplicateMatches = duplicates
                showingDuplicateAlert = true
            }
        }
    }

    private func performBatchUpload(_ uploads: [PendingUpload]) {
        Task {
            if uploads.count == 1 {
                // Single file: use simple overlay path
                let result = await viewModel.uploadDocument(
                    sessionId: sessionId,
                    fileData: uploads[0].data,
                    filename: uploads[0].filename,
                    contentType: uploads[0].contentType
                )
                if result != nil { uploadHapticTrigger += 1 }
                pendingUploads = []
                return
            }

            let result = await viewModel.uploadDocuments(sessionId: sessionId, files: uploads)
            pendingUploads = []

            if result.successCount > 0 {
                uploadHapticTrigger += 1
            }

            if result.wasCancelled && result.successCount > 0 {
                batchResultMessage = "Cancelled. \(result.successCount) uploaded."
            } else if result.failCount > 0 && result.successCount > 0 {
                batchResultMessage = "\(result.successCount) uploaded, \(result.failCount) failed."
            } else if result.failCount > 0 {
                batchResultMessage = "\(result.failCount) upload\(result.failCount == 1 ? "" : "s") failed."
            } else if result.successCount > 1 {
                batchResultMessage = "\(result.successCount) documents uploaded."
            } else {
                viewModel.clearBatchProgress()
                return
            }

            try? await Task.sleep(for: .seconds(1.5))
            viewModel.clearBatchProgress()
            showBatchResultToast = true
        }
    }

    private func shareDocument(_ document: DocumentResponse) {
        guard !isLoadingShare else { return }
        isLoadingShare = true
        Task {
            shareFileUrl = await viewModel.downloadToTempFile(
                id: document.id, filename: document.filename
            )
            isLoadingShare = false
            if shareFileUrl != nil {
                showingDocumentShareSheet = true
            }
        }
    }

}

// MARK: - Supporting Views

/// Wrapper that owns the delete-confirmation state so the dialog anchors to this row.
private struct DocumentListRow: View {
    let document: DocumentResponse
    let viewModel: DocumentsViewModel
    let currentUserId: String
    let sessionId: String
    var onCopy: (() -> Void)?
    var onShare: (() -> Void)?
    var onDelete: (() -> Void)?

    @State private var showDeleteConfirmation = false

    var body: some View {
        NavigationLink(destination: DocumentDetailView(document: document, viewModel: viewModel)) {
            DocumentRowView(
                document: document,
                currentUserId: currentUserId,
                previewUrl: viewModel.previewUrls[document.id],
                onCopyName: {
                    ClipboardHelper.copyPlain(document.filename)
                    onCopy?()
                },
                onShare: { onShare?() },
                onDelete: { showDeleteConfirmation = true }
            )
        }
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            Button {
                showDeleteConfirmation = true
            } label: {
                Label("Delete", systemImage: "trash")
            }
            .tint(.red)
            .disabled(viewModel.isLoading)
        }
        .swipeActions(edge: .leading) {
            Button { onShare?() } label: {
                Label("Share", systemImage: "square.and.arrow.up")
            }
            .tint(.blue)
        }
        .contextMenu {
            Button {
                ClipboardHelper.copyPlain(document.filename)
                onCopy?()
            } label: {
                Label("Copy Name", systemImage: "doc.on.doc")
            }
            Button { onShare?() } label: {
                Label("Share", systemImage: "square.and.arrow.up")
            }
            Button(role: .destructive) {
                showDeleteConfirmation = true
            } label: {
                Label("Delete", systemImage: "trash")
            }
        }
        .confirmationDialog("Delete Document", isPresented: $showDeleteConfirmation, titleVisibility: .visible) {
            Button("Delete", role: .destructive) { onDelete?() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Are you sure you want to delete \"\(document.filename)\"? This cannot be undone.")
        }
    }
}

private struct DocumentRowView: View {
    let document: DocumentResponse
    let currentUserId: String
    let previewUrl: URL?
    var onCopyName: (() -> Void)?
    var onShare: (() -> Void)?
    var onDelete: (() -> Void)?

    var body: some View {
        HStack(spacing: 12) {
            // Thumbnail or fallback icon
            Group {
                if let url = previewUrl {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let image):
                            image
                                .resizable()
                                .scaledToFill()
                        case .failure:
                            fallbackIcon
                        case .empty:
                            ProgressView()
                        @unknown default:
                            fallbackIcon
                        }
                    }
                } else {
                    fallbackIcon
                }
            }
            .frame(width: 44, height: 44)
            .clipShape(RoundedRectangle(cornerRadius: 6))
            .background(
                RoundedRectangle(cornerRadius: 6)
                    .fill(Color(.systemGray6))
            )

            VStack(alignment: .leading, spacing: 4) {
                Text(document.filename)
                    .font(.subheadline.weight(.medium))
                    .lineLimit(1)

                if let description = document.aiDescription {
                    Text(description)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }

                HStack(spacing: 8) {
                    if let category = document.category,
                       let cat = DocumentCategory(rawValue: category) {
                        Text(cat.displayName)
                            .font(.caption2)
                            .lineLimit(1)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.accentColor.opacity(0.1))
                            .foregroundStyle(Color.accentColor)
                            .clipShape(Capsule())
                    }

                    Text(document.uploadedAt.shortDateString)
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                        .lineLimit(1)
                }
                .dynamicTypeSize(...DynamicTypeSize.accessibility1)
            }

            Spacer(minLength: 4)

            if let sourceTag = document.lastEditedBy ?? document.uploadedBy {
                SourceTagView(sourceTag: sourceTag, currentUserId: currentUserId)
            }

            Menu {
                Button { onCopyName?() } label: {
                    Label("Copy Name", systemImage: "doc.on.doc")
                }
                Button { onShare?() } label: {
                    Label("Share", systemImage: "square.and.arrow.up")
                }
                Divider()
                Button(role: .destructive) { onDelete?() } label: {
                    Label("Delete", systemImage: "trash")
                }
            } label: {
                Image(systemName: "ellipsis")
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .frame(width: 28, height: 28)
                    .contentShape(Rectangle())
            }
            .dynamicTypeSize(...DynamicTypeSize.accessibility1)
        }
        .padding(.vertical, 4)
    }

    private var fallbackIcon: some View {
        Image(systemName: iconName)
            .font(.title3)
            .foregroundStyle(Color.accentColor)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var iconName: String {
        switch document.contentType {
        case "application/pdf": return "doc.richtext"
        case "image/jpeg", "image/png": return "photo"
        case "text/plain": return "doc.plaintext"
        default: return "doc"
        }
    }
}

