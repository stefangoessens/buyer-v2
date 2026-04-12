import Foundation
import Observation

// MARK: - DealTasksLoadState

/// Explicit states covering every UI branch `DealTasksView` can render.
/// Ordered to match the flow: uninitialized → loading → one of the
/// outcome states. `stale` represents "we have data but it's from a
/// prior session and we're re-fetching" — distinct from `loading` so
/// the view can keep the current content visible while refreshing.
enum DealTasksLoadState: Sendable, Equatable {
    case idle
    case loading
    case signedOut
    case noActiveDeal
    case noTasks
    case loaded(tasks: [DealTask])
    case stale(previous: [DealTask])   // have prior data, re-fetching
    case error(String)
}

// MARK: - TasksBackend protocol

protocol DealTasksBackend: Sendable {
    func fetchTasks(dealRoomId: String) async throws -> [DealTask]
}

// MARK: - ConvexDealTasksBackend

final class ConvexDealTasksBackend: DealTasksBackend, Sendable {
    private let baseURL: URL

    init(baseURL: URL = URL(string: "https://api.buyerv2.com")!) {
        self.baseURL = baseURL
    }

    func fetchTasks(dealRoomId: String) async throws -> [DealTask] {
        let url = baseURL.appendingPathComponent("/tasks/list")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body = ["dealRoomId": dealRoomId]
        request.httpBody = try JSONEncoder().encode(body)
        let (data, _) = try await URLSession.shared.data(for: request)
        return try JSONDecoder().decode([DealTask].self, from: data)
    }
}

// MARK: - DealTasksService

@MainActor
@Observable
final class DealTasksService {

    private(set) var state: DealTasksLoadState = .idle

    private let backend: DealTasksBackend
    private var currentDealRoomId: String?

    init(backend: DealTasksBackend = ConvexDealTasksBackend()) {
        self.backend = backend
    }

    /// Called when the user signs out. Clears cached tasks so they can't
    /// bleed into the next signed-in session.
    func clearForSignOut() {
        currentDealRoomId = nil
        state = .signedOut
    }

    /// Called when the deal tracker shell resolves there's no active deal.
    /// The view distinguishes "no deal" (show NoDealView) from "no tasks"
    /// (show EmptyTasksView).
    func handleNoActiveDeal() {
        currentDealRoomId = nil
        state = .noActiveDeal
    }

    /// Load tasks for a specific deal. If we previously had data for the
    /// same deal and a refresh is in progress, the state transitions to
    /// `.stale(previous:)` so the view keeps the old data visible.
    func loadTasks(dealRoomId: String) async {
        currentDealRoomId = dealRoomId

        // Preserve previous data through the refresh
        if case .loaded(let previous) = state {
            state = .stale(previous: previous)
        } else {
            state = .loading
        }

        do {
            let fetched = try await backend.fetchTasks(dealRoomId: dealRoomId)
            if fetched.isEmpty {
                state = .noTasks
            } else {
                state = .loaded(tasks: fetched)
            }
        } catch {
            state = .error(error.localizedDescription)
        }
    }

    /// Re-fetch the last loaded deal. Used by pull-to-refresh.
    func refresh() async {
        guard let dealRoomId = currentDealRoomId else { return }
        await loadTasks(dealRoomId: dealRoomId)
    }
}

// MARK: - Pure helpers (testable without service)

/// Group tasks by urgency, dropping empty buckets. Each bucket is
/// sorted internally: open tasks first (pending/inProgress/blocked),
/// then completed. Used by `DealTasksView` to render sections.
func groupTasksByUrgency(_ tasks: [DealTask]) -> [(TaskUrgency, [DealTask])] {
    TaskUrgency.allCases.compactMap { urgency in
        let bucket = tasks
            .filter { $0.urgency == urgency }
            .sorted { lhs, rhs in
                // Open tasks before completed
                if lhs.status.isOpen != rhs.status.isOpen {
                    return lhs.status.isOpen && !rhs.status.isOpen
                }
                // Within open/closed, sort by dueDate (nil last)
                switch (lhs.dueDate, rhs.dueDate) {
                case (let a?, let b?): return a < b
                case (_?, nil): return true
                case (nil, _?): return false
                case (nil, nil): return lhs.title < rhs.title
                }
            }
        return bucket.isEmpty ? nil : (urgency, bucket)
    }
}

/// Group tasks by workstream, preserving workstream order.
func groupTasksByWorkstream(_ tasks: [DealTask]) -> [(TaskWorkstream, [DealTask])] {
    TaskWorkstream.allCases.compactMap { workstream in
        let bucket = tasks.filter { $0.workstream == workstream }
        return bucket.isEmpty ? nil : (workstream, bucket)
    }
}

/// Count of open (non-completed) tasks — shown in the tab badge.
func openTaskCount(_ tasks: [DealTask]) -> Int {
    tasks.filter { $0.status.isOpen }.count
}
