import SwiftUI

struct DailyDigestView: View {
    let sessionVM: SessionViewModel

    private var sessionId: String {
        sessionVM.currentSession?.id ?? ""
    }

    @Environment(\.horizontalSizeClass) private var sizeClass
    @State private var viewModel = DailyDigestViewModel()
    @State private var selectedDigest: DailyPlanResponse?

    // Sheets
    @State private var showingCalendar = false
    @State private var showingEditor = false
    @State private var editingContent = ""
    @State private var originalEditingContent = ""

    // Alerts
    @State private var showDeleteConfirmation = false
    @State private var showRegenerateConfirmation = false

    // Haptics
    @State private var copyHapticTrigger = 0
    @State private var deleteHapticTrigger = 0
    @State private var saveHapticTrigger = 0
    @State private var showSavedToast = false

    var body: some View {
        HStack(spacing: 0) {
            if sizeClass == .regular, !digestDateInfos.isEmpty {
                DateSidebarView(
                    sortedDates: digestDateInfos,
                    selectedDate: selectedDigest?.date,
                    countLabel: { _ in "" },
                    onSelect: { dateInfo in
                        if let digest = viewModel.digest(for: dateInfo.date) {
                            selectedDigest = digest
                        }
                    }
                )
                .frame(minWidth: 280, idealWidth: 375, maxWidth: 480)
                Divider()
            }

            ScrollView {
                VStack(spacing: 0) {
                    if sizeClass != .regular,
                       selectedDigest != nil || viewModel.allDigests.count > 1 {
                        dateNavigatorBar
                    }

                    VStack(spacing: 20) {
                        if viewModel.isLoading && viewModel.allDigests.isEmpty {
                            loadingState
                        } else if viewModel.isGenerating {
                            generatingState
                        } else if let digest = selectedDigest {
                            digestCard(digest)
                        } else if viewModel.allDigests.isEmpty {
                            initialEmptyState
                        }
                    }
                    .padding()
                }
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                VStack(spacing: 1) {
                    Text("Daily Digest")
                        .font(.headline)
                    if let name = sessionVM.currentSession?.name {
                        Text(name)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
            }
            ToolbarItem(placement: .topBarLeading) {
                if sizeClass != .regular, !viewModel.allDigests.isEmpty {
                    Button {
                        showingCalendar = true
                    } label: {
                        Image(systemName: "calendar")
                    }
                    .accessibilityLabel("Open calendar")
                }
            }
        }
        .task {
            await loadData()
        }
        .onChange(of: sessionId) { _, newId in
            guard !newId.isEmpty else { return }
            selectedDigest = nil
            Task { await loadData() }
        }
        .refreshable {
            await loadData(forceRefresh: true)
        }
        .sheet(isPresented: $showingCalendar) {
            calendarSheet
        }
        .sheet(isPresented: $showingEditor) {
            digestEditor
        }
        .sensoryFeedback(.success, trigger: copyHapticTrigger)
        .sensoryFeedback(.success, trigger: saveHapticTrigger)
        .sensoryFeedback(.impact(flexibility: .rigid), trigger: deleteHapticTrigger)
        .toast("Saved", icon: "checkmark", isPresented: $showSavedToast)
        .animation(.spring(duration: 0.3), value: showSavedToast)
        .overlay(alignment: .top) {
            if let error = viewModel.errorMessage {
                ErrorBannerView(message: error) {
                    viewModel.dismissError()
                }
                .padding(.top, 8)
            }
        }
    }

    // MARK: - Helpers

    private var isViewingLatest: Bool {
        guard let selected = selectedDigest else { return true }
        return selected.id == viewModel.sortedDigests.first?.id
    }

    // MARK: - Data Loading

    private func loadData(forceRefresh: Bool = false) async {
        guard !sessionId.isEmpty else { return }

        // Sequential fetches — concurrent async let mutations of @Observable
        // properties can cause SwiftUI to cancel the .refreshable task.
        await viewModel.fetchAll(sessionId: sessionId)
        await viewModel.fetchLatest(sessionId: sessionId, forceRefresh: forceRefresh)
        await viewModel.checkShouldGenerate(sessionId: sessionId)

        // Auto-select latest, or refresh the selected digest's data
        if let current = selectedDigest,
           let refreshed = viewModel.allDigests.first(where: { $0.id == current.id }) {
            selectedDigest = refreshed
        } else {
            selectedDigest = viewModel.sortedDigests.first
        }

        // Mark as viewed
        if let digest = selectedDigest, !digest.viewed {
            await viewModel.markViewed(planId: digest.id)
        }
    }

    // MARK: - Loading State

    private var loadingState: some View {
        VStack(spacing: 16) {
            ProgressView()
            Text("Loading digests...")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
    }

    // MARK: - Generating State

    private var generatingState: some View {
        VStack(spacing: 16) {
            ProgressView()
                .controlSize(.large)
            Text("Generating your daily digest...")
                .font(.headline)
            Text("This may take 10\u{2013}30 seconds as we analyze your recent activity.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
    }

    // MARK: - Empty State

    private var initialEmptyState: some View {
        VStack(spacing: 20) {
            Image(systemName: "list.clipboard")
                .font(.largeTitle)
                .imageScale(.large)
                .foregroundStyle(Color.accentColor)
                .accessibilityHidden(true)

            Text("No Daily Digests Yet")
                .font(.title3.weight(.semibold))

            Text("Your first daily digest will auto-generate after 24 hours of activity")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            Button {
                Task { await generateDigest() }
            } label: {
                Text("Generate Your First Daily Digest")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
            }
            .accessibilityHint("Generates a summary of your recent activity")
            .buttonStyle(.borderedProminent)
            .disabled(viewModel.isLoading || viewModel.isGenerating)
        }
        .padding(24)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    // MARK: - Date Navigator Bar

    private var dateNavigatorBar: some View {
        VStack(spacing: 0) {
            HStack {
                Button {
                    if let current = selectedDigest,
                       let older = viewModel.previousDigest(before: current) {
                        selectedDigest = older
                    }
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.body.weight(.medium))
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel("Previous date")
                .disabled(selectedDigest.flatMap { viewModel.previousDigest(before: $0) } == nil)

                Spacer()

                if let digest = selectedDigest,
                   let date = Date.fromAPIDateString(digest.date) {
                    VStack(spacing: 2) {
                        if date.isToday {
                            Text("Today")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(Color.accentColor)
                        }
                        Text(date.weekdayDateString)
                            .font(date.isToday ? .caption : .subheadline.weight(.medium))
                            .foregroundStyle(date.isToday ? .secondary : .primary)
                    }
                }

                Spacer()

                Button {
                    if let current = selectedDigest,
                       let newer = viewModel.nextDigest(after: current) {
                        selectedDigest = newer
                    }
                } label: {
                    Image(systemName: "chevron.right")
                        .font(.body.weight(.medium))
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel("Next date")
                .disabled(selectedDigest.flatMap { viewModel.nextDigest(after: $0) } == nil)
            }
            .padding(.horizontal, 4)
            .padding(.vertical, 4)

            if !isViewingLatest {
                Button {
                    selectedDigest = viewModel.sortedDigests.first
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "arrow.right.to.line")
                            .font(.caption2)
                        Text("Go to Latest")
                            .font(.caption.weight(.medium))
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                }
                .accessibilityLabel("Go to latest digest")
                .padding(.bottom, 6)
            }

            Divider()
        }
        .background(Color(.secondarySystemBackground))
    }

    // MARK: - Digest Card

    private func digestCard(_ digest: DailyPlanResponse) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header bar: disclaimer + actions
            HStack(alignment: .center, spacing: 8) {
                Image(systemName: "info.circle")
                    .foregroundStyle(.orange)
                    .font(.caption)
                    .accessibilityHidden(true)
                Text("Daily Digest summarizes information you've provided and is not medical advice.")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                Spacer()

                Menu {
                    Button {
                        ClipboardHelper.copyFormatted(digest.displayContent)
                        copyHapticTrigger += 1
                    } label: {
                        Label("Copy", systemImage: "doc.on.doc")
                    }

                    Button {
                        editingContent = digest.displayContent
                        originalEditingContent = digest.displayContent
                        showingEditor = true
                    } label: {
                        Label("Edit", systemImage: "pencil")
                    }

                    Button {
                        showRegenerateConfirmation = true
                    } label: {
                        Label("Regenerate", systemImage: "arrow.clockwise")
                    }

                    Divider()

                    Button(role: .destructive) {
                        showDeleteConfirmation = true
                    } label: {
                        Label("Delete", systemImage: "trash")
                    }
                } label: {
                    Image(systemName: "ellipsis")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .frame(width: 28, height: 28)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel("More actions")
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(Color.orange.opacity(0.06))

            Divider()

            // Markdown content
            MarkdownTextView(content: digest.displayContent)
                .padding(16)

            Divider()

            // Footer
            HStack {
                Text("Created \(digest.createdAt.relativeString)")
                    .font(.caption)
                    .foregroundStyle(.tertiary)

                Spacer()

                if digest.userEditedContent != nil {
                    HStack(spacing: 4) {
                        Image(systemName: "pencil.line")
                            .font(.caption2)
                        Text("Edited")
                            .font(.caption2)
                    }
                    .foregroundStyle(.secondary)
                    .italic()
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
        }
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .contextMenu {
            Button {
                ClipboardHelper.copyFormatted(digest.displayContent)
                copyHapticTrigger += 1
            } label: {
                Label("Copy", systemImage: "doc.on.doc")
            }
            Button {
                editingContent = digest.displayContent
                showingEditor = true
            } label: {
                Label("Edit", systemImage: "pencil")
            }
            Button {
                showRegenerateConfirmation = true
            } label: {
                Label("Regenerate", systemImage: "arrow.clockwise")
            }
            Divider()
            Button(role: .destructive) {
                showDeleteConfirmation = true
            } label: {
                Label("Delete", systemImage: "trash")
            }
        }
        .confirmationDialog("Delete Digest", isPresented: $showDeleteConfirmation, titleVisibility: .visible) {
            Button("Delete", role: .destructive) {
                guard let digest = selectedDigest else { return }
                guard !viewModel.isLoading && !viewModel.isGenerating else { return }
                deleteHapticTrigger += 1
                Task { await deleteDigest(digest) }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Are you sure you want to delete this digest? This cannot be undone.")
        }
        .confirmationDialog("Regenerate Digest", isPresented: $showRegenerateConfirmation, titleVisibility: .visible) {
            Button("Regenerate", role: .destructive) {
                guard let digest = selectedDigest else { return }
                guard !viewModel.isLoading && !viewModel.isGenerating else { return }
                Task { await regenerateDigest(replacing: digest) }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This will delete the current digest and generate a new one. Any edits will be lost.")
        }
    }

    // MARK: - Calendar Sheet

    private var digestDateInfos: [JournalDateInfo] {
        viewModel.sortedDigests.map { JournalDateInfo(date: $0.date, entryCount: 1) }
    }

    private var calendarSheet: some View {
        DateCalendarSheetView(
            sortedDates: digestDateInfos,
            selectedDate: selectedDigest?.date,
            title: "Past Digests",
            countLabel: { _ in "" },
            onSelect: { dateInfo in
                if let digest = viewModel.digest(for: dateInfo.date) {
                    selectedDigest = digest
                }
                showingCalendar = false
            },
            onDismiss: {
                showingCalendar = false
            }
        )
    }

    // MARK: - Editor Sheet

    private var digestEditor: some View {
        NavigationStack {
            TextEditor(text: $editingContent)
                .font(.body)
                .padding(12)
                .scrollContentBackground(.hidden)
                .background(Color(.secondarySystemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .overlay(
                    RoundedRectangle(cornerRadius: 10)
                        .strokeBorder(Color(.separator).opacity(0.5), lineWidth: 0.5)
                )
                .padding()
                .navigationTitle("Edit Digest")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") {
                            showingEditor = false
                        }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Save") {
                            Task {
                                if let planId = selectedDigest?.id {
                                    await viewModel.updateContent(
                                        planId: planId,
                                        content: editingContent.trimmingCharacters(in: .whitespacesAndNewlines)
                                    )
                                    if let updated = viewModel.allDigests.first(where: { $0.id == planId }) {
                                        selectedDigest = updated
                                    }
                                }
                                showingEditor = false
                                saveHapticTrigger += 1
                                withAnimation(.spring(duration: 0.3)) {
                                    showSavedToast = true
                                }
                            }
                        }
                        .disabled(editingContent.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || viewModel.isLoading)
                    }
                }
                .interactiveDismissDisabled(editingContent != originalEditingContent)
        }
    }

    // MARK: - Actions

    private func generateDigest() async {
        await viewModel.generate(sessionId: sessionId)
        selectedDigest = viewModel.latestDigest
    }

    private func deleteDigest(_ digest: DailyPlanResponse) async {
        let nextSelection = viewModel.nextDigest(after: digest)
            ?? viewModel.previousDigest(before: digest)
        await viewModel.deleteDigest(planId: digest.id)
        selectedDigest = nextSelection
    }

    private func regenerateDigest(replacing digest: DailyPlanResponse) async {
        await viewModel.deleteDigest(planId: digest.id)
        await viewModel.checkShouldGenerate(sessionId: sessionId)
        await viewModel.generate(sessionId: sessionId)
        selectedDigest = viewModel.latestDigest
    }
}

#Preview {
    NavigationStack {
        DailyDigestView(sessionVM: SessionViewModel())
    }
}
