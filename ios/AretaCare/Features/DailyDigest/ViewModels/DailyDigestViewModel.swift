import Foundation
import Observation

@Observable @MainActor
final class DailyDigestViewModel {
    private(set) var latestDigest: DailyPlanResponse?
    private(set) var allDigests: [DailyPlanResponse] = []
    private(set) var shouldGenerate = false
    private(set) var isLoading = false
    private(set) var isGenerating = false
    private(set) var errorMessage: String?

    private static let latestCache = ResponseCache<DailyPlanResponse>(ttl: 600) // 10 min

    /// True if the error is a task cancellation (view lifecycle), not a real failure.
    private func isCancellation(_ error: Error) -> Bool {
        if error is CancellationError { return true }
        if (error as? URLError)?.code == .cancelled { return true }
        if case APIError.networkError(let underlying) = error,
           (underlying as? URLError)?.code == .cancelled { return true }
        return false
    }

    // MARK: - Fetch Latest

    func fetchLatest(sessionId: String, forceRefresh: Bool = false) async {
        if !forceRefresh, let cached = Self.latestCache.get(sessionId) {
            latestDigest = cached
            return
        }

        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            let digest: DailyPlanResponse? = try await APIClient.shared.get(
                APIEndpoints.DailyPlans.latest(sessionId)
            )
            latestDigest = digest
            if let digest {
                Self.latestCache.set(digest, for: sessionId)
            }
        } catch let error as APIError {
            if case .notFound = error {
                latestDigest = nil
            } else if !isCancellation(error) {
                errorMessage = error.localizedDescription
            }
        } catch {
            if !isCancellation(error) {
                errorMessage = error.localizedDescription
            }
        }
    }

    // MARK: - Fetch All

    func fetchAll(sessionId: String) async {
        errorMessage = nil

        do {
            let response: DailyPlanListResponse = try await APIClient.shared.get(
                APIEndpoints.DailyPlans.all(sessionId)
            )
            allDigests = response.plans
        } catch {
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
        do {
            let response: DailyPlanCheckResponse = try await APIClient.shared.get(
                APIEndpoints.DailyPlans.check(sessionId)
            )
            shouldGenerate = response.shouldGenerate
        } catch {
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

    func generate(sessionId: String) async {
        isGenerating = true
        errorMessage = nil
        Self.latestCache.invalidate(sessionId)
        defer { isGenerating = false }

        do {
            // "Today" is the user's local date; the server otherwise falls back to its
            // own (UTC) date, which is already tomorrow during a US evening.
            let digest: DailyPlanResponse = try await APIClient.shared.post(
                APIEndpoints.DailyPlans.generate(sessionId),
                queryItems: [URLQueryItem(name: "user_date", value: Date().apiDateString)]
            )
            latestDigest = digest
            Self.latestCache.set(digest, for: sessionId)
            shouldGenerate = false
            // Prepend to history
            allDigests.insert(digest, at: 0)
        } catch {
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
