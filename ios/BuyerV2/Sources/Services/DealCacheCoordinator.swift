import Foundation
import Observation

// MARK: - CacheWarmState

/// High-level state the UI observes. Mirrors the three progressive
/// stages of offline-first rendering:
///   1. `.idle` — no attempt yet
///   2. `.warming` — reading from disk
///   3. `.warmed(snapshot, freshness)` — rendered from cache
///   4. `.liveSynced(snapshot)` — replaced with a live backend fetch
///   5. `.empty` — no cache AND no live data (first-ever run offline)
enum CacheWarmState: Sendable, Equatable {
    case idle
    case warming
    case warmed(CachedDealSnapshot, CacheFreshness)
    case liveSynced(CachedDealSnapshot)
    case empty
    case clearedOnSignOut
}

// MARK: - DealCacheCoordinator

/// Offline-first coordinator: warms the UI from disk on cold start
/// then reconciles with live backend data as it arrives. Designed to
/// be injected into the deal tracker shell alongside `DealService`,
/// `DealTasksService`, and `DealTimelineService`.
///
/// Orchestration pattern:
///   - On sign-in: `warmFromCache(userId:)` → state becomes `.warmed`
///     or `.empty`. The shell can immediately render whatever the
///     cache had and trigger live fetches in parallel.
///   - When live fetches return: call `applyLiveSnapshot(...)` with
///     the fresh data. The coordinator writes it to disk and transitions
///     to `.liveSynced(snapshot)`.
///   - On sign-out: `clearForSignOut(userId:)` deletes the cache file
///     and transitions to `.clearedOnSignOut` so the next sign-in
///     sees a clean slate.
@MainActor
@Observable
final class DealCacheCoordinator {

    private(set) var state: CacheWarmState = .idle

    private let store: DealCacheStore
    private var currentUserId: String?

    init(store: DealCacheStore = DealCacheStore()) {
        self.store = store
    }

    // MARK: - Warm from cache

    /// Read the on-disk snapshot for the given user. Transitions to
    /// `.warmed` if a fresh-or-stale cache exists, otherwise `.empty`.
    /// Callers should then kick off live fetches via DealService /
    /// DealTasksService / DealTimelineService in parallel and call
    /// `applyLiveSnapshot` when those return.
    func warmFromCache(userId: String) async {
        currentUserId = userId
        state = .warming

        do {
            if let result = try await store.loadSnapshot(for: userId) {
                state = .warmed(result.0, result.1)
                return
            }
        } catch {
            // Storage errors collapse to empty — we still want offline
            // rendering to work, we just have no data yet.
        }
        state = .empty
    }

    // MARK: - Apply live snapshot

    /// Persist a fresh snapshot from live backend data and transition
    /// to `.liveSynced`. Called when `DealService`, `DealTasksService`,
    /// and `DealTimelineService` have all returned with the current
    /// deal, its tasks, and its timeline events.
    ///
    /// Late-response safety: if the userId was cleared (sign-out) or
    /// changed (different user signed in) while the live fetch was in
    /// flight, we drop the write so we never mix data across users.
    func applyLiveSnapshot(
        userId: String,
        deal: DealSummary?,
        tasks: [DealTask],
        events: [MilestoneEvent]
    ) async {
        guard userId == currentUserId else {
            // Superseded — different user is active now.
            return
        }

        do {
            try await store.saveSnapshot(
                userId: userId,
                deal: deal,
                tasks: tasks,
                events: events
            )
            guard userId == currentUserId else { return }
            if let result = try await store.loadSnapshot(for: userId) {
                state = .liveSynced(result.0)
            } else {
                state = .empty
            }
        } catch {
            // Write failed (disk full / sandbox issue). Don't mutate
            // state — the in-memory UI still has the live data the
            // services fetched. A later sync will retry.
        }
    }

    // MARK: - Sign-out clear

    /// Delete the cache and move to `.clearedOnSignOut`. Called when
    /// AuthService transitions to `.signedOut`.
    func clearForSignOut(userId: String) async {
        // Clear the user ID first so any in-flight `applyLiveSnapshot`
        // calls drop their late writes rather than race with the delete.
        let userToClear = userId
        currentUserId = nil

        do {
            try await store.clear(for: userToClear)
        } catch {
            // Best-effort — if the delete fails we still want to show
            // the cleared state to the UI so it doesn't keep rendering
            // the previous user's data.
        }
        state = .clearedOnSignOut
    }

    // MARK: - Refresh freshness

    /// Re-evaluate the freshness of a warmed cache against the current
    /// clock. Called when the app comes to the foreground so stale
    /// banners update even if nothing else changed.
    func reevaluateFreshness() async {
        guard let userId = currentUserId else { return }
        guard case .warmed(let snapshot, _) = state else { return }
        let newFreshness = await store.computeFreshness(lastSyncedAt: snapshot.lastSyncedAt)
        state = .warmed(snapshot, newFreshness)
    }
}
