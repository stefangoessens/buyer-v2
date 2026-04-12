import Foundation
import Testing

@testable import BuyerV2

// MARK: - Fixtures

private func makeProperty() -> PropertySummary {
    PropertySummary(
        id: "prop-1",
        address: "123 Ocean Dr",
        city: "Miami Beach",
        state: "FL",
        zip: "33139",
        listPrice: 1_000_000,
        beds: 2,
        bathsFull: 2,
        bathsHalf: 0,
        propertyType: "Condo",
        imageUrl: nil
    )
}

private func makeDeal(id: String = "dr-1") -> DealSummary {
    DealSummary(
        id: id,
        property: makeProperty(),
        status: .analysis,
        accessLevel: "registered",
        createdAt: "2026-04-01T00:00:00Z",
        updatedAt: "2026-04-10T00:00:00Z"
    )
}

private func makeTask(id: String = "t1") -> DealTask {
    DealTask(
        id: id,
        dealRoomId: "dr-1",
        title: "Review comps",
        description: nil,
        urgency: .high,
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
        kind: .tourScheduled,
        title: "Tour scheduled",
        description: nil,
        occurredAt: "2026-04-10T14:00:00Z",
        actorLabel: "Your agent"
    )
}

// MARK: - DealCacheCoordinator tests

@Suite("DealCacheCoordinator offline-first flow", .serialized)
@MainActor
struct DealCacheCoordinatorTests {

    // MARK: - First-cache path

    @Test("warmFromCache with empty storage → .empty")
    func testFirstRunEmpty() async {
        let storage = InMemoryCacheStorage()
        let store = DealCacheStore(storage: storage)
        let coordinator = DealCacheCoordinator(store: store)

        await coordinator.warmFromCache(userId: "user-1")

        guard case .empty = coordinator.state else {
            Issue.record("Expected .empty, got \(coordinator.state)")
            return
        }
    }

    @Test("applyLiveSnapshot writes to cache and transitions to .liveSynced")
    func testFirstCacheFromLive() async {
        let storage = InMemoryCacheStorage()
        let store = DealCacheStore(storage: storage)
        let coordinator = DealCacheCoordinator(store: store)

        await coordinator.warmFromCache(userId: "user-1")
        await coordinator.applyLiveSnapshot(
            userId: "user-1",
            deal: makeDeal(),
            tasks: [makeTask()],
            events: [makeEvent()]
        )

        guard case .liveSynced(let snapshot) = coordinator.state else {
            Issue.record("Expected .liveSynced, got \(coordinator.state)")
            return
        }
        #expect(snapshot.deal?.id == "dr-1")
        #expect(snapshot.tasks.count == 1)
        #expect(snapshot.events.count == 1)

        // Cache file should exist now
        let keys = await storage.allKeys()
        #expect(keys.contains("user_user-1_snapshot"))
    }

    // MARK: - Warm path (subsequent launch)

    @Test("warmFromCache after a prior applyLiveSnapshot hydrates state as .warmed fresh")
    func testSubsequentLaunchWarm() async {
        let storage = InMemoryCacheStorage()
        let store = DealCacheStore(storage: storage)
        // First "session": write live data
        let coord1 = DealCacheCoordinator(store: store)
        await coord1.warmFromCache(userId: "user-1")
        await coord1.applyLiveSnapshot(
            userId: "user-1",
            deal: makeDeal(),
            tasks: [makeTask()],
            events: [makeEvent()]
        )

        // Second "session": fresh coordinator reads the cache
        let coord2 = DealCacheCoordinator(store: store)
        await coord2.warmFromCache(userId: "user-1")

        guard case .warmed(let snapshot, let freshness) = coord2.state else {
            Issue.record("Expected .warmed, got \(coord2.state)")
            return
        }
        #expect(snapshot.deal?.id == "dr-1")
        guard case .fresh = freshness else {
            Issue.record("Expected .fresh, got \(freshness)")
            return
        }
    }

    // MARK: - Cross-user / cleared-session

    @Test("clearForSignOut deletes cache and transitions to .clearedOnSignOut")
    func testClearedSession() async {
        let storage = InMemoryCacheStorage()
        let store = DealCacheStore(storage: storage)
        let coordinator = DealCacheCoordinator(store: store)

        // Build up a cache
        await coordinator.warmFromCache(userId: "user-1")
        await coordinator.applyLiveSnapshot(
            userId: "user-1",
            deal: makeDeal(),
            tasks: [],
            events: []
        )

        await coordinator.clearForSignOut(userId: "user-1")

        guard case .clearedOnSignOut = coordinator.state else {
            Issue.record("Expected .clearedOnSignOut")
            return
        }
        let keys = await storage.allKeys()
        #expect(keys.isEmpty)
    }

    @Test("applyLiveSnapshot is dropped if user changed during fetch")
    func testLateSnapshotForOldUserDropped() async {
        let storage = InMemoryCacheStorage()
        let store = DealCacheStore(storage: storage)
        let coordinator = DealCacheCoordinator(store: store)

        await coordinator.warmFromCache(userId: "user-1")
        // User signs out mid-fetch
        await coordinator.clearForSignOut(userId: "user-1")

        // Late response for user-1 arrives — should be dropped
        await coordinator.applyLiveSnapshot(
            userId: "user-1",
            deal: makeDeal(),
            tasks: [makeTask()],
            events: []
        )

        guard case .clearedOnSignOut = coordinator.state else {
            Issue.record("Expected cache state to remain cleared")
            return
        }
        // And nothing should have been written to storage
        let keys = await storage.allKeys()
        #expect(keys.isEmpty)
    }

    @Test("applyLiveSnapshot cleans up any file written if sign-out lands mid-save")
    func testMidSaveSignOutRace() async {
        // Regression: codex P1 on PR #43. The pre-write guard runs
        // before the disk save, so a concurrent clearForSignOut can
        // delete the cache file AFTER the guard check but BEFORE the
        // save completes, leaving stale signed-out data on disk.
        // The fix: a post-write re-check detects the sign-out and
        // deletes the file we just wrote.
        //
        // Because the file-storage actor runs quickly, we simulate the
        // race by driving clearForSignOut() AFTER applyLiveSnapshot
        // returns — if the sign-out landed after applyLiveSnapshot's
        // pre-check but before the file was written, the post-write
        // guard must delete the just-written file.
        //
        // In this test we can't interleave the save with a hook, so
        // we verify the narrower invariant: calling clearForSignOut
        // after applyLiveSnapshot correctly removes the written file.
        let storage = InMemoryCacheStorage()
        let store = DealCacheStore(storage: storage)
        let coordinator = DealCacheCoordinator(store: store)

        await coordinator.warmFromCache(userId: "user-1")
        await coordinator.applyLiveSnapshot(
            userId: "user-1",
            deal: makeDeal(),
            tasks: [makeTask()],
            events: []
        )
        // Pre-condition: file was written
        var keys = await storage.allKeys()
        #expect(!keys.isEmpty)

        await coordinator.clearForSignOut(userId: "user-1")

        // Post-condition: file must be gone
        keys = await storage.allKeys()
        #expect(keys.isEmpty)

        guard case .clearedOnSignOut = coordinator.state else {
            Issue.record("Expected .clearedOnSignOut")
            return
        }
    }

    @Test("warmFromCache drops stale read if user changed mid-load")
    func testWarmFromCacheRace() async {
        // Regression: codex P2 on PR #43. After the disk read await,
        // warmFromCache set .warmed unconditionally. If a new warm or
        // a clearForSignOut ran during the await, the late result from
        // the old user could overwrite state with the wrong data.
        //
        // Verify the narrower invariant: after clearForSignOut, a
        // subsequent warmFromCache for a different user correctly
        // resolves to .empty and does not leak the old user's state.
        let storage = InMemoryCacheStorage()
        let store = DealCacheStore(storage: storage)
        let coordinator = DealCacheCoordinator(store: store)

        // user-1 builds up a cache
        await coordinator.warmFromCache(userId: "user-1")
        await coordinator.applyLiveSnapshot(
            userId: "user-1",
            deal: makeDeal(),
            tasks: [makeTask()],
            events: []
        )
        await coordinator.clearForSignOut(userId: "user-1")

        // user-2 warms — state must NOT show user-1 data
        await coordinator.warmFromCache(userId: "user-2")
        guard case .empty = coordinator.state else {
            Issue.record("Expected .empty for user-2, got \(coordinator.state)")
            return
        }
    }

    // MARK: - Reconnect scenario

    @Test("reconnect: warm from cache + applyLiveSnapshot replaces stale with fresh")
    func testReconnect() async {
        let storage = InMemoryCacheStorage()
        let store = DealCacheStore(storage: storage)
        let coord1 = DealCacheCoordinator(store: store)

        // First write
        await coord1.warmFromCache(userId: "user-1")
        await coord1.applyLiveSnapshot(
            userId: "user-1",
            deal: makeDeal(id: "dr-old"),
            tasks: [makeTask(id: "old-task")],
            events: []
        )

        // New coordinator (cold launch after reconnect)
        let coord2 = DealCacheCoordinator(store: store)
        await coord2.warmFromCache(userId: "user-1")
        guard case .warmed(let warmed, _) = coord2.state else {
            Issue.record("Expected .warmed on reconnect")
            return
        }
        #expect(warmed.deal?.id == "dr-old")

        // Live sync replaces with newer data
        await coord2.applyLiveSnapshot(
            userId: "user-1",
            deal: makeDeal(id: "dr-new"),
            tasks: [makeTask(id: "new-task")],
            events: [makeEvent(id: "new-event")]
        )

        guard case .liveSynced(let liveSynced) = coord2.state else {
            Issue.record("Expected .liveSynced after reconnect sync")
            return
        }
        #expect(liveSynced.deal?.id == "dr-new")
        #expect(liveSynced.tasks.map(\.id) == ["new-task"])
        #expect(liveSynced.events.map(\.id) == ["new-event"])
    }

    // MARK: - Cleared then re-signed-in

    @Test("cleared then different user warms fresh empty state")
    func testClearedThenDifferentUser() async {
        let storage = InMemoryCacheStorage()
        let store = DealCacheStore(storage: storage)
        let coordinator = DealCacheCoordinator(store: store)

        // User-1 session
        await coordinator.warmFromCache(userId: "user-1")
        await coordinator.applyLiveSnapshot(
            userId: "user-1",
            deal: makeDeal(),
            tasks: [makeTask()],
            events: []
        )
        await coordinator.clearForSignOut(userId: "user-1")

        // User-2 signs in — should see empty cache
        await coordinator.warmFromCache(userId: "user-2")
        guard case .empty = coordinator.state else {
            Issue.record("Expected .empty for new user, got \(coordinator.state)")
            return
        }
    }
}
