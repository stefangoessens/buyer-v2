import Foundation

// MARK: - CachedDealSnapshot

/// A persisted snapshot of one buyer's active deal, ready to render
/// offline. The snapshot bundles the `DealSummary`, its tasks, and the
/// timeline events so the app can bring up a fully rendered deal tracker
/// with zero network calls.
///
/// **Internal-only field safety**: every struct in this snapshot is a
/// buyer-facing read model (`DealSummary`, `DealTask`, `MilestoneEvent`).
/// The Convex query layer filters out internal broker notes, compensation,
/// routing state, and PII user IDs before data ever reaches the client —
/// so anything that lands in this cache is by construction safe to
/// persist to disk. The cache layer itself must never add extra fields;
/// it serializes the structs as-is.
struct CachedDealSnapshot: Sendable, Codable, Equatable {
    /// Schema version — bump when the shape changes in a breaking way
    /// so old caches are rejected on load instead of decoded into the
    /// wrong shape.
    let schemaVersion: Int

    /// User that owns this cache. The cache is invalidated on sign-out
    /// or when a different user signs in — we never mix buyer data.
    let userId: String

    /// Last time the cache was updated from a live backend response,
    /// as an ISO-8601 UTC string. Drives the `CacheFreshness` computed
    /// state and the "Last synced …" UI label.
    let lastSyncedAt: String

    /// The active deal summary, or nil if the buyer had no active deal
    /// at cache time. `nil` is a valid cached state — it means "we know
    /// there's nothing, offline users shouldn't see a loading spinner".
    let deal: DealSummary?

    /// Tasks for the cached deal. Empty array is valid — distinct from
    /// "no cache at all" (which is represented by the absence of a
    /// snapshot file).
    let tasks: [DealTask]

    /// Timeline events for the cached deal.
    let events: [MilestoneEvent]
}

// MARK: - CacheFreshness

/// Computed freshness state derived from `lastSyncedAt`. The UI shows a
/// "Last synced N minutes ago" label for fresh caches, a "Cached from
/// earlier session" banner for stale caches, and triggers a background
/// re-sync when state crosses from fresh → stale.
enum CacheFreshness: Sendable, Equatable {
    /// Synced within the fresh window (default 5 min).
    case fresh(ageSeconds: Int)

    /// Synced longer than the fresh window ago but within the usable window.
    /// UI still renders the data, just with a "Cached from N minutes ago" hint.
    case stale(ageSeconds: Int)

    /// Cache has aged out of the usable window — UI treats it as absent
    /// and shows the loading state until a live fetch returns.
    case expired(ageSeconds: Int)

    var ageSeconds: Int {
        switch self {
        case .fresh(let s), .stale(let s), .expired(let s): s
        }
    }

    var isUsable: Bool {
        switch self {
        case .fresh, .stale: true
        case .expired: false
        }
    }
}

/// Fresh cache policy. 5 min fresh, 24 h usable ceiling.
/// These are module-level so tests can override by constructing a
/// `CacheFreshnessPolicy` rather than patching a static.
struct CacheFreshnessPolicy: Sendable {
    let freshWindowSeconds: Int
    let expiredWindowSeconds: Int

    static let `default` = CacheFreshnessPolicy(
        freshWindowSeconds: 300,       // 5 min
        expiredWindowSeconds: 86_400   // 24 h
    )

    /// Classify a sync age in seconds into the freshness ladder.
    func classify(ageSeconds: Int) -> CacheFreshness {
        if ageSeconds < freshWindowSeconds {
            return .fresh(ageSeconds: ageSeconds)
        }
        if ageSeconds < expiredWindowSeconds {
            return .stale(ageSeconds: ageSeconds)
        }
        return .expired(ageSeconds: ageSeconds)
    }
}

// MARK: - Storage protocol

/// Abstract storage so tests can swap in an in-memory backing instead
/// of writing to the real Documents directory.
protocol CacheStorage: Sendable {
    func read(key: String) async throws -> Data?
    func write(key: String, data: Data) async throws
    func delete(key: String) async throws
}

// MARK: - FileCacheStorage

/// JSON-on-disk storage in the app's Documents directory.
/// Each key maps to `Documents/DealCache/<key>.json` so multiple users
/// on the same device never share a cache file.
final class FileCacheStorage: CacheStorage, @unchecked Sendable {

    private let directoryURL: URL
    private let fileManager = FileManager.default

    init(
        baseDirectory: URL? = nil
    ) {
        if let baseDirectory {
            self.directoryURL = baseDirectory.appendingPathComponent("DealCache", isDirectory: true)
        } else {
            let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
            self.directoryURL = docs.appendingPathComponent("DealCache", isDirectory: true)
        }
        try? fileManager.createDirectory(at: directoryURL, withIntermediateDirectories: true)
    }

    private func fileURL(for key: String) -> URL {
        // Sanitize the key so it's a safe filename — hash unusual characters
        // and keep a human-readable prefix for debugging.
        let safe = key
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "\\", with: "_")
            .replacingOccurrences(of: ":", with: "_")
        return directoryURL
            .appendingPathComponent("\(safe).json")
    }

    func read(key: String) async throws -> Data? {
        let url = fileURL(for: key)
        guard fileManager.fileExists(atPath: url.path) else { return nil }
        return try Data(contentsOf: url)
    }

    func write(key: String, data: Data) async throws {
        let url = fileURL(for: key)
        try data.write(to: url, options: [.atomic])
    }

    func delete(key: String) async throws {
        let url = fileURL(for: key)
        guard fileManager.fileExists(atPath: url.path) else { return }
        try fileManager.removeItem(at: url)
    }
}

// MARK: - InMemoryCacheStorage

/// Test-only storage that keeps data in a dictionary. Exposed at the
/// top level (not nested inside tests) because Swift actors + storage
/// protocol need a stable type the production code can reference.
actor InMemoryCacheStorage: CacheStorage {
    private var store: [String: Data] = [:]

    func read(key: String) async throws -> Data? {
        store[key]
    }

    func write(key: String, data: Data) async throws {
        store[key] = data
    }

    func delete(key: String) async throws {
        store.removeValue(forKey: key)
    }

    /// Test helper — snapshot current keys
    func allKeys() -> [String] {
        Array(store.keys)
    }
}

// MARK: - DealCacheStore

/// Actor wrapping a `CacheStorage` with the `CachedDealSnapshot` codec
/// and freshness logic. This is the only place the app reads or writes
/// the on-disk cache file.
actor DealCacheStore {

    static let currentSchemaVersion = 1

    private let storage: CacheStorage
    private let policy: CacheFreshnessPolicy
    private let clock: @Sendable () -> Date

    init(
        storage: CacheStorage = FileCacheStorage(),
        policy: CacheFreshnessPolicy = .default,
        clock: @escaping @Sendable () -> Date = { Date() }
    ) {
        self.storage = storage
        self.policy = policy
        self.clock = clock
    }

    // MARK: - Keys

    private func key(for userId: String) -> String {
        "user_\(userId)_snapshot"
    }

    // MARK: - Load

    /// Load the cached snapshot for the given user. Returns nil if no
    /// cache exists, the schema is out of date, the cache belongs to a
    /// different user, or the freshness is .expired.
    func loadSnapshot(for userId: String) async throws -> (CachedDealSnapshot, CacheFreshness)? {
        guard let data = try await storage.read(key: key(for: userId)) else {
            return nil
        }

        let decoder = JSONDecoder()
        let snapshot: CachedDealSnapshot
        do {
            snapshot = try decoder.decode(CachedDealSnapshot.self, from: data)
        } catch {
            // Corrupt or shape-drift cache — delete and return nil.
            try? await storage.delete(key: key(for: userId))
            return nil
        }

        // Schema version guard
        if snapshot.schemaVersion != Self.currentSchemaVersion {
            try? await storage.delete(key: key(for: userId))
            return nil
        }

        // Cross-user guard — the cache file is keyed by user, but we
        // double-check the payload userId matches in case of corruption
        // or a manual copy.
        guard snapshot.userId == userId else {
            try? await storage.delete(key: key(for: userId))
            return nil
        }

        let freshness = computeFreshness(lastSyncedAt: snapshot.lastSyncedAt)

        // Expired caches get dropped from disk — the UI treats them as
        // absent and a live fetch will rewrite them.
        if case .expired = freshness {
            try? await storage.delete(key: key(for: userId))
            return nil
        }

        return (snapshot, freshness)
    }

    // MARK: - Save

    /// Persist a fresh snapshot for the user, overwriting any prior one.
    /// `lastSyncedAt` is stamped from the current clock.
    func saveSnapshot(
        userId: String,
        deal: DealSummary?,
        tasks: [DealTask],
        events: [MilestoneEvent]
    ) async throws {
        let snapshot = CachedDealSnapshot(
            schemaVersion: Self.currentSchemaVersion,
            userId: userId,
            lastSyncedAt: isoTimestamp(from: clock()),
            deal: deal,
            tasks: tasks,
            events: events
        )
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let data = try encoder.encode(snapshot)
        try await storage.write(key: key(for: userId), data: data)
    }

    // MARK: - Clear

    /// Remove the cache file for one user. Called on sign-out and on
    /// explicit "Clear cache" actions.
    func clear(for userId: String) async throws {
        try await storage.delete(key: key(for: userId))
    }

    // MARK: - Freshness

    /// Compute freshness against the injected clock so tests can
    /// exercise the fresh/stale/expired ladder deterministically.
    func computeFreshness(lastSyncedAt: String) -> CacheFreshness {
        guard let last = parseISO(lastSyncedAt) else {
            return .expired(ageSeconds: policy.expiredWindowSeconds)
        }
        let now = clock()
        let age = max(0, Int(now.timeIntervalSince(last)))
        return policy.classify(ageSeconds: age)
    }

    // MARK: - Helpers

    private func isoTimestamp(from date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.string(from: date)
    }

    private func parseISO(_ s: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        if let d = formatter.date(from: s) { return d }
        // Fallback: try with fractional seconds for tests using Date()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.date(from: s)
    }
}
