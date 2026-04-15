import Foundation
import Testing

@testable import BuyerV2

final class MockMessagePreferencesBackend: MessagePreferencesBackend, @unchecked Sendable {

    var fetchResult: Result<MessagePreferencesSnapshot, Error> =
        .success(MessagePreferencesSnapshot(preferences: .default, hasStored: false))
    var upsertResult: Result<MessagePreferences, Error> = .success(.default)
    var upsertResults: [Result<MessagePreferences, Error>] = []

    var fetchCallCount = 0
    var upsertCallCount = 0
    var lastUpsertPreferences: MessagePreferences?

    func fetch() async throws -> MessagePreferencesSnapshot {
        fetchCallCount += 1
        return try fetchResult.get()
    }

    func upsert(_ preferences: MessagePreferences) async throws -> MessagePreferences {
        upsertCallCount += 1
        lastUpsertPreferences = preferences
        if !upsertResults.isEmpty {
            return try upsertResults.removeFirst().get()
        }
        return try upsertResult.get()
    }
}

private struct StubError: Error, Equatable {
    let message: String
}

private actor ContinuationStore {
    private var continuation: CheckedContinuation<MessagePreferences, Never>?

    func store(_ continuation: CheckedContinuation<MessagePreferences, Never>) {
        self.continuation = continuation
    }

    func resume(returning preferences: MessagePreferences) {
        continuation?.resume(returning: preferences)
        continuation = nil
    }
}

private struct FixedPushPermissionProvider: PushPermissionProviding {
    let status: PushPermissionState
    func currentStatus() async -> PushPermissionState { status }
}

@Suite("MessagePreferences pure helpers")
struct MessagePreferencesPureTests {

    @Test("default matrix matches KIN-1095 expectations")
    func testDefaultMatrix() {
        let prefs = MessagePreferences.default

        for category in [
            MessageCategory.transactional,
            .tours,
            .offers,
            .closing,
            .disclosures,
            .safety,
        ] {
            for channel in MessageChannel.allCases {
                #expect(prefs.isEnabled(channel: channel, category: category))
            }
        }

        for category in [MessageCategory.marketUpdates, .marketing] {
            for channel in MessageChannel.allCases {
                #expect(!prefs.isEnabled(channel: channel, category: category))
            }
        }
    }

    @Test("legacy updates migrate deterministically to market updates")
    func testLegacyMigration() {
        let legacy = LegacyMessagePreferences(
            channels: LegacyChannelEnablement(email: true, sms: false, push: true, inApp: true),
            categories: LegacyCategoryEnablement(
                transactional: true,
                tours: true,
                offers: false,
                updates: true,
                marketing: false
            )
        )

        let migrated = MessagePreferences.migratingLegacy(legacy)

        #expect(migrated.matrix.marketUpdates.email == true)
        #expect(migrated.matrix.marketUpdates.sms == false)
        #expect(migrated.matrix.offers.email == false)
        #expect(migrated.matrix.safety == .allEnabled)
    }

    @Test("safety stays on even if a caller tries to disable it")
    func testSafetyNormalization() {
        let updated = MessagePreferences.default.withPreference(
            category: .safety,
            channel: .email,
            enabled: false
        )

        #expect(updated.matrix.safety == .allEnabled)
    }

    @Test("quiet hours validates timezone and overnight windows")
    func testQuietHoursValidation() {
        let overnight = QuietHours(start: "21:00", end: "08:00", timezone: "America/New_York")
        #expect(overnight?.crossesMidnight == true)
        #expect(QuietHours(start: "09:00", end: "17:00", timezone: "America/New_York")?.crossesMidnight == false)
        #expect(QuietHours(start: "99:00", end: "08:00", timezone: "America/New_York") == nil)
        #expect(QuietHours(start: "21:00", end: "08:00", timezone: "Mars/Phobos") == nil)
    }
}

@Suite("MessagePreferencesService state transitions", .serialized)
@MainActor
struct MessagePreferencesServiceTests {

    @Test("initial state is idle with unknown push permission")
    func testInitialState() {
        let service = MessagePreferencesService(
            backend: MockMessagePreferencesBackend(),
            pushPermissionProvider: FixedPushPermissionProvider(status: .unknown)
        )

        guard case .idle = service.state else {
            Issue.record("Expected idle state")
            return
        }
        #expect(service.saveState == .idle)
        #expect(service.preferences == .default)
        #expect(service.hasStoredPreferences == false)
        #expect(service.pushPermissionState == .unknown)
    }

    @Test("load fetches matrix preferences and push permission state")
    func testLoadSuccess() async {
        let backend = MockMessagePreferencesBackend()
        var stored = MessagePreferences.default
        stored = stored.withPreference(category: .marketUpdates, channel: .email, enabled: true)
        stored = stored.withQuietHours(QuietHours(start: "22:00", end: "07:00", timezone: "America/New_York"))
        backend.fetchResult = .success(
            MessagePreferencesSnapshot(preferences: stored, hasStored: true)
        )

        let service = MessagePreferencesService(
            backend: backend,
            pushPermissionProvider: FixedPushPermissionProvider(status: .allowed)
        )

        await service.load()

        guard case .loaded(let prefs, let hasStored) = service.state else {
            Issue.record("Expected loaded state")
            return
        }
        #expect(hasStored == true)
        #expect(prefs == stored)
        #expect(service.pushPermissionState == .allowed)
    }

    @Test("load failure surfaces an error and still refreshes permission state")
    func testLoadFailure() async {
        let backend = MockMessagePreferencesBackend()
        backend.fetchResult = .failure(StubError(message: "offline"))
        let service = MessagePreferencesService(
            backend: backend,
            pushPermissionProvider: FixedPushPermissionProvider(status: .denied)
        )

        await service.load()

        guard case .error("offline") = service.state else {
            Issue.record("Expected offline error")
            return
        }
        #expect(service.pushPermissionState == .denied)
    }

    @Test("setPreference applies optimistic matrix update and persists")
    func testSetPreferencePersists() async {
        let backend = MockMessagePreferencesBackend()
        let service = MessagePreferencesService(
            backend: backend,
            pushPermissionProvider: FixedPushPermissionProvider(status: .allowed)
        )
        await service.load()

        var persisted = MessagePreferences.default
        persisted = persisted.withPreference(category: .offers, channel: .sms, enabled: false)
        backend.upsertResult = .success(persisted)

        await service.setPreference(category: .offers, channel: .sms, isEnabled: false)
        try? await Task.sleep(nanoseconds: 50_000_000)

        #expect(service.preferences.matrix.offers.sms == false)
        #expect(backend.lastUpsertPreferences?.matrix.offers.sms == false)
    }

    @Test("update keeps the optimistic value visible until the write settles")
    func testSavingStateIsExplicit() async {
        final class DeferredBackend: MessagePreferencesBackend, @unchecked Sendable {
            let continuationStore = ContinuationStore()

            func fetch() async throws -> MessagePreferencesSnapshot {
                MessagePreferencesSnapshot(preferences: .default, hasStored: false)
            }

            func upsert(_ preferences: MessagePreferences) async throws -> MessagePreferences {
                await withCheckedContinuation { continuation in
                    Task { await continuationStore.store(continuation) }
                }
            }
        }

        let backend = DeferredBackend()
        let service = MessagePreferencesService(
            backend: backend,
            pushPermissionProvider: FixedPushPermissionProvider(status: .allowed)
        )
        await service.load()

        let task = Task {
            await service.setPreference(category: .offers, channel: .sms, isEnabled: false)
        }

        await Task.yield()

        #expect(service.preferences.matrix.offers.sms == false)

        await backend.continuationStore.resume(returning: service.preferences)
        await task.value
    }

    @Test("failed save rolls back optimistic state and first-time stored flag")
    func testRollbackOnFailure() async {
        let backend = MockMessagePreferencesBackend()
        backend.upsertResult = .failure(StubError(message: "network down"))

        let service = MessagePreferencesService(
            backend: backend,
            pushPermissionProvider: FixedPushPermissionProvider(status: .allowed)
        )
        await service.load()

        await service.setPreference(category: .offers, channel: .email, isEnabled: false)
        try? await Task.sleep(nanoseconds: 50_000_000)

        #expect(service.preferences == .default)
        #expect(service.hasStoredPreferences == false)
        #expect(service.saveState == .error("network down"))
    }

    @Test("rapid edits preserve the final intended state even when writes coalesce")
    func testQueuedWritesKeepFinalIntent() async {
        final class SequencedBackend: MessagePreferencesBackend, @unchecked Sendable {
            let firstContinuation = ContinuationStore()
            var recorded: [MessagePreferences] = []
            var callCount = 0

            func fetch() async throws -> MessagePreferencesSnapshot {
                MessagePreferencesSnapshot(preferences: .default, hasStored: true)
            }

            func upsert(_ preferences: MessagePreferences) async throws -> MessagePreferences {
                callCount += 1
                recorded.append(preferences)
                if callCount == 1 {
                    return await withCheckedContinuation { continuation in
                        Task { await firstContinuation.store(continuation) }
                    }
                }
                return preferences
            }
        }

        let backend = SequencedBackend()
        let service = MessagePreferencesService(
            backend: backend,
            pushPermissionProvider: FixedPushPermissionProvider(status: .allowed)
        )
        await service.load()

        let first = Task {
            await service.setPreference(category: .offers, channel: .email, isEnabled: false)
        }
        await Task.yield()
        await service.setPreference(category: .offers, channel: .email, isEnabled: true)
        await backend.firstContinuation.resume(returning: service.preferences)
        await first.value
        try? await Task.sleep(nanoseconds: 50_000_000)

        #expect(service.preferences.matrix.offers.email == true)
        #expect(backend.recorded.count >= 1)
    }

    @Test("push rows ignore app-level changes when iOS settings deny push")
    func testPushDeniedBlocksToggle() async {
        let backend = MockMessagePreferencesBackend()
        let service = MessagePreferencesService(
            backend: backend,
            pushPermissionProvider: FixedPushPermissionProvider(status: .denied)
        )
        await service.load()

        await service.setPreference(category: .offers, channel: .push, isEnabled: false)

        #expect(service.preferences.matrix.offers.push == true)
        #expect(backend.upsertCallCount == 0)
    }

    @Test("quiet hours changes persist with validation")
    func testQuietHoursUpdate() async {
        let backend = MockMessagePreferencesBackend()
        let service = MessagePreferencesService(
            backend: backend,
            pushPermissionProvider: FixedPushPermissionProvider(status: .allowed)
        )
        await service.load()

        var persisted = MessagePreferences.default
        persisted = persisted.withQuietHours(
            QuietHours(start: "22:30", end: "07:15", timezone: "America/New_York")
        )
        backend.upsertResult = .success(persisted)

        await service.setQuietHoursEnabled(true)
        await service.setQuietHours(start: "22:30", end: "07:15", timezone: "America/New_York")
        try? await Task.sleep(nanoseconds: 50_000_000)

        #expect(service.preferences.quietHours?.start == "22:30")
        #expect(service.preferences.quietHours?.end == "07:15")
    }

    @Test("bulk opt out keeps safety enabled")
    func testDisableAllOptionalNotifications() async {
        let backend = MockMessagePreferencesBackend()
        let service = MessagePreferencesService(
            backend: backend,
            pushPermissionProvider: FixedPushPermissionProvider(status: .allowed)
        )
        await service.load()

        let persisted = MessagePreferences.default.optOutAllOptionalNotifications()
        backend.upsertResult = .success(persisted)

        await service.disableAllOptionalNotifications()
        try? await Task.sleep(nanoseconds: 50_000_000)

        #expect(service.preferences.isGloballyOptedOut)
        #expect(service.preferences.matrix.safety == .allEnabled)
    }
}
