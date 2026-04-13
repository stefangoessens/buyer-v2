import Foundation
import Testing

@testable import BuyerV2

// MARK: - MockDealTimelineBackend

final class MockDealTimelineBackend: DealTimelineBackend, @unchecked Sendable {

    var fetchResult: Result<[MilestoneEvent], Error> = .success([])
    var fetchCallCount = 0
    var lastDealRoomId: String?

    /// Per-dealRoomId result override for interleaved fetch tests.
    var resultsByDealRoomId: [String: Result<[MilestoneEvent], Error>] = [:]

    /// Pause hook invoked at the start of each fetch — lets tests
    /// coordinate in-flight timing without wall-clock sleeps.
    var onFetchStarted: (@Sendable () async -> Void)?

    func fetchEvents(dealRoomId: String) async throws -> [MilestoneEvent] {
        fetchCallCount += 1
        lastDealRoomId = dealRoomId
        if let hook = onFetchStarted { await hook() }
        if let override = resultsByDealRoomId[dealRoomId] {
            return try override.get()
        }
        return try fetchResult.get()
    }
}

// MARK: - Fixtures

private struct StubTimelineError: Error {
    let message: String
}

private func makeEvent(
    id: String = "ev-1",
    dealRoomId: String = "dr-1",
    kind: MilestoneEventKind = .statusChanged,
    title: String = "Status updated",
    description: String? = nil,
    occurredAt: String = "2026-04-10T14:30:00Z",
    actorLabel: String? = nil
) -> MilestoneEvent {
    MilestoneEvent(
        id: id,
        dealRoomId: dealRoomId,
        kind: kind,
        title: title,
        description: description,
        occurredAt: occurredAt,
        actorLabel: actorLabel
    )
}

// MARK: - Pure helper tests

@Suite("DealTimeline pure helpers")
struct DealTimelinePureTests {

    @Test("sortEventsNewestFirst orders by ISO timestamp descending")
    func testSortNewestFirst() {
        let events = [
            makeEvent(id: "old", occurredAt: "2026-04-05T10:00:00Z"),
            makeEvent(id: "new", occurredAt: "2026-04-10T10:00:00Z"),
            makeEvent(id: "mid", occurredAt: "2026-04-07T10:00:00Z"),
        ]
        let sorted = sortEventsNewestFirst(events)
        #expect(sorted.map(\.id) == ["new", "mid", "old"])
    }

    @Test("groupEventsByDay creates one section per YYYY-MM-DD bucket")
    func testGroupByDay() {
        let events = [
            makeEvent(id: "a", occurredAt: "2026-04-10T10:00:00Z"),
            makeEvent(id: "b", occurredAt: "2026-04-10T14:00:00Z"),
            makeEvent(id: "c", occurredAt: "2026-04-09T09:00:00Z"),
        ]
        let groups = groupEventsByDay(events)
        #expect(groups.count == 2)
        #expect(groups[0].0 == "2026-04-10")
        #expect(groups[0].1.count == 2)
        #expect(groups[1].0 == "2026-04-09")
        #expect(groups[1].1.count == 1)
    }

    @Test("groupEventsByDay returns newest day first")
    func testGroupByDayNewestFirst() {
        let events = [
            makeEvent(id: "old", occurredAt: "2026-04-05T10:00:00Z"),
            makeEvent(id: "new", occurredAt: "2026-04-10T10:00:00Z"),
        ]
        let groups = groupEventsByDay(events)
        #expect(groups[0].0 == "2026-04-10")
        #expect(groups[1].0 == "2026-04-05")
    }

    @Test("groupEventsByDay on empty input returns empty")
    func testGroupByDayEmpty() {
        #expect(groupEventsByDay([]).isEmpty)
    }

    @Test("MilestoneEventKind positive flag is true only for outcome events")
    func testIsPositive() {
        #expect(MilestoneEventKind.offerAccepted.isPositive)
        #expect(MilestoneEventKind.contractSigned.isPositive)
        #expect(MilestoneEventKind.closed.isPositive)
        #expect(!MilestoneEventKind.offerRejected.isPositive)
        #expect(!MilestoneEventKind.tourScheduled.isPositive)
    }
}

// MARK: - Service tests

@Suite("DealTimelineService state transitions", .serialized)
@MainActor
struct DealTimelineServiceTests {

    @Test("initial state is .idle")
    func testInitialState() {
        let backend = MockDealTimelineBackend()
        let service = DealTimelineService(backend: backend)
        guard case .idle = service.state else {
            Issue.record("Expected .idle")
            return
        }
    }

    @Test("loadEvents with non-empty result → .loaded")
    func testLoadActiveDeal() async {
        let backend = MockDealTimelineBackend()
        backend.fetchResult = .success([
            makeEvent(id: "e1"),
            makeEvent(id: "e2"),
        ])
        let service = DealTimelineService(backend: backend)

        await service.loadEvents(dealRoomId: "dr-123")

        guard case .loaded(let events) = service.state else {
            Issue.record("Expected .loaded")
            return
        }
        #expect(events.count == 2)
        #expect(backend.fetchCallCount == 1)
        #expect(backend.lastDealRoomId == "dr-123")
    }

    @Test("loadEvents with empty result → .noEvents")
    func testLoadNoEvents() async {
        let backend = MockDealTimelineBackend()
        backend.fetchResult = .success([])
        let service = DealTimelineService(backend: backend)

        await service.loadEvents(dealRoomId: "dr-123")

        guard case .noEvents = service.state else {
            Issue.record("Expected .noEvents")
            return
        }
    }

    @Test("loadEvents with error → .error")
    func testLoadError() async {
        let backend = MockDealTimelineBackend()
        backend.fetchResult = .failure(StubTimelineError(message: "offline"))
        let service = DealTimelineService(backend: backend)

        await service.loadEvents(dealRoomId: "dr-123")

        guard case .error = service.state else {
            Issue.record("Expected .error")
            return
        }
    }

    @Test("refresh re-fetches and transitions to .loaded")
    func testRefresh() async {
        let backend = MockDealTimelineBackend()
        backend.fetchResult = .success([makeEvent(id: "e1")])
        let service = DealTimelineService(backend: backend)

        await service.loadEvents(dealRoomId: "dr-123")
        guard case .loaded = service.state else {
            Issue.record("Pre-condition failed")
            return
        }

        backend.fetchResult = .success([makeEvent(id: "e1"), makeEvent(id: "e2")])
        await service.refresh()

        guard case .loaded(let events) = service.state else {
            Issue.record("Expected .loaded after refresh")
            return
        }
        #expect(events.count == 2)
        #expect(backend.fetchCallCount == 2)
    }

    @Test("clearForSignOut → .signedOut")
    func testClearForSignOut() async {
        let backend = MockDealTimelineBackend()
        backend.fetchResult = .success([makeEvent()])
        let service = DealTimelineService(backend: backend)
        await service.loadEvents(dealRoomId: "dr-123")

        service.clearForSignOut()

        guard case .signedOut = service.state else {
            Issue.record("Expected .signedOut")
            return
        }
    }

    @Test("handleNoActiveDeal → .noActiveDeal")
    func testHandleNoActiveDeal() {
        let backend = MockDealTimelineBackend()
        let service = DealTimelineService(backend: backend)

        service.handleNoActiveDeal()

        guard case .noActiveDeal = service.state else {
            Issue.record("Expected .noActiveDeal")
            return
        }
    }

    @Test("loadEvents drops a stale response when the deal switches mid-fetch")
    func testLateResponseDroppedOnDealSwitch() async {
        // Regression: codex P1 on PR #42. Guard the post-fetch state
        // update with a currentDealRoomId check so late responses from
        // an old deal can't overwrite the new deal's state.
        let backend = MockDealTimelineBackend()
        backend.resultsByDealRoomId["dr-old"] = .success([
            makeEvent(id: "old-1", dealRoomId: "dr-old"),
        ])
        backend.resultsByDealRoomId["dr-new"] = .success([
            makeEvent(id: "new-1", dealRoomId: "dr-new"),
        ])

        let service = DealTimelineService(backend: backend)

        let resumeOldFetch = AsyncResumeSignal()
        backend.onFetchStarted = { await resumeOldFetch.wait() }

        async let oldLoad: Void = service.loadEvents(dealRoomId: "dr-old")
        await Task.yield()

        // Swap to new deal (unset hook so this one returns fast)
        backend.onFetchStarted = nil
        await service.loadEvents(dealRoomId: "dr-new")

        guard case .loaded(let events) = service.state else {
            Issue.record("Expected .loaded for new deal")
            resumeOldFetch.resume()
            _ = await oldLoad
            return
        }
        #expect(events.map(\.id) == ["new-1"])

        // Let the stale fetch complete — it should be ignored
        resumeOldFetch.resume()
        _ = await oldLoad

        guard case .loaded(let eventsAfter) = service.state else {
            Issue.record("Expected .loaded preserved after stale response")
            return
        }
        #expect(eventsAfter.map(\.id) == ["new-1"])
    }
}

// MARK: - AsyncResumeSignal (test helper)

/// One-shot async wait/resume — duplicated from DealTasksServiceTests.swift
/// because Swift Testing test files don't share private types.
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
