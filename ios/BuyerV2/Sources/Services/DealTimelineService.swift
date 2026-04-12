import Foundation
import Observation

// MARK: - DealTimelineLoadState

/// Mirrors `DealTasksLoadState` but for milestone events. Same explicit
/// state set so the timeline view can render loading / no-deal /
/// empty / stale / error / loaded without ad hoc branching.
enum DealTimelineLoadState: Sendable, Equatable {
    case idle
    case loading
    case signedOut
    case noActiveDeal
    case noEvents
    case loaded(events: [MilestoneEvent])
    case stale(previous: [MilestoneEvent])
    case error(String)
}

// MARK: - Backend protocol

protocol DealTimelineBackend: Sendable {
    func fetchEvents(dealRoomId: String) async throws -> [MilestoneEvent]
}

// MARK: - ConvexDealTimelineBackend

final class ConvexDealTimelineBackend: DealTimelineBackend, Sendable {
    private let baseURL: URL

    init(baseURL: URL = URL(string: "https://api.buyerv2.com")!) {
        self.baseURL = baseURL
    }

    func fetchEvents(dealRoomId: String) async throws -> [MilestoneEvent] {
        let url = baseURL.appendingPathComponent("/timeline/list")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body = ["dealRoomId": dealRoomId]
        request.httpBody = try JSONEncoder().encode(body)
        let (data, _) = try await URLSession.shared.data(for: request)
        return try JSONDecoder().decode([MilestoneEvent].self, from: data)
    }
}

// MARK: - DealTimelineService

@MainActor
@Observable
final class DealTimelineService {

    private(set) var state: DealTimelineLoadState = .idle

    private let backend: DealTimelineBackend
    private var currentDealRoomId: String?

    init(backend: DealTimelineBackend = ConvexDealTimelineBackend()) {
        self.backend = backend
    }

    func clearForSignOut() {
        currentDealRoomId = nil
        state = .signedOut
    }

    func handleNoActiveDeal() {
        currentDealRoomId = nil
        state = .noActiveDeal
    }

    /// Load events for a specific deal. See the detailed comment on
    /// `DealTasksService.loadTasks` — same late-response guard: if the
    /// current deal changed while the fetch was in flight, drop the
    /// result so old-deal events don't repopulate the new state.
    func loadEvents(dealRoomId: String) async {
        currentDealRoomId = dealRoomId
        let requestedDealRoomId = dealRoomId

        if case .loaded(let previous) = state {
            state = .stale(previous: previous)
        } else {
            state = .loading
        }

        do {
            let fetched = try await backend.fetchEvents(dealRoomId: requestedDealRoomId)
            guard currentDealRoomId == requestedDealRoomId else { return }
            if fetched.isEmpty {
                state = .noEvents
            } else {
                state = .loaded(events: fetched)
            }
        } catch {
            guard currentDealRoomId == requestedDealRoomId else { return }
            state = .error(error.localizedDescription)
        }
    }

    func refresh() async {
        guard let dealRoomId = currentDealRoomId else { return }
        await loadEvents(dealRoomId: dealRoomId)
    }
}

// MARK: - Pure helpers

/// Sort events newest-first. Pure function exposed for tests.
func sortEventsNewestFirst(_ events: [MilestoneEvent]) -> [MilestoneEvent] {
    events.sorted { $0.occurredAt > $1.occurredAt }
}

/// Group events by day label for sectioned rendering.
/// Returns sections in descending date order. Each bucket preserves
/// chronological order within the day.
func groupEventsByDay(_ events: [MilestoneEvent]) -> [(String, [MilestoneEvent])] {
    let sorted = sortEventsNewestFirst(events)
    var groups: [(String, [MilestoneEvent])] = []
    var currentKey: String? = nil
    var currentBucket: [MilestoneEvent] = []

    for event in sorted {
        let key = String(event.occurredAt.prefix(10)) // YYYY-MM-DD prefix
        if key != currentKey {
            if let previousKey = currentKey, !currentBucket.isEmpty {
                groups.append((previousKey, currentBucket))
            }
            currentKey = key
            currentBucket = [event]
        } else {
            currentBucket.append(event)
        }
    }
    if let key = currentKey, !currentBucket.isEmpty {
        groups.append((key, currentBucket))
    }
    return groups
}
