import Foundation
import Testing

@testable import BuyerV2

// MARK: - Clock helper

/// Injectable clock actor so tests can control "now" deterministically
/// without touching the system clock.
private actor TestClock {
    private var now: Date

    init(_ start: Date = Date(timeIntervalSince1970: 1_776_000_000)) {
        self.now = start
    }

    func current() -> Date { now }

    func advance(by seconds: TimeInterval) {
        now = now.addingTimeInterval(seconds)
    }
}

// MARK: - Fixtures

private func makeProperty(id: String = "prop-1") -> PropertySummary {
    PropertySummary(
        id: id,
        address: "123 Ocean Dr",
        city: "Miami Beach",
        state: "FL",
        zip: "33139",
        listPrice: 1_250_000,
        beds: 3,
        bathsFull: 2,
        bathsHalf: 1,
        propertyType: "Condo",
        imageUrl: nil
    )
}

private func makeDeal(
    id: String = "dr-1",
    status: DealStatus = .analysis
) -> DealSummary {
    DealSummary(
        id: id,
        property: makeProperty(),
        status: status,
        accessLevel: "registered",
        createdAt: "2026-04-01T00:00:00Z",
        updatedAt: "2026-04-10T00:00:00Z"
    )
}

private func makeTask(id: String = "t1") -> DealTask {
    DealTask(
        id: id,
        dealRoomId: "dr-1",
        title: "Sign disclosure",
        description: nil,
        urgency: .medium,
        workstream: .intake,
        status: .pending,
        dueDate: nil,
        assignee: "buyer",
        completedAt: nil,
        createdAt: "2026-04-01T00:00:00Z",
        updatedAt: "2026-04-01T00:00:00Z"
    )
}

private func makeEvent(id: String = "e1") -> MilestoneEvent {
    MilestoneEvent(
        id: id,
        dealRoomId: "dr-1",
        kind: .statusChanged,
        title: "Status updated",
        description: nil,
        occurredAt: "2026-04-10T14:30:00Z",
        actorLabel: "System"
    )
}

// MARK: - CacheFreshnessPolicy tests

@Suite("CacheFreshnessPolicy classification")
struct CacheFreshnessPolicyTests {

    @Test("fresh < freshWindow")
    func testFresh() {
        let policy = CacheFreshnessPolicy.default
        let result = policy.classify(ageSeconds: 60)
        guard case .fresh = result else {
            Issue.record("Expected .fresh, got \(result)")
            return
        }
    }

    @Test("stale between freshWindow and expiredWindow")
    func testStale() {
        let policy = CacheFreshnessPolicy.default
        let result = policy.classify(ageSeconds: 1_000)
        guard case .stale = result else {
            Issue.record("Expected .stale, got \(result)")
            return
        }
    }

    @Test("expired ≥ expiredWindow")
    func testExpired() {
        let policy = CacheFreshnessPolicy.default
        let result = policy.classify(ageSeconds: 90_000)
        guard case .expired = result else {
            Issue.record("Expected .expired, got \(result)")
            return
        }
    }

    @Test("boundary exactly at freshWindow is stale (half-open interval)")
    func testFreshWindowBoundary() {
        let policy = CacheFreshnessPolicy.default
        let result = policy.classify(ageSeconds: policy.freshWindowSeconds)
        guard case .stale = result else {
            Issue.record("Expected .stale at boundary")
            return
        }
    }
}

// MARK: - DealCacheStore tests

@Suite("DealCacheStore persistence", .serialized)
struct DealCacheStoreTests {

    // MARK: - First-cache

    @Test("loadSnapshot returns nil when no cache exists")
    func testFirstLoadEmpty() async throws {
        let storage = InMemoryCacheStorage()
        let store = DealCacheStore(storage: storage)
        let result = try await store.loadSnapshot(for: "user-1")
        #expect(result == nil)
    }

    @Test("saveSnapshot then loadSnapshot returns the stored data as .fresh")
    func testFirstCacheRoundTrip() async throws {
        let storage = InMemoryCacheStorage()
        let clock = TestClock()
        let store = DealCacheStore(
            storage: storage,
            policy: .default,
            clock: { [clock] in await clock.current() as Date }
        )
        // Actor clock bridging — use a wrapper that reads synchronously
        // via a detached Task. Simpler: use an NSLock-backed box for tests.

        // NOTE: Because `clock:` is a sync closure and our TestClock is
        // an actor, we route through a small unchecked-Sendable box.
        let box = MutableDateBox(initial: Date(timeIntervalSince1970: 1_776_000_000))
        let boxStore = DealCacheStore(
            storage: storage,
            policy: .default,
            clock: { [box] in box.current }
        )

        try await boxStore.saveSnapshot(
            userId: "user-1",
            deal: makeDeal(),
            tasks: [makeTask()],
            events: [makeEvent()]
        )

        let result = try await boxStore.loadSnapshot(for: "user-1")
        guard let (snapshot, freshness) = result else {
            Issue.record("Expected cache hit")
            return
        }
        #expect(snapshot.userId == "user-1")
        #expect(snapshot.deal?.id == "dr-1")
        #expect(snapshot.tasks.count == 1)
        #expect(snapshot.events.count == 1)
        guard case .fresh = freshness else {
            Issue.record("Expected .fresh for just-written cache")
            return
        }
        _ = store // silence unused
    }

    // MARK: - Stale cache

    @Test("cache written long ago reads back as .stale")
    func testStaleCache() async throws {
        let storage = InMemoryCacheStorage()
        let box = MutableDateBox(initial: Date(timeIntervalSince1970: 1_776_000_000))
        let store = DealCacheStore(
            storage: storage,
            policy: .default,
            clock: { [box] in box.current }
        )

        try await store.saveSnapshot(
            userId: "user-1",
            deal: makeDeal(),
            tasks: [],
            events: []
        )

        // Advance the clock past the fresh window but below expired
        box.advance(by: 600) // 10 min

        let result = try await store.loadSnapshot(for: "user-1")
        guard let (_, freshness) = result else {
            Issue.record("Expected cache still readable")
            return
        }
        guard case .stale = freshness else {
            Issue.record("Expected .stale, got \(freshness)")
            return
        }
    }

    @Test("cache written past expired window returns nil (auto-dropped)")
    func testExpiredCacheDropped() async throws {
        let storage = InMemoryCacheStorage()
        let box = MutableDateBox(initial: Date(timeIntervalSince1970: 1_776_000_000))
        let store = DealCacheStore(
            storage: storage,
            policy: .default,
            clock: { [box] in box.current }
        )

        try await store.saveSnapshot(
            userId: "user-1",
            deal: makeDeal(),
            tasks: [],
            events: []
        )

        box.advance(by: 90_000) // > 24 h

        let result = try await store.loadSnapshot(for: "user-1")
        #expect(result == nil)

        // And the file should be deleted
        let keys = await storage.allKeys()
        #expect(!keys.contains("user_user-1_snapshot"))
    }

    // MARK: - Reconnect / re-sync

    @Test("second saveSnapshot overwrites the first")
    func testReconnectOverwrites() async throws {
        let storage = InMemoryCacheStorage()
        let box = MutableDateBox(initial: Date(timeIntervalSince1970: 1_776_000_000))
        let store = DealCacheStore(
            storage: storage,
            policy: .default,
            clock: { [box] in box.current }
        )

        try await store.saveSnapshot(
            userId: "user-1",
            deal: makeDeal(id: "dr-1"),
            tasks: [],
            events: []
        )

        // Simulate app backgrounded for a while then reconnects
        box.advance(by: 10_000) // 2.7 h — stale but usable

        // Fresh fetch replaces the cache
        try await store.saveSnapshot(
            userId: "user-1",
            deal: makeDeal(id: "dr-2"),
            tasks: [makeTask(id: "t1"), makeTask(id: "t2")],
            events: [makeEvent()]
        )

        let result = try await store.loadSnapshot(for: "user-1")
        guard let (snapshot, freshness) = result else {
            Issue.record("Expected cache hit")
            return
        }
        #expect(snapshot.deal?.id == "dr-2")
        #expect(snapshot.tasks.count == 2)
        guard case .fresh = freshness else {
            Issue.record("Expected .fresh after overwrite")
            return
        }
    }

    // MARK: - Cross-user guard

    @Test("loadSnapshot rejects a cache with a mismatched userId")
    func testCrossUserGuard() async throws {
        let storage = InMemoryCacheStorage()
        let box = MutableDateBox(initial: Date(timeIntervalSince1970: 1_776_000_000))
        let store = DealCacheStore(
            storage: storage,
            policy: .default,
            clock: { [box] in box.current }
        )

        try await store.saveSnapshot(
            userId: "user-1",
            deal: makeDeal(),
            tasks: [],
            events: []
        )

        // Loading for user-2 should miss
        let result = try await store.loadSnapshot(for: "user-2")
        #expect(result == nil)
    }

    // MARK: - Clear

    @Test("clear deletes the cached snapshot")
    func testClear() async throws {
        let storage = InMemoryCacheStorage()
        let store = DealCacheStore(storage: storage)

        try await store.saveSnapshot(
            userId: "user-1",
            deal: makeDeal(),
            tasks: [],
            events: []
        )

        try await store.clear(for: "user-1")

        let result = try await store.loadSnapshot(for: "user-1")
        #expect(result == nil)
    }
}

// MARK: - MutableDateBox (test helper)

/// Thread-safe mutable date reference used by tests to drive a sync
/// clock closure. @unchecked Sendable because access is serialized by
/// a lock; we don't need strict checking for test helpers.
private final class MutableDateBox: @unchecked Sendable {
    private let lock = NSLock()
    private var date: Date

    init(initial: Date) {
        self.date = initial
    }

    var current: Date {
        lock.lock()
        defer { lock.unlock() }
        return date
    }

    func advance(by seconds: TimeInterval) {
        lock.lock()
        date = date.addingTimeInterval(seconds)
        lock.unlock()
    }
}
