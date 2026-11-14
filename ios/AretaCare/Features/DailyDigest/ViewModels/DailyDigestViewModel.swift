import Foundation
import Observation

@Observable @MainActor
final class DailyDigestViewModel {
    private(set) var latestDigest: DailyPlanResponse?
    private(set) var allDigests: [DailyPlanResponse] = []
    private(set) var shouldGenerate = false
    private(set) var isLoading = false
    private(set) var errorMessage: String?

    /// The care session whose digests are shown. Only `show(sessionId:)` sets it. Every
    /// method re-checks it after awaiting, so a digest fetched or generated for one care
    /// session can't land in another's list (generating in A and switching to B used to
    /// put A's new digest at the top of B's Digest screen).
    private(set) var activeSessionId: String?

    /// Care sessions with a generation in flight; `isGenerating` describes the one shown.
    private var generatingSessionIds: Set<String> = []

    var isGenerating: Bool {
        activeSessionId.map { generatingSessionIds.contains($0) } ?? false
    }

    private static let latestCache = ResponseCache<DailyPlanResponse>(ttl: 600) // 10 min

    /// True if the error is a task cancellation (view lifecycle), not a real failure.
    private func isCancellation(_ error: Error) -> Bool {
        if error is CancellationError { return true }
        if (error as? URLError)?.code == .cancelled { return true }
        if case APIError.networkError(let underlying) = error,
           (underlying as? URLError)?.code == .cancelled { return true }
        return false
    }

    // MARK: - Care Session

    /// Shows a care session's digests, clearing the previous session's if it was different.
    /// Call before loading, on first appearance and on every switch.
    func show(sessionId: String) {
        guard sessionId != activeSessionId else { return }
        activeSessionId = sessionId
        latestDigest = nil
        allDigests = []
        shouldGenerate = false
        isLoading = false
        errorMessage = nil
    }

    // MARK: - Fetch Latest

    func fetchLatest(sessionId: String, forceRefresh: Bool = false) async {
        guard sessionId == activeSessionId else { return }
        if !forceRefresh, let cached = Self.latestCache.get(sessionId) {
            latestDigest = cached
            return
        }

        isLoading = true
        errorMessage = nil
        defer {
            if sessionId == activeSessionId { isLoading = false }
        }

        do {
            let digest: DailyPlanResponse? = try await APIClient.shared.get(
                APIEndpoints.DailyPlans.latest(sessionId)
            )
            if let digest {
                Self.latestCache.set(digest, for: sessionId)
            }
            guard sessionId == activeSessionId else { return }
            latestDigest = digest
        } catch let error as APIError {
            guard sessionId == activeSessionId else { return }
            if case .notFound = error {
                latestDigest = nil
            } else if !isCancellation(error) {
                errorMessage = error.localizedDescription
            }
        } catch {
            guard sessionId == activeSessionId else { return }
            if !isCancellation(error) {
                errorMessage = error.localizedDescription
            }
        }
    }

    // MARK: - Fetch All

    func fetchAll(sessionId: String) async {
        guard sessionId == activeSessionId else { return }
        errorMessage = nil

        do {
            let response: DailyPlanListResponse = try await APIClient.shared.get(
                APIEndpoints.DailyPlans.all(sessionId)
            )
            guard sessionId == activeSessionId else { return }
            allDigests = response.plans
        } catch {
            guard sessionId == activeSessionId else { return }
            if !isCancellation(error) {
                errorMessage = error.localizedDescription
            }
        }
    }

    // MARK: - Check Should Generate

    /// `failOpen` decides what a failed check means. The Digest screen uses it to show
    /// the Generate button, where allowing is harmless. The automatic path passes
    /// false: a transient error must not start an AI generation nobody asked for.
    func checkShouldGenerate(sessionId: String, failOpen: Bool = true) async {
        guard sessionId == activeSessionId else { return }
        do {
            let response: DailyPlanCheckResponse = try await APIClient.shared.get(
                APIEndpoints.DailyPlans.check(sessionId)
            )
            guard sessionId == activeSessionId else { return }
            shouldGenerate = response.shouldGenerate
        } catch {
            guard sessionId == activeSessionId else { return }
            shouldGenerate = failOpen
        }
    }

    // MARK: - Automatic Generation

    /// Last automatic attempt per care session, so launching, switching sessions and
    /// the periodic check cannot fire several generations in a row.
    private static var lastAutoAttempt: [String: Date] = [:]
    private static let autoAttemptCooldown: TimeInterval = 600

    /// Generates today's digest when the server says one is due. Same rule as the web
    /// app: only after 2 AM local time, so a late-night session does not produce
    /// "today's" digest before the day has started.
    func autoGenerateIfDue(sessionId: String) async {
        guard !isGenerating else { return }
        guard Calendar.current.component(.hour, from: Date()) >= 2 else { return }
        if let last = Self.lastAutoAttempt[sessionId],
           Date().timeIntervalSince(last) < Self.autoAttemptCooldown {
            return
        }

        await checkShouldGenerate(sessionId: sessionId, failOpen: false)
        guard shouldGenerate, !Task.isCancelled else { return }

        Self.lastAutoAttempt[sessionId] = Date()
        await generate(sessionId: sessionId)
    }

    // MARK: - Generate

    /// Generates today's digest for a care session. If the user has switched away by the
    /// time it is ready, it is saved for its own session and not shown here.
    func generate(sessionId: String) async {
        generatingSessionIds.insert(sessionId)
        if sessionId == activeSessionId { errorMessage = nil }
        Self.latestCache.invalidate(sessionId)
        defer { generatingSessionIds.remove(sessionId) }

        do {
            // "Today" is the user's local date; the server otherwise falls back to its
            // own (UTC) date, which is already tomorrow during a US evening.
            let digest: DailyPlanResponse = try await APIClient.shared.post(
                APIEndpoints.DailyPlans.generate(sessionId),
                queryItems: [URLQueryItem(name: "user_date", value: Date().apiDateString)]
            )
            Self.latestCache.set(digest, for: sessionId)
            guard sessionId == activeSessionId else { return }
            latestDigest = digest
            shouldGenerate = false
            // Prepend to history
            allDigests.insert(digest, at: 0)
        } catch {
            guard sessionId == activeSessionId else { return }
            if !isCancellation(error) {
                errorMessage = error.localizedDescription
            }
        }
    }

    // MARK: - Update Content

    func updateContent(planId: Int, content: String) async {
        errorMessage = nil

        do {
            let request = DailyPlanUpdateRequest(userEditedContent: content)
            let updated: DailyPlanResponse = try await APIClient.shared.put(
                APIEndpoints.DailyPlans.update(String(planId)),
                body: request
            )
            if latestDigest?.id == planId {
                latestDigest = updated
            }
            if let index = allDigests.firstIndex(where: { $0.id == planId }) {
                allDigests[index] = updated
            }
        } catch {
            if !isCancellation(error) {
                errorMessage = error.localizedDescription
            }
        }
    }

    // MARK: - Mark Viewed

    func markViewed(planId: Int) async {
        do {
            let request = DailyPlanMarkViewedRequest(viewed: true)
            try await APIClient.shared.put(
                APIEndpoints.DailyPlans.markViewed(String(planId)),
                body: request
            )
            // Update local state so hasUnviewedDigest recalculates immediately
            if let index = allDigests.firstIndex(where: { $0.id == planId }) {
                allDigests[index].viewed = true
            }
            if latestDigest?.id == planId {
                latestDigest?.viewed = true
            }
        } catch {
            // Non-fatal
            #if DEBUG
            print("[DailyDigest] Mark viewed failed: \(error)")
            #endif
        }
    }

    // MARK: - Delete

    func deleteDigest(planId: Int) async {
        errorMessage = nil
        // Capture sessionId before modifying state
        let sessionId = allDigests.first(where: { $0.id == planId })?.sessionId
            ?? latestDigest?.sessionId
        let shownSessionId = activeSessionId

        do {
            try await APIClient.shared.delete(APIEndpoints.DailyPlans.delete(String(planId)))
            allDigests.removeAll { $0.id == planId }
            if latestDigest?.id == planId {
                latestDigest = allDigests.first
            }
            if let sessionId {
                Self.latestCache.invalidate(sessionId)
            }
        } catch {
            guard shownSessionId == activeSessionId else { return }
            if !isCancellation(error) {
                errorMessage = error.localizedDescription
            }
        }
    }

    /// Whether the latest digest has not been viewed yet.
    var hasUnviewedDigest: Bool {
        guard let latest = sortedDigests.first else { return false }
        return !latest.viewed
    }

    func dismissError() {
        errorMessage = nil
    }

    // MARK: - Navigation Helpers

    /// All digests sorted most-recent-first by date.
    var sortedDigests: [DailyPlanResponse] {
        allDigests.sorted { $0.date > $1.date }
    }

    /// Set of date strings (YYYY-MM-DD) that have digests.
    var digestDates: Set<String> {
        Set(allDigests.map(\.date))
    }

    /// Earliest digest date (lower bound for calendar).
    var oldestDigestDate: Date? {
        allDigests.compactMap { Date.fromAPIDateString($0.date) }.min()
    }

    /// Find digest matching an exact date string.
    func digest(for dateString: String) -> DailyPlanResponse? {
        allDigests.first { $0.date == dateString }
    }

    /// Find the closest digest on or before a given date.
    func nearestDigest(to date: Date) -> DailyPlanResponse? {
        let target = date.apiDateString
        return sortedDigests.first { $0.date <= target }
    }

    /// The next newer digest (step right / forward in time).
    func nextDigest(after current: DailyPlanResponse) -> DailyPlanResponse? {
        guard let idx = sortedDigests.firstIndex(where: { $0.id == current.id }),
              idx > 0 else { return nil }
        return sortedDigests[idx - 1]
    }

    /// The next older digest (step left / back in time).
    func previousDigest(before current: DailyPlanResponse) -> DailyPlanResponse? {
        guard let idx = sortedDigests.firstIndex(where: { $0.id == current.id }),
              idx < sortedDigests.count - 1 else { return nil }
        return sortedDigests[idx + 1]
    }
}
