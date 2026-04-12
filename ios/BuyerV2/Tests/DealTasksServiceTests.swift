import Foundation
import Testing

@testable import BuyerV2

// MARK: - MockDealTasksBackend

final class MockDealTasksBackend: DealTasksBackend, @unchecked Sendable {

    var fetchResult: Result<[DealTask], Error> = .success([])
    var fetchCallCount = 0
    var lastDealRoomId: String?

    func fetchTasks(dealRoomId: String) async throws -> [DealTask] {
        fetchCallCount += 1
        lastDealRoomId = dealRoomId
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
}
