import SwiftUI
import PhotosUI
import UniformTypeIdentifiers

struct DocumentsListView: View {
    let sessionId: String

    @State private var viewModel = DocumentsViewModel()
    @State private var showingFilePicker = false
    @State private var showingPhotoPicker = false
    @State private var showingPickerChoice = false
    @State private var showingDuplicateAlert = false
    @State private var duplicateMatches: [DuplicateMatch] = []
    @State private var pendingUpload: PendingUpload?
    @State private var selectedPhotoItems: [PhotosPickerItem] = []
    @State private var searchText = ""
    @State private var debouncedSearchText = ""
    @State private var searchDebounceTask: Task<Void, Never>?
    @State private var showingDatePicker = false
    @State private var uploadHapticTrigger = 0
    @State private var deleteHapticTrigger = 0
    @State private var showFileSizeAlert = false
    @State private var shareDocumentUrl: URL?
    @State private var showingDocumentShareSheet = false

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
        mainContent
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
        .navigationTitle("Document Manager")
        .searchable(text: $searchText, prompt: "Search documents...")
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                if !viewModel.allDates.isEmpty {
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
        .photosPicker(isPresented: $showingPhotoPicker, selection: $selectedPhotoItems, maxSelectionCount: 1, matching: .images)
        .fileImporter(isPresented: $showingFilePicker, allowedContentTypes: [.pdf, .plainText, .jpeg, .png], allowsMultipleSelection: false) { result in
            handleFileImport(result)
        }
        .alert("Duplicate Document Found", isPresented: $showingDuplicateAlert) {
            Button("Upload Anyway") {
                if let upload = pendingUpload {
                    performUpload(upload)
                }
            }
            Button("Cancel", role: .cancel) {
                pendingUpload = nil
            }
        } message: {
            Text("A document with this filename already exists in this session.")
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
        .sheet(isPresented: $showingDocumentShareSheet) {
            if let url = shareDocumentUrl {
                ShareSheet(activityItems: [url])
            }
        }
        .overlay {
            if viewModel.isUploading {
                UploadingOverlay()
            }
        }
        .alert("File Too Large", isPresented: $showFileSizeAlert) {
            Button("OK", role: .cancel) {}
        } message: {
            Text("File too large. Maximum file size is 30 MB.")
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
                            NavigationLink(destination: DocumentDetailView(document: document, viewModel: viewModel)) {
                                DocumentRowView(
                                    document: document,
                                    currentUserId: currentUserId,
                                    previewUrl: viewModel.previewUrls[document.id]
                                )
                            }
                            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                Button(role: .destructive) {
                                    deleteHapticTrigger += 1
                                    Task { await viewModel.deleteDocument(id: document.id, sessionId: sessionId) }
                                } label: {
                                    Label("Delete", systemImage: "trash")
                                }
                            }
                            .swipeActions(edge: .leading) {
                                Button {
                                    shareDocument(document)
                                } label: {
                                    Label("Share", systemImage: "square.and.arrow.up")
                                }
                                .tint(.blue)
                            }
                            .contextMenu {
                                Button {
                                    UIPasteboard.general.string = document.filename
                                } label: {
                                    Label("Copy Name", systemImage: "doc.on.doc")
                                }
                                Button {
                                    shareDocument(document)
                                } label: {
                                    Label("Share", systemImage: "square.and.arrow.up")
                                }
                                Button(role: .destructive) {
                                    deleteHapticTrigger += 1
                                    Task { await viewModel.deleteDocument(id: document.id, sessionId: sessionId) }
                                } label: {
                                    Label("Delete", systemImage: "trash")
                                }
                            }
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
            guard let url = urls.first else { return }
            guard url.startAccessingSecurityScopedResource() else { return }
            defer { url.stopAccessingSecurityScopedResource() }

            guard let data = try? Data(contentsOf: url) else { return }
            if data.count > AppConstants.maxFileSizeBytes {
                showFileSizeAlert = true
                return
            }
            let filename = url.lastPathComponent
            let contentType = url.pathExtension.mimeTypeForExtension
            prepareUpload(data: data, filename: filename, contentType: contentType)

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
        guard let item = items.first else { return }
        selectedPhotoItems = []

        Task {
            if let data = try? await item.loadTransferable(type: Data.self) {
                if data.count > AppConstants.maxFileSizeBytes {
                    showFileSizeAlert = true
                    return
                }
                let ext: String
                let contentType: String
                if let type = item.supportedContentTypes.first,
                   let detectedExt = type.preferredFilenameExtension,
                   let detectedMime = type.preferredMIMEType {
                    ext = detectedExt
                    contentType = detectedMime
                } else {
                    ext = "jpg"
                    contentType = "image/jpeg"
                }
                let filename = "photo_\(Date().apiDateString).\(ext)"
                prepareUpload(data: data, filename: filename, contentType: contentType)
            }
        }
    }

    private func prepareUpload(data: Data, filename: String, contentType: String) {
        let upload = PendingUpload(data: data, filename: filename, contentType: contentType)

        Task {
            let duplicates = await viewModel.checkDuplicates(sessionId: sessionId, filenames: [filename])
            if duplicates.isEmpty {
                performUpload(upload)
            } else {
                pendingUpload = upload
                duplicateMatches = duplicates
                showingDuplicateAlert = true
            }
        }
    }

    private func performUpload(_ upload: PendingUpload) {
        Task {
            let result = await viewModel.uploadDocument(
                sessionId: sessionId,
                fileData: upload.data,
                filename: upload.filename,
                contentType: upload.contentType
            )
            if result != nil { uploadHapticTrigger += 1 }
            pendingUpload = nil
        }
    }

    private func shareDocument(_ document: DocumentResponse) {
        Task {
            if let url = await viewModel.getDownloadUrl(id: document.id) {
                shareDocumentUrl = url
                showingDocumentShareSheet = true
            }
        }
    }

}

// MARK: - Supporting Views

private struct PendingUpload {
    let data: Data
    let filename: String
    let contentType: String
}

private struct DocumentRowView: View {
    let document: DocumentResponse
    let currentUserId: String
    let previewUrl: URL?

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
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.accentColor.opacity(0.1))
                            .foregroundStyle(Color.accentColor)
                            .clipShape(Capsule())
                    }

                    Text(document.uploadedAt.shortDateString)
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
            }

            Spacer()

            if let uploadedBy = document.uploadedBy {
                SourceTagView(sourceTag: uploadedBy, currentUserId: currentUserId)
            }
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

