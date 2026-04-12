import Foundation
import Testing

@testable import BuyerV2

// MARK: - MockDealTimelineBackend

final class MockDealTimelineBackend: DealTimelineBackend, @unchecked Sendable {

    var fetchResult: Result<[MilestoneEvent], Error> = .success([])
    var fetchCallCount = 0
    var lastDealRoomId: String?

    func fetchEvents(dealRoomId: String) async throws -> [MilestoneEvent] {
        fetchCallCount += 1
        lastDealRoomId = dealRoomId
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
}
