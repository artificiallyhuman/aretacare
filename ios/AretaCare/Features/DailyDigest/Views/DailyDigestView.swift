import SwiftUI

struct DailyDigestView: View {
    let sessionId: String

    @State private var viewModel = DailyDigestViewModel()
    @State private var selectedDigest: DailyPlanResponse?

    // Sheets
    @State private var showingCalendar = false
    @State private var showingEditor = false
    @State private var editingContent = ""

    // Alerts
    @State private var showDeleteConfirmation = false
    @State private var showRegenerateConfirmation = false

    // Haptics
    @State private var copyHapticTrigger = 0
    @State private var deleteHapticTrigger = 0

    var body: some View {
        VStack(spacing: 0) {
            if selectedDigest != nil || viewModel.allDigests.count > 1 {
                dateNavigatorBar
            }

            ScrollView {
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
        .navigationTitle("Daily Digest")
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                if !viewModel.allDigests.isEmpty {
                    Button {
                        showingCalendar = true
                    } label: {
                        Image(systemName: "calendar")
                    }
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
        .task(id: sessionId) {
            // Periodic check every 30 minutes (matches web behavior)
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(1800))
                guard !Task.isCancelled else { break }
                await viewModel.checkShouldGenerate(sessionId: sessionId)
                if viewModel.shouldGenerate && viewModel.allDigests.isEmpty {
                    await viewModel.generate(sessionId: sessionId)
                    selectedDigest = viewModel.latestDigest
                }
            }
        }
        .sheet(isPresented: $showingCalendar) {
            calendarSheet
        }
        .sheet(isPresented: $showingEditor) {
            digestEditor
        }
        .alert("Delete Digest", isPresented: $showDeleteConfirmation) {
            Button("Delete", role: .destructive) {
                guard let digest = selectedDigest else { return }
                deleteHapticTrigger += 1
                Task { await deleteDigest(digest) }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Are you sure you want to delete this digest? This cannot be undone.")
        }
        .alert("Regenerate Digest", isPresented: $showRegenerateConfirmation) {
            Button("Regenerate", role: .destructive) {
                guard let digest = selectedDigest else { return }
                Task { await regenerateDigest(replacing: digest) }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This will delete the current digest and generate a new one. Any edits will be lost.")
        }
        .sensoryFeedback(.success, trigger: copyHapticTrigger)
        .sensoryFeedback(.impact(flexibility: .rigid), trigger: deleteHapticTrigger)
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
            Image(systemName: "doc.text.magnifyingglass")
                .font(.system(size: 48))
                .foregroundStyle(.secondary)

            Text("No Digests Yet")
                .font(.title3.weight(.semibold))

            if viewModel.shouldGenerate {
                Text("Generate a summary of your recent conversations, journal entries, and health activity.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)

                Button {
                    Task { await generateDigest() }
                } label: {
                    Label("Generate Today's Digest", systemImage: "sparkles")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                }
                .buttonStyle(.borderedProminent)
            } else {
                Text("There isn't enough new activity to generate a digest yet. Keep using the app and check back later.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
        }
        .padding(.vertical, 20)
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
                Text("AI-generated \u{2014} not medical advice.")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                Spacer()

                // Action buttons inline
                Button {
                    UIPasteboard.general.string = digest.displayContent
                    copyHapticTrigger += 1
                } label: {
                    Image(systemName: "doc.on.doc")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                Button {
                    editingContent = digest.displayContent
                    showingEditor = true
                } label: {
                    Image(systemName: "pencil")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                Menu {
                    if viewModel.shouldGenerate {
                        Button {
                            showRegenerateConfirmation = true
                        } label: {
                            Label("Regenerate", systemImage: "arrow.clockwise")
                        }
                    }

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
    }

    // MARK: - Calendar Sheet

    private var calendarSheet: some View {
        CalendarSheetView(
            sortedDigests: viewModel.sortedDigests,
            selectedId: selectedDigest?.id,
            onSelect: { digest in
                selectedDigest = digest
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
                            }
                        }
                        .disabled(editingContent.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                }
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

// MARK: - Calendar Sheet View

private struct CalendarSheetView: View {
    let sortedDigests: [DailyPlanResponse]
    let selectedId: Int?
    let onSelect: (DailyPlanResponse) -> Void
    let onDismiss: () -> Void

    var body: some View {
        NavigationStack {
            List {
                ForEach(groupedByMonth, id: \.month) { group in
                    Section(group.month) {
                        ForEach(group.digests) { digest in
                            Button {
                                onSelect(digest)
                            } label: {
                                digestDateRow(digest)
                            }
                            .listRowBackground(
                                digest.id == selectedId
                                    ? Color.accentColor.opacity(0.1)
                                    : Color.clear
                            )
                        }
                    }
                }
            }
            .navigationTitle("Past Digests")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        onDismiss()
                    }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func digestDateRow(_ digest: DailyPlanResponse) -> some View {
        HStack {
            if let date = Date.fromAPIDateString(digest.date) {
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        if date.isToday {
                            Text("Today")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(Color.accentColor)
                        } else {
                            Text(date.weekdayDateString)
                                .font(.subheadline.weight(.medium))
                                .foregroundStyle(.primary)
                        }
                    }
                    Text(digest.createdAt.relativeString)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Spacer()

            if digest.userEditedContent != nil {
                Text("Edited")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .italic()
            }

            if digest.id == selectedId {
                Image(systemName: "checkmark")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(Color.accentColor)
            }
        }
    }

    private struct MonthGroup {
        let month: String
        let digests: [DailyPlanResponse]
    }

    private var groupedByMonth: [MonthGroup] {
        let formatter = DateFormatter()
        formatter.dateFormat = "MMMM yyyy"

        var groups: [String: [DailyPlanResponse]] = [:]
        var order: [String] = []

        for digest in sortedDigests {
            if let date = Date.fromAPIDateString(digest.date) {
                let key = formatter.string(from: date)
                if groups[key] == nil {
                    order.append(key)
                }
                groups[key, default: []].append(digest)
            }
        }

        return order.map { MonthGroup(month: $0, digests: groups[$0] ?? []) }
    }
}

#Preview {
    NavigationStack {
        DailyDigestView(sessionId: "preview-session")
    }
}
