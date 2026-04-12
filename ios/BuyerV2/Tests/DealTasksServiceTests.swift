import Foundation
import Testing

@testable import BuyerV2

// MARK: - MockDealTasksBackend

final class MockDealTasksBackend: DealTasksBackend, @unchecked Sendable {

    var fetchResult: Result<[DealTask], Error> = .success([])
    var fetchCallCount = 0
    var lastDealRoomId: String?

    /// Per-dealRoomId result override — lets tests simulate slow/fast
    /// fetches for different deal IDs interleaved on one service.
    var resultsByDealRoomId: [String: Result<[DealTask], Error>] = [:]

    /// Optional continuation that must be resumed before the fetch
    /// completes — lets tests coordinate in-flight request timing
    /// without relying on wall-clock sleeps.
    var onFetchStarted: (@Sendable () async -> Void)?

    func fetchTasks(dealRoomId: String) async throws -> [DealTask] {
        fetchCallCount += 1
        lastDealRoomId = dealRoomId
        if let hook = onFetchStarted {
            await hook()
        }
        if let override = resultsByDealRoomId[dealRoomId] {
            return try override.get()
        }
        return try fetchResult.get()
    }
}

// MARK: - Fixtures

private struct StubTaskError: Error {
    let message: String
}

private func makeTask(
    id: String = "task-1",
    dealRoomId: String = "dr-1",
    title: String = "Sign disclosure",
    description: String? = nil,
    urgency: TaskUrgency = .medium,
    workstream: TaskWorkstream = .intake,
    status: TaskStatus = .pending,
    dueDate: String? = nil,
    assignee: String? = nil,
    completedAt: String? = nil,
    createdAt: String = "2026-04-01T00:00:00Z",
    updatedAt: String = "2026-04-01T00:00:00Z"
) -> DealTask {
    DealTask(
        id: id,
        dealRoomId: dealRoomId,
        title: title,
        description: description,
        urgency: urgency,
        workstream: workstream,
        status: status,
        dueDate: dueDate,
        assignee: assignee,
        completedAt: completedAt,
        createdAt: createdAt,
        updatedAt: updatedAt
    )
}

// MARK: - Pure helper tests

@Suite("DealTasks pure helpers")
struct DealTasksPureTests {

    @Test("groupTasksByUrgency drops empty buckets and sorts highest first")
    func testGroupByUrgency() {
        let tasks = [
            makeTask(id: "t1", urgency: .low),
            makeTask(id: "t2", urgency: .high),
            makeTask(id: "t3", urgency: .high),
        ]
        let groups = groupTasksByUrgency(tasks)
        #expect(groups.count == 2)
        #expect(groups[0].0 == .high)
        #expect(groups[0].1.map(\.id) == ["t2", "t3"])
        #expect(groups[1].0 == .low)
        #expect(groups[1].1.map(\.id) == ["t1"])
    }

    @Test("groupTasksByUrgency sorts open tasks before completed within a bucket")
    func testGroupByUrgencyOpenFirst() {
        let tasks = [
            makeTask(id: "done", status: .completed),
            makeTask(id: "open", status: .pending),
            makeTask(id: "blocked", status: .blocked),
        ]
        let groups = groupTasksByUrgency(tasks)
        #expect(groups.count == 1)
        let bucket = groups[0].1
        // Open tasks (pending, blocked) come before completed
        #expect(bucket.map(\.id).last == "done")
    }

    @Test("groupTasksByUrgency sorts by dueDate within open tasks")
    func testGroupByUrgencyDueDateSort() {
        let tasks = [
            makeTask(id: "late", dueDate: "2026-05-01"),
            makeTask(id: "early", dueDate: "2026-04-20"),
            makeTask(id: "nodate", dueDate: nil),
        ]
        let groups = groupTasksByUrgency(tasks)
        #expect(groups[0].1.map(\.id) == ["early", "late", "nodate"])
    }

    @Test("groupTasksByWorkstream preserves canonical order and drops empty buckets")
    func testGroupByWorkstream() {
        let tasks = [
            makeTask(id: "c", workstream: .closing),
            makeTask(id: "i", workstream: .intake),
        ]
        let groups = groupTasksByWorkstream(tasks)
        #expect(groups.map(\.0) == [.intake, .closing])
    }

    @Test("openTaskCount ignores completed tasks")
    func testOpenTaskCount() {
        let tasks = [
            makeTask(id: "1", status: .pending),
            makeTask(id: "2", status: .inProgress),
            makeTask(id: "3", status: .completed),
            makeTask(id: "4", status: .blocked),
        ]
        #expect(openTaskCount(tasks) == 3)
    }

    @Test("TaskUrgency Comparable orders high → medium → low → none")
    func testTaskUrgencyComparable() {
        let sorted = [TaskUrgency.none, .low, .high, .medium].sorted()
        #expect(sorted == [.high, .medium, .low, .none])
    }
}

// MARK: - Service tests

@Suite("DealTasksService state transitions", .serialized)
@MainActor
struct DealTasksServiceTests {

    @Test("initial state is .idle")
    func testInitialState() {
        let backend = MockDealTasksBackend()
        let service = DealTasksService(backend: backend)
        guard case .idle = service.state else {
            Issue.record("Expected .idle")
            return
        }
    }

    @Test("loadTasks with non-empty result → .loaded")
    func testLoadActiveDealWithTasks() async {
        let backend = MockDealTasksBackend()
        backend.fetchResult = .success([makeTask(id: "t1"), makeTask(id: "t2")])
        let service = DealTasksService(backend: backend)

        await service.loadTasks(dealRoomId: "dr-123")

        guard case .loaded(let tasks) = service.state else {
            Issue.record("Expected .loaded")
            return
        }
        #expect(tasks.count == 2)
        #expect(backend.fetchCallCount == 1)
        #expect(backend.lastDealRoomId == "dr-123")
    }

    @Test("loadTasks with empty result → .noTasks")
    func testLoadNoTasks() async {
        let backend = MockDealTasksBackend()
        backend.fetchResult = .success([])
        let service = DealTasksService(backend: backend)

        await service.loadTasks(dealRoomId: "dr-123")

        guard case .noTasks = service.state else {
            Issue.record("Expected .noTasks")
            return
        }
    }

    @Test("loadTasks with error → .error")
    func testLoadError() async {
        let backend = MockDealTasksBackend()
        backend.fetchResult = .failure(StubTaskError(message: "offline"))
        let service = DealTasksService(backend: backend)

        await service.loadTasks(dealRoomId: "dr-123")

        guard case .error = service.state else {
            Issue.record("Expected .error")
            return
        }
    }

    @Test("refresh while loaded → .stale(previous) during refetch, .loaded after")
    func testRefreshTransitionsToStale() async {
        let backend = MockDealTasksBackend()
        backend.fetchResult = .success([makeTask(id: "t1")])
        let service = DealTasksService(backend: backend)

        await service.loadTasks(dealRoomId: "dr-123")
        guard case .loaded = service.state else {
            Issue.record("Pre-condition failed")
            return
        }

        // Next refresh returns two tasks
        backend.fetchResult = .success([makeTask(id: "t1"), makeTask(id: "t2")])
        await service.refresh()
        guard case .loaded(let tasks) = service.state else {
            Issue.record("Expected .loaded after refresh")
            return
        }
        #expect(tasks.count == 2)
    }

    @Test("clearForSignOut → .signedOut")
    func testClearForSignOut() async {
        let backend = MockDealTasksBackend()
        backend.fetchResult = .success([makeTask()])
        let service = DealTasksService(backend: backend)
        await service.loadTasks(dealRoomId: "dr-123")

        service.clearForSignOut()

        guard case .signedOut = service.state else {
            Issue.record("Expected .signedOut")
            return
        }
    }

    @Test("handleNoActiveDeal → .noActiveDeal")
    func testHandleNoActiveDeal() async {
        let backend = MockDealTasksBackend()
        let service = DealTasksService(backend: backend)

        service.handleNoActiveDeal()

        guard case .noActiveDeal = service.state else {
            Issue.record("Expected .noActiveDeal")
            return
        }
    }

    @Test("refresh with no prior dealRoomId is a no-op")
    func testRefreshNoop() async {
        let backend = MockDealTasksBackend()
        let service = DealTasksService(backend: backend)

        await service.refresh()

        #expect(backend.fetchCallCount == 0)
        guard case .idle = service.state else {
            Issue.record("Expected state unchanged")
            return
        }
    }

    @Test("loadTasks drops a stale response when the deal switches mid-fetch")
    func testLateResponseDroppedOnDealSwitch() async {
        // Regression: codex P1 on PR #42. If the active deal changes
        // while loadTasks is awaiting the network, the late response
        // from the old deal must not overwrite the current state.
        let backend = MockDealTasksBackend()
        backend.resultsByDealRoomId["dr-old"] = .success([
            makeTask(id: "old-1", dealRoomId: "dr-old"),
            makeTask(id: "old-2", dealRoomId: "dr-old"),
        ])
        backend.resultsByDealRoomId["dr-new"] = .success([
            makeTask(id: "new-1", dealRoomId: "dr-new"),
        ])

        let service = DealTasksService(backend: backend)

        // Start the old-deal fetch but pause it inside the backend so
        // we can swap deals before it returns.
        let resumeOldFetch = AsyncResumeSignal()
        backend.onFetchStarted = {
            // First caller (old deal) waits for the signal. Second caller
            // (new deal) skips the hook — we unset it after the first
            // call so the new fetch returns immediately.
            await resumeOldFetch.wait()
        }

        // Kick off old-deal load in the background.
        async let oldLoad: Void = service.loadTasks(dealRoomId: "dr-old")

        // Give the old fetch a tick to enter the hook.
        await Task.yield()

        // Switch to the new deal. Unset the hook so this fetch is fast.
        backend.onFetchStarted = nil
        await service.loadTasks(dealRoomId: "dr-new")

        // At this point the service should show the new deal's data.
        guard case .loaded(let tasks) = service.state else {
            Issue.record("Expected .loaded for new deal, got \(service.state)")
            resumeOldFetch.resume()
            _ = await oldLoad
            return
        }
        #expect(tasks.map(\.id) == ["new-1"])

        // Now let the old fetch complete. The service should IGNORE it
        // because currentDealRoomId has moved on.
        resumeOldFetch.resume()
        _ = await oldLoad

        guard case .loaded(let tasksAfter) = service.state else {
            Issue.record("Expected .loaded preserved after stale response")
            return
        }
        #expect(tasksAfter.map(\.id) == ["new-1"])
    }

    @Test("loadTasks drops a stale response after handleNoActiveDeal()")
    func testLateResponseDroppedOnNoActiveDeal() async {
        let backend = MockDealTasksBackend()
        backend.resultsByDealRoomId["dr-1"] = .success([
            makeTask(id: "t1", dealRoomId: "dr-1")
        ])

        let service = DealTasksService(backend: backend)
        let resumeSignal = AsyncResumeSignal()
        backend.onFetchStarted = { await resumeSignal.wait() }

        async let firstLoad: Void = service.loadTasks(dealRoomId: "dr-1")
        await Task.yield()

        // Simulate the deal disappearing while the fetch is in flight
        service.handleNoActiveDeal()

        // Let the fetch complete — the late response should be dropped
        resumeSignal.resume()
        _ = await firstLoad

        guard case .noActiveDeal = service.state else {
            Issue.record("Expected .noActiveDeal preserved, got \(service.state)")
            return
        }
    }
}

// MARK: - AsyncResumeSignal

/// Test helper: a one-shot async wait/resume primitive for coordinating
/// in-flight backend calls without wall-clock sleeps.
private actor AsyncResumeSignal {
    private var continuation: CheckedContinuation<Void, Never>?
    private var resumed = false

    func wait() async {
        if resumed { return }
        await withCheckedContinuation { cont in
            self.continuation = cont
        }
    }

    nonisolated func resume() {
        Task { await self._resume() }
    }

    private func _resume() {
        resumed = true
        continuation?.resume()
        continuation = nil
    }
}
