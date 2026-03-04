import SwiftUI

struct JournalView: View {
    let sessionId: String
    var sessionName: String = ""

    @Environment(\.horizontalSizeClass) private var sizeClass
    @State private var viewModel = JournalViewModel()
    @State private var showingEditor = false
    @State private var showingDatePicker = false
    @State private var entryToDelete: JournalEntryResponse?
    @State private var showDeleteConfirmation = false
    @State private var searchText = ""
    @State private var debouncedSearchText = ""
    @State private var searchDebounceTask: Task<Void, Never>?
    @State private var deleteHapticTrigger = 0

    private var currentUserId: String { AuthManager.shared.currentUser?.id ?? "" }

    var body: some View {
        HStack(spacing: 0) {
            if sizeClass == .regular, !viewModel.allDates.isEmpty {
                DateSidebarView(
                    sortedDates: viewModel.sortedDates,
                    selectedDate: viewModel.selectedDateString,
                    countLabel: { count in "\(count) \(count == 1 ? "entry" : "entries")" },
                    onSelect: { dateInfo in
                        Task { await viewModel.jumpToDate(sessionId: sessionId, date: dateInfo.date) }
                    },
                    onShowAll: {
                        Task { await viewModel.jumpToLatest(sessionId: sessionId) }
                    }
                )
                .frame(width: 260)
                Divider()
            }

            ZStack(alignment: .bottomTrailing) {
                Group {
                    if viewModel.isLoading && viewModel.entriesByDate.isEmpty {
                        SkeletonListView()
                    } else if viewModel.entriesByDate.isEmpty {
                        ContentUnavailableView(
                            "No Journal Entries Yet",
                            systemImage: "book",
                            description: Text("Start a conversation to generate entries, or tap + to create one manually.")
                        )
                    } else {
                        journalList
                    }
                }

                // Floating add button
                Button {
                    showingEditor = true
                } label: {
                    Image(systemName: "plus")
                        .font(.title2.weight(.semibold))
                        .foregroundStyle(.white)
                        .frame(width: 56, height: 56)
                        .background(Circle().fill(Color.accentColor))
                        .shadow(color: .black.opacity(0.15), radius: 4, y: 2)
                }
                .accessibilityLabel("Create new journal entry")
                .padding(24)
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $searchText, prompt: "Search journal entries...")
        .toolbar {
            ToolbarItem(placement: .principal) {
                VStack(spacing: 1) {
                    Text("Care Journal")
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
        }
        .onChange(of: searchText) { _, newValue in
            searchDebounceTask?.cancel()
            searchDebounceTask = Task {
                try? await Task.sleep(for: .milliseconds(200))
                guard !Task.isCancelled else { return }
                debouncedSearchText = newValue
            }
        }
        .task {
            await viewModel.fetchEntries(sessionId: sessionId)
            await viewModel.fetchDates(sessionId: sessionId)
        }
        .sheet(isPresented: $showingDatePicker) {
            DateCalendarSheetView(
                sortedDates: viewModel.sortedDates,
                selectedDate: viewModel.selectedDateString,
                title: "Journal Dates",
                countLabel: { count in "\(count) \(count == 1 ? "entry" : "entries")" },
                onSelect: { dateInfo in
                    showingDatePicker = false
                    Task { await viewModel.jumpToDate(sessionId: sessionId, date: dateInfo.date) }
                },
                onDismiss: { showingDatePicker = false }
            )
        }
        .sheet(isPresented: $showingEditor) {
            JournalEntryEditorView(sessionId: sessionId, viewModel: viewModel)
        }
        .sensoryFeedback(.impact(flexibility: .rigid), trigger: deleteHapticTrigger)
        .confirmationDialog("Delete Entry", isPresented: $showDeleteConfirmation, titleVisibility: .visible) {
            Button("Delete", role: .destructive) {
                if let entry = entryToDelete {
                    deleteHapticTrigger += 1
                    Task {
                        await viewModel.deleteEntry(sessionId: sessionId, entryId: entry.id)
                    }
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Are you sure you want to delete this journal entry? This cannot be undone.")
        }
        .overlay(alignment: .top) {
            if let error = viewModel.errorMessage {
                ErrorBannerView(message: error) {
                    viewModel.dismissError()
                }
                .padding(.top, 8)
            }
        }
    }

    // MARK: - Search Filtering

    private var searchFilteredGroups: [(date: String, entries: [JournalEntryResponse])] {
        let filtered = viewModel.filteredEntriesByDate
        guard !debouncedSearchText.isEmpty else { return filtered }
        let lowered = debouncedSearchText.lowercased()
        return filtered.compactMap { group in
            let matches = group.entries.filter {
                $0.title.lowercased().contains(lowered) ||
                $0.content.lowercased().contains(lowered)
            }
            return matches.isEmpty ? nil : (group.date, matches)
        }
    }

    // MARK: - Filter Chips

    private var filterChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(EntryType.allCases, id: \.self) { entryType in
                    let isSelected = viewModel.selectedEntryTypes.contains(entryType)
                    FilterChipView(
                        title: entryType.displayName,
                        isSelected: isSelected,
                        icon: entryType.systemImage,
                        selectedColor: entryType.themeColor
                    ) {
                        viewModel.toggleFilter(entryType)
                    }
                    .accessibilityAddTraits(isSelected ? .isSelected : [])
                }

                if !viewModel.selectedEntryTypes.isEmpty {
                    Button {
                        viewModel.clearFilters()
                    } label: {
                        Text("Clear")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .padding(.horizontal)
            .padding(.vertical, 8)
        }
    }

    // MARK: - Journal List

    private var journalList: some View {
        VStack(spacing: 0) {
            if viewModel.isJumpedToDate {
                dateNavigatorBar
            }

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 4, pinnedViews: .sectionHeaders) {
                    Section {
                        HStack(spacing: 8) {
                            Image(systemName: "info.circle")
                                .foregroundStyle(.orange)
                                .font(.caption)
                            Text("Journal entries are generated from your conversations and uploads. Review for accuracy before sharing.")
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

                        filterChips
                    }

                let displayGroups = searchFilteredGroups

                if displayGroups.isEmpty && !debouncedSearchText.isEmpty {
                    ContentUnavailableView.search(text: debouncedSearchText)
                        .listRowSeparator(.hidden)
                } else if displayGroups.isEmpty && !viewModel.selectedEntryTypes.isEmpty {
                    ContentUnavailableView(
                        "No Entries in This Category",
                        systemImage: "line.3.horizontal.decrease.circle",
                        description: Text("Try selecting a different category or clear the filter.")
                    )
                    .listRowSeparator(.hidden)
                }

                ForEach(displayGroups, id: \.date) { group in
                    Section {
                        ForEach(group.entries) { entry in
                            NavigationLink {
                                JournalEntryDetailView(
                                    entry: entry,
                                    sessionId: sessionId,
                                    viewModel: viewModel
                                )
                            } label: {
                                JournalEntryRow(entry: entry, currentUserId: currentUserId)
                            }
                            .buttonStyle(.plain)
                            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                Button(role: .destructive) {
                                    entryToDelete = entry
                                    showDeleteConfirmation = true
                                } label: {
                                    Label("Delete", systemImage: "trash")
                                }
                            }
                            .contextMenu {
                                Button {
                                    UIPasteboard.general.string = entry.content
                                } label: {
                                    Label("Copy Content", systemImage: "doc.on.doc")
                                }
                                Button(role: .destructive) {
                                    entryToDelete = entry
                                    showDeleteConfirmation = true
                                } label: {
                                    Label("Delete", systemImage: "trash")
                                }
                            }
                        }
                    } header: {
                        dateHeader(dateString: group.date, count: group.entries.count)
                    }
                }

                if viewModel.hasMore {
                    Button {
                        Task {
                            await viewModel.loadMore(sessionId: sessionId)
                        }
                    } label: {
                        HStack {
                            Spacer()
                            if viewModel.isLoading {
                                ProgressView()
                            } else {
                                Label("Load Older Entries", systemImage: "arrow.down")
                                    .font(.subheadline)
                            }
                            Spacer()
                        }
                        .padding(.vertical, 16)
                    }
                    .disabled(viewModel.isLoading)
                }
                }
            }
            .refreshable {
                await viewModel.fetchEntries(sessionId: sessionId, forceRefresh: true)
                await viewModel.fetchDates(sessionId: sessionId)
            }
        }
    }

    // MARK: - Date Navigator Bar

    private var dateNavigatorBar: some View {
        VStack(spacing: 0) {
            HStack {
                Button {
                    if let current = viewModel.selectedDateString,
                       let older = viewModel.previousDate(before: current) {
                        Task { await viewModel.jumpToDate(sessionId: sessionId, date: older.date) }
                    }
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.body.weight(.medium))
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel("Previous date")
                .disabled(viewModel.selectedDateString.flatMap { viewModel.previousDate(before: $0) } == nil)

                Spacer()

                if let dateStr = viewModel.selectedDateString,
                   let date = Date.fromAPIDateString(dateStr) {
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
                    if let current = viewModel.selectedDateString,
                       let newer = viewModel.nextDate(after: current) {
                        Task { await viewModel.jumpToDate(sessionId: sessionId, date: newer.date) }
                    }
                } label: {
                    Image(systemName: "chevron.right")
                        .font(.body.weight(.medium))
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel("Next date")
                .disabled(viewModel.selectedDateString.flatMap { viewModel.nextDate(after: $0) } == nil)
            }
            .padding(.horizontal, 4)
            .padding(.vertical, 4)

            if !viewModel.isViewingLatest {
                Button {
                    Task { await viewModel.jumpToLatest(sessionId: sessionId) }
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

    // MARK: - Date Header

    private func dateHeader(dateString: String, count: Int) -> some View {
        HStack {
            if let date = Date.fromAPIDateString(dateString) {
                Text(date.mediumDateString)
                    .font(.headline)
            } else {
                Text(dateString)
                    .font(.headline)
            }
            Spacer()
            Text("\(count) \(count == 1 ? "entry" : "entries")")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal)
        .padding(.vertical, 10)
        .background(.bar)
    }
}

// MARK: - Entry Row

private struct JournalEntryRow: View {
    let entry: JournalEntryResponse
    let currentUserId: String

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Colored accent bar
            entry.entryType.themeColor
                .frame(height: 3)

            VStack(alignment: .leading, spacing: 10) {
                // Title
                Text(entry.title)
                    .font(.body.weight(.medium))
                    .foregroundStyle(.primary)
                    .multilineTextAlignment(.leading)
                    .lineLimit(2)

                // Content preview (markdown, height-constrained)
                MarkdownTextView(content: entry.content)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .frame(maxHeight: 44, alignment: .top)
                    .clipped()

                // Metadata row
                HStack(spacing: 8) {
                    // Entry type pill
                    HStack(spacing: 4) {
                        Image(systemName: entry.entryType.systemImage)
                            .font(.caption2)
                        Text(entry.entryType.displayName)
                            .font(.caption2.weight(.medium))
                    }
                    .foregroundStyle(entry.entryType.themeColor)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(
                        Capsule().fill(entry.entryType.themeColor.opacity(0.1))
                    )

                    // AI badge
                    if let sourceIds = entry.sourceMessageIds, !sourceIds.isEmpty {
                        Text("AI")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 3)
                            .background(Capsule().fill(.purple))
                            .accessibilityLabel("AI generated")
                    }

                    // Source tag
                    if let sourceTag = entry.lastEditedBy ?? entry.createdByInfo {
                        SourceTagView(sourceTag: sourceTag, currentUserId: currentUserId)
                    }

                    Spacer()

                    // Timestamp
                    Text(entry.createdAt.timeString)
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
            }
            .padding(14)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.06), radius: 3, y: 1)
        .padding(.horizontal)
        .padding(.vertical, 4)
        .contentShape(Rectangle())
    }
}

#Preview {
    NavigationStack {
        JournalView(sessionId: "preview-session", sessionName: "Preview")
    }
}
