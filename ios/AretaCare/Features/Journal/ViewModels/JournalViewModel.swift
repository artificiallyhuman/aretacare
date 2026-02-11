import Foundation
import Observation

@Observable
final class JournalViewModel {
    private(set) var entriesByDate: [(date: String, entries: [JournalEntryResponse])] = []
    private(set) var isLoading = false
    private(set) var hasMore = false
    private(set) var errorMessage: String?

    var selectedEntryTypes: Set<EntryType> = []

    // Date navigation
    private(set) var allDates: [JournalDateInfo] = []
    private(set) var selectedDateString: String?

    private var oldestDate: String?

    private struct CachedJournal {
        let entriesByDate: [(date: String, entries: [JournalEntryResponse])]
        let hasMore: Bool
        let oldestDate: String?
    }
    private static let cache = ResponseCache<CachedJournal>(ttl: 300) // 5 min

    /// Filtered entries based on selected entry type filters.
    var filteredEntriesByDate: [(date: String, entries: [JournalEntryResponse])] {
        guard !selectedEntryTypes.isEmpty else { return entriesByDate }
        return entriesByDate.compactMap { group in
            let filtered = group.entries.filter { selectedEntryTypes.contains($0.entryType) }
            return filtered.isEmpty ? nil : (group.date, filtered)
        }
    }

    /// Total entry count across all date groups.
    var totalEntryCount: Int {
        entriesByDate.reduce(0) { $0 + $1.entries.count }
    }

    /// All dates sorted most-recent-first.
    var sortedDates: [JournalDateInfo] {
        allDates.sorted { $0.date > $1.date }
    }

    /// Next newer date (step forward in time).
    func nextDate(after current: String) -> JournalDateInfo? {
        let sorted = sortedDates
        guard let idx = sorted.firstIndex(where: { $0.date == current }),
              idx > 0 else { return nil }
        return sorted[idx - 1]
    }

    /// Next older date (step back in time).
    func previousDate(before current: String) -> JournalDateInfo? {
        let sorted = sortedDates
        guard let idx = sorted.firstIndex(where: { $0.date == current }),
              idx < sorted.count - 1 else { return nil }
        return sorted[idx + 1]
    }

    /// Whether the currently selected date is the latest available date.
    var isViewingLatest: Bool {
        guard let selected = selectedDateString else { return true }
        return selected == sortedDates.first?.date
    }

    // MARK: - Fetch Dates

    func fetchDates(sessionId: String) async {
        do {
            let response: JournalDatesResponse = try await APIClient.shared.get(
                APIEndpoints.Journal.dates(sessionId)
            )
            allDates = response.dates
        } catch {
            // Non-fatal; calendar just won't show dates
        }
    }

    // MARK: - Fetch Entries

    func fetchEntries(sessionId: String, endDate: String? = nil, forceRefresh: Bool = false) async {
        // Check cache for initial load only
        if endDate == nil && !forceRefresh, let cached = Self.cache.get(sessionId) {
            entriesByDate = cached.entriesByDate
            hasMore = cached.hasMore
            oldestDate = cached.oldestDate
            return
        }

        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            var queryItems: [URLQueryItem] = [
                URLQueryItem(name: "max_dates", value: String(AppConstants.journalPageSize))
            ]
            if let endDate {
                queryItems.append(URLQueryItem(name: "end_date", value: endDate))
            }

            let response: JournalEntriesGrouped = try await APIClient.shared.get(
                APIEndpoints.Journal.entries(sessionId),
                queryItems: queryItems
            )

            let sorted = response.entriesByDate
                .sorted { $0.key > $1.key }
                .map { (date: $0.key, entries: $0.value) }

            hasMore = response.hasMore ?? false
            oldestDate = response.oldestDate ?? sorted.last?.date

            if endDate != nil {
                // Appending older entries
                entriesByDate.append(contentsOf: sorted)
            } else {
                entriesByDate = sorted
                // Cache initial page
                Self.cache.set(CachedJournal(entriesByDate: sorted, hasMore: hasMore, oldestDate: oldestDate), for: sessionId)
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Load More

    func loadMore(sessionId: String) async {
        guard hasMore, let oldest = oldestDate else { return }
        await fetchEntries(sessionId: sessionId, endDate: oldest)
    }

    // MARK: - Jump to Date

    func jumpToDate(sessionId: String, date: String) async {
        entriesByDate = []
        hasMore = false
        oldestDate = nil
        isJumpedToDate = true
        selectedDateString = date
        await fetchEntries(sessionId: sessionId, endDate: date, forceRefresh: true)
    }

    func jumpToLatest(sessionId: String) async {
        entriesByDate = []
        hasMore = false
        oldestDate = nil
        isJumpedToDate = false
        selectedDateString = nil
        await fetchEntries(sessionId: sessionId, forceRefresh: true)
    }

    private(set) var isJumpedToDate = false

    // MARK: - Create Entry

    func createEntry(sessionId: String, title: String, content: String, entryType: EntryType, entryDate: String?) async {
        errorMessage = nil
        Self.cache.invalidate(sessionId)

        do {
            let request = JournalEntryCreateRequest(
                title: title,
                content: content,
                entryType: entryType,
                entryDate: entryDate
            )
            let _: JournalEntryResponse = try await APIClient.shared.post(
                APIEndpoints.Journal.create(sessionId),
                body: request
            )
            // Refresh all entries to get correct grouping
            await fetchEntries(sessionId: sessionId, forceRefresh: true)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Update Entry

    func updateEntry(sessionId: String, entryId: Int, title: String?, content: String?, entryType: EntryType?, entryDate: String?) async {
        errorMessage = nil
        Self.cache.invalidate(sessionId)

        do {
            let request = JournalEntryUpdateRequest(
                title: title,
                content: content,
                entryType: entryType,
                entryDate: entryDate
            )
            let _: JournalEntryResponse = try await APIClient.shared.put(
                APIEndpoints.Journal.update(String(entryId)),
                body: request
            )
            await fetchEntries(sessionId: sessionId, forceRefresh: true)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Delete Entry

    func deleteEntry(sessionId: String, entryId: Int) async {
        errorMessage = nil
        Self.cache.invalidate(sessionId)

        do {
            try await APIClient.shared.delete(APIEndpoints.Journal.delete(String(entryId)))
            // Remove locally for immediate feedback
            for i in entriesByDate.indices {
                entriesByDate[i].entries.removeAll { $0.id == entryId }
            }
            entriesByDate.removeAll { $0.entries.isEmpty }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Toggle Filter

    func toggleFilter(_ entryType: EntryType) {
        if selectedEntryTypes.contains(entryType) {
            selectedEntryTypes.remove(entryType)
        } else {
            selectedEntryTypes.insert(entryType)
        }
    }

    func clearFilters() {
        selectedEntryTypes.removeAll()
    }

    func dismissError() {
        errorMessage = nil
    }
}
