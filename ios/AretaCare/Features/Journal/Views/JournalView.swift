import SwiftUI

struct JournalView: View {
    let sessionId: String

    @State private var viewModel = JournalViewModel()
    @State private var showingEditor = false
    @State private var showingDatePicker = false
    @State private var entryToDelete: JournalEntryResponse?
    @State private var showDeleteConfirmation = false
    @State private var searchText = ""
    @State private var deleteHapticTrigger = 0

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            Group {
                if viewModel.isLoading && viewModel.entriesByDate.isEmpty {
                    SkeletonListView()
                } else if viewModel.entriesByDate.isEmpty {
                    EmptyStateView(
                        systemImage: "book",
                        title: "No Journal Entries Yet",
                        subtitle: "Start a conversation to generate entries, or tap + to create one manually."
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
            .padding(24)
        }
        .navigationTitle("Care Journal")
        .searchable(text: $searchText, prompt: "Search journal entries...")
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
        }
        .task {
            await viewModel.fetchEntries(sessionId: sessionId)
            await viewModel.fetchDates(sessionId: sessionId)
        }
        .refreshable {
            await viewModel.fetchEntries(sessionId: sessionId, forceRefresh: true)
            await viewModel.fetchDates(sessionId: sessionId)
        }
        .sheet(isPresented: $showingDatePicker) {
            JournalCalendarSheetView(
                sortedDates: viewModel.sortedDates,
                selectedDate: viewModel.selectedDateString,
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
        .alert("Delete Entry", isPresented: $showDeleteConfirmation) {
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
        guard !searchText.isEmpty else { return filtered }
        let lowered = searchText.lowercased()
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
                    Button {
                        viewModel.toggleFilter(entryType)
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: entryType.systemImage)
                                .font(.caption2)
                            Text(entryType.displayName)
                                .font(.caption)
                        }
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(
                            Capsule().fill(isSelected ? entryType.themeColor : Color(.systemGray5))
                        )
                        .foregroundStyle(isSelected ? .white : .primary)
                    }
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
                        filterChips
                    }

                let displayGroups = searchFilteredGroups

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
                                JournalEntryRow(entry: entry)
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

// MARK: - Calendar Sheet View

private struct JournalCalendarSheetView: View {
    let sortedDates: [JournalDateInfo]
    let selectedDate: String?
    let onSelect: (JournalDateInfo) -> Void
    let onDismiss: () -> Void

    var body: some View {
        NavigationStack {
            List {
                ForEach(groupedByMonth, id: \.month) { group in
                    Section(group.month) {
                        ForEach(group.dates) { dateInfo in
                            Button {
                                onSelect(dateInfo)
                            } label: {
                                dateRow(dateInfo)
                            }
                            .listRowBackground(
                                dateInfo.date == selectedDate
                                    ? Color.accentColor.opacity(0.1)
                                    : Color.clear
                            )
                        }
                    }
                }
            }
            .navigationTitle("Journal Dates")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { onDismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func dateRow(_ dateInfo: JournalDateInfo) -> some View {
        HStack {
            if let date = Date.fromAPIDateString(dateInfo.date) {
                VStack(alignment: .leading, spacing: 2) {
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
            }

            Spacer()

            Text("\(dateInfo.entryCount) \(dateInfo.entryCount == 1 ? "entry" : "entries")")
                .font(.caption)
                .foregroundStyle(.secondary)

            if dateInfo.date == selectedDate {
                Image(systemName: "checkmark")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(Color.accentColor)
            }
        }
    }

    private struct MonthGroup {
        let month: String
        let dates: [JournalDateInfo]
    }

    private var groupedByMonth: [MonthGroup] {
        let formatter = DateFormatter()
        formatter.dateFormat = "MMMM yyyy"

        var groups: [String: [JournalDateInfo]] = [:]
        var order: [String] = []

        for dateInfo in sortedDates {
            if let date = Date.fromAPIDateString(dateInfo.date) {
                let key = formatter.string(from: date)
                if groups[key] == nil {
                    order.append(key)
                }
                groups[key, default: []].append(dateInfo)
            }
        }

        return order.map { MonthGroup(month: $0, dates: groups[$0] ?? []) }
    }
}

#Preview {
    NavigationStack {
        JournalView(sessionId: "preview-session")
    }
}
