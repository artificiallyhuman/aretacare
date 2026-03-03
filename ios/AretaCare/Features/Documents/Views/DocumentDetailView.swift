import SwiftUI
import PDFKit

struct DocumentDetailView: View {
    let document: DocumentResponse
    let viewModel: DocumentsViewModel

    @Environment(\.dismiss) private var dismiss
    @State private var downloadUrl: URL?
    @State private var isLoadingUrl = false
    @State private var showingDeleteConfirmation = false
    @State private var showingShareSheet = false
    @State private var showingEditSheet = false
    @State private var quickLookURL: URL?
    @State private var showingQuickLook = false
    @State private var isLoadingQuickLook = false
    @State private var showSavedToast = false
    @State private var saveHapticTrigger = 0

    private let currentUserId = AuthManager.shared.currentUser?.id ?? ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                metadataSection
                previewSection
                descriptionSection
                actionsSection
            }
            .padding()
        }
        .navigationTitle(document.filename)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    Button {
                        showingEditSheet = true
                    } label: {
                        Label("Edit Details", systemImage: "pencil")
                    }

                    Button {
                        Task { await loadDownloadUrl() }
                        showingShareSheet = true
                    } label: {
                        Label("Share", systemImage: "square.and.arrow.up")
                    }

                    Button(role: .destructive) {
                        showingDeleteConfirmation = true
                    } label: {
                        Label("Delete", systemImage: "trash")
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
            }
        }
        .confirmationDialog("Delete Document", isPresented: $showingDeleteConfirmation, titleVisibility: .visible) {
            Button("Delete", role: .destructive) {
                Task {
                    await viewModel.deleteDocument(id: document.id, sessionId: document.sessionId)
                    dismiss()
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Are you sure you want to delete \"\(document.filename)\"? This cannot be undone.")
        }
        .sheet(isPresented: $showingShareSheet) {
            if let url = downloadUrl {
                ShareSheet(activityItems: [url])
            }
        }
        .sheet(isPresented: $showingEditSheet) {
            NavigationStack {
                DocumentEditSheet(document: document, viewModel: viewModel) {
                    saveHapticTrigger += 1
                    withAnimation(.spring(duration: 0.3)) {
                        showSavedToast = true
                    }
                }
            }
        }
        .sensoryFeedback(.success, trigger: saveHapticTrigger)
        .toast("Saved", icon: "checkmark", isPresented: $showSavedToast)
        .animation(.spring(duration: 0.3), value: showSavedToast)
        .fullScreenCover(isPresented: $showingQuickLook) {
            if let url = quickLookURL {
                QuickLookPreviewView(url: url)
                    .ignoresSafeArea()
            }
        }
        .task {
            await loadDownloadUrl()
        }
    }

    private var quickLookButton: some View {
        Button {
            openQuickLook()
        } label: {
            Group {
                if isLoadingQuickLook {
                    ProgressView()
                        .tint(.primary)
                } else {
                    Image(systemName: "arrow.up.left.and.arrow.down.right")
                }
            }
            .font(.subheadline)
            .padding(8)
            .background(.ultraThinMaterial)
            .clipShape(Circle())
        }
        .padding(8)
    }

    private func openQuickLook() {
        guard !isLoadingQuickLook else { return }
        isLoadingQuickLook = true
        Task {
            quickLookURL = await viewModel.downloadToTempFile(
                id: document.id, filename: document.filename
            )
            isLoadingQuickLook = false
            if quickLookURL != nil {
                showingQuickLook = true
            }
        }
    }

    // MARK: - Metadata

    private var metadataSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: fileIcon)
                    .font(.title)
                    .foregroundStyle(Color.accentColor)
                Text(document.filename)
                    .font(.headline)
                Spacer()
                if let uploadedBy = document.uploadedBy {
                    SourceTagView(sourceTag: uploadedBy, currentUserId: currentUserId)
                }
            }

            Divider()

            LabeledContent("Type", value: document.contentType)
            LabeledContent("Uploaded", value: document.uploadedAt.dateTimeString)

            if let category = document.category,
               let cat = DocumentCategory(rawValue: category) {
                LabeledContent("Category") {
                    HStack(spacing: 4) {
                        Image(systemName: cat.systemImage)
                        Text(cat.displayName)
                    }
                    .font(.subheadline)
                    .foregroundStyle(Color.accentColor)
                }
            }
        }
        .padding()
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    // MARK: - Preview

    @ViewBuilder
    private var previewSection: some View {
        if document.contentType == "application/pdf", let url = downloadUrl {
            VStack(alignment: .leading, spacing: 8) {
                Text("Preview")
                    .font(.headline)

                PDFPreviewView(url: url)
                    .frame(height: 400)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .overlay(alignment: .topTrailing) {
                        quickLookButton
                    }
            }
        } else if document.contentType.hasPrefix("image/"), let url = downloadUrl {
            VStack(alignment: .leading, spacing: 8) {
                Text("Preview")
                    .font(.headline)

                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .scaledToFit()
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                    case .failure:
                        ContentUnavailableView("Unable to load image", systemImage: "photo.badge.exclamationmark")
                    case .empty:
                        ProgressView()
                            .frame(height: 200)
                    @unknown default:
                        EmptyView()
                    }
                }
                .overlay(alignment: .topTrailing) {
                    quickLookButton
                }
            }
        } else if document.contentType == "text/plain", let text = document.extractedText, !text.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text("Contents")
                    .font(.headline)

                ScrollView {
                    Text(text)
                        .font(.system(.caption, design: .monospaced))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding()
                }
                .frame(height: 300)
                .background(Color(.secondarySystemGroupedBackground))
                .clipShape(RoundedRectangle(cornerRadius: 12))
            }
        }
    }

    // MARK: - Description

    @ViewBuilder
    private var descriptionSection: some View {
        if let description = document.aiDescription, !description.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text("AI Description")
                    .font(.headline)

                Text(description)
                    .font(.body)
                    .foregroundStyle(.secondary)
            }
            .padding()
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(.secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }

    // MARK: - Actions

    private var actionsSection: some View {
        VStack(spacing: 12) {
            Button {
                Task { await loadDownloadUrl() }
                showingShareSheet = true
            } label: {
                Label("Download / Share", systemImage: "square.and.arrow.down")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .disabled(isLoadingUrl)
        }
    }

    // MARK: - Helpers

    private func loadDownloadUrl() async {
        guard downloadUrl == nil else { return }
        isLoadingUrl = true
        defer { isLoadingUrl = false }
        downloadUrl = await viewModel.getDownloadUrl(id: document.id)
    }

    private var fileIcon: String {
        switch document.contentType {
        case "application/pdf": return "doc.richtext"
        case "image/jpeg", "image/png": return "photo"
        case "text/plain": return "doc.plaintext"
        default: return "doc"
        }
    }
}

// MARK: - Edit Sheet

private struct DocumentEditSheet: View {
    let document: DocumentResponse
    let viewModel: DocumentsViewModel
    var onSave: (() -> Void)?

    @Environment(\.dismiss) private var dismiss
    @State private var selectedCategory: DocumentCategory?
    @State private var descriptionText: String = ""
    @State private var isSaving = false
    @State private var initialCategory: DocumentCategory?
    @State private var initialDescription: String = ""

    private var hasChanges: Bool {
        selectedCategory != initialCategory || descriptionText != initialDescription
    }

    var body: some View {
        Form {
            Section("Category") {
                Picker("Category", selection: $selectedCategory) {
                    Text("None").tag(nil as DocumentCategory?)
                    ForEach(DocumentCategory.allCases) { category in
                        Text(category.displayName).tag(category as DocumentCategory?)
                    }
                }
            }

            Section("Description") {
                TextEditor(text: $descriptionText)
                    .frame(minHeight: 100)
            }
        }
        .navigationTitle("Edit Document")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel") { dismiss() }
            }
            ToolbarItem(placement: .confirmationAction) {
                Button("Save") {
                    save()
                }
                .fontWeight(.semibold)
                .disabled(isSaving)
            }
        }
        .onAppear {
            if let cat = document.category {
                selectedCategory = DocumentCategory(rawValue: cat)
            }
            descriptionText = document.aiDescription ?? ""
            initialCategory = selectedCategory
            initialDescription = descriptionText
        }
        .disabled(isSaving)
        .interactiveDismissDisabled(hasChanges)
    }

    private func save() {
        isSaving = true
        Task {
            let success = await viewModel.updateDocument(
                id: document.id,
                sessionId: document.sessionId,
                category: selectedCategory?.rawValue,
                description: descriptionText.isEmpty ? nil : descriptionText
            )
            isSaving = false
            if success {
                onSave?()
                dismiss()
            }
        }
    }
}

// MARK: - PDF Preview

struct PDFPreviewView: UIViewRepresentable {
    let url: URL

    func makeUIView(context: Context) -> PDFView {
        let pdfView = PDFView()
        pdfView.autoScales = true
        pdfView.displayMode = .singlePageContinuous
        pdfView.displayDirection = .vertical
        return pdfView
    }

    func updateUIView(_ pdfView: PDFView, context: Context) {
        if pdfView.document == nil {
            Task { @MainActor in
                if let document = PDFDocument(url: url) {
                    pdfView.document = document
                }
            }
        }
    }
}

// ShareSheet moved to Common/Views/ShareSheet.swift
