import Foundation
import Testing

@testable import BuyerV2

// MARK: - MockMessagePreferencesBackend

final class MockMessagePreferencesBackend: MessagePreferencesBackend, @unchecked Sendable {

    // Configurable responses
    var fetchResult: Result<(preferences: MessagePreferences, hasStored: Bool), Error> =
        .success((MessagePreferences.default, false))
    var upsertResult: Result<MessagePreferences, Error> = .success(.default)
    var optOutAllResult: Result<MessagePreferences, Error> = .success(.default)
    var resetResult: Result<MessagePreferences, Error> = .success(.default)

    // Call tracking
    var fetchCallCount = 0
    var upsertCallCount = 0
    var optOutCallCount = 0
    var resetCallCount = 0
    var lastUpsertPatch: MessagePreferencesPatch?

    func fetch() async throws -> (preferences: MessagePreferences, hasStored: Bool) {
        fetchCallCount += 1
        return try fetchResult.get()
    }

    func upsert(_ patch: MessagePreferencesPatch) async throws -> MessagePreferences {
        upsertCallCount += 1
        lastUpsertPatch = patch
        return try upsertResult.get()
    }

    func optOutAll() async throws -> MessagePreferences {
        optOutCallCount += 1
        return try optOutAllResult.get()
    }

    func resetToDefaults() async throws -> MessagePreferences {
        resetCallCount += 1
        return try resetResult.get()
    }
}

// MARK: - Test fixtures

private struct StubError: Error, Equatable {
    let message: String
}

// MARK: - Pure model tests

@Suite("MessagePreferences pure helpers")
struct MessagePreferencesPureTests {

    @Test("default preferences match the web helper defaults")
    func testDefaultMatchesWebHelper() {
        let prefs = MessagePreferences.default
        #expect(prefs.channels.email == true)
        #expect(prefs.channels.sms == false)
        #expect(prefs.channels.push == true)
        #expect(prefs.channels.inApp == true)
        #expect(prefs.categories.transactional == true)
        #expect(prefs.categories.tours == true)
        #expect(prefs.categories.offers == true)
        #expect(prefs.categories.updates == true)
        #expect(prefs.categories.marketing == false)
    }

    @Test("shouldDeliver requires BOTH channel and category enabled")
    func testShouldDeliverStrict() {
        let prefs = MessagePreferences.default
        #expect(prefs.shouldDeliver(channel: .email, category: .transactional))
        #expect(prefs.shouldDeliver(channel: .push, category: .tours))
        // SMS channel off → blocked
        #expect(!prefs.shouldDeliver(channel: .sms, category: .transactional))
        // Marketing category off → blocked
        #expect(!prefs.shouldDeliver(channel: .email, category: .marketing))
    }

    @Test("isGloballyOptedOut reflects channel state")
    func testIsGloballyOptedOut() {
        #expect(!MessagePreferences.default.isGloballyOptedOut)
        let opted = MessagePreferences(channels: .optedOut, categories: .default)
        #expect(opted.isGloballyOptedOut)
        // One channel still on → not globally opted out
        var mixed = MessagePreferences(channels: .optedOut, categories: .default)
        mixed.channels.inApp = true
        #expect(!mixed.isGloballyOptedOut)
    }

    @Test("applyPatch merges only specified fields")
    func testApplyPatchPartial() {
        let base = MessagePreferences.default
        let patch = MessagePreferencesPatch(
            smsEnabled: true,
            marketingEnabled: true
        )
        let result = applyPatch(patch, to: base)
        #expect(result.channels.sms == true)
        #expect(result.categories.marketing == true)
        // Unchanged fields preserved
        #expect(result.channels.email == true)
        #expect(result.categories.transactional == true)
    }

    @Test("applyPatch is a no-op for an empty patch")
    func testApplyPatchEmpty() {
        let base = MessagePreferences.default
        let result = applyPatch(MessagePreferencesPatch(), to: base)
        #expect(result == base)
    }

    @Test("ChannelEnablement.isEnabled returns the right flag")
    func testChannelEnablement() {
        let ch = ChannelEnablement.default
        #expect(ch.isEnabled(.email))
        #expect(!ch.isEnabled(.sms))
        #expect(ch.isEnabled(.push))
        #expect(ch.isEnabled(.inApp))
    }

    @Test("CategoryEnablement.isEnabled returns the right flag")
    func testCategoryEnablement() {
        let cat = CategoryEnablement.default
        #expect(cat.isEnabled(.transactional))
        #expect(cat.isEnabled(.tours))
        #expect(!cat.isEnabled(.marketing))
    }
}

// MARK: - Service tests

@Suite("MessagePreferencesService state transitions", .serialized)
@MainActor
struct MessagePreferencesServiceTests {

    // MARK: - Initial / Load

    @Test("initial state is .idle")
    func testInitialState() {
        let backend = MockMessagePreferencesBackend()
        let service = MessagePreferencesService(backend: backend)
        guard case .idle = service.state else {
            Issue.record("Expected .idle, got \(service.state)")
            return
        }
        #expect(service.preferences == .default)
        #expect(service.hasStoredPreferences == false)
    }

    @Test("load() with no stored prefs → loaded with hasStored=false")
    func testLoadNoStoredPrefs() async {
        let backend = MockMessagePreferencesBackend()
        backend.fetchResult = .success((MessagePreferences.default, false))
        let service = MessagePreferencesService(backend: backend)

        await service.load()

        guard case .loaded(_, let hasStored) = service.state else {
            Issue.record("Expected .loaded, got \(service.state)")
            return
        }
        #expect(hasStored == false)
        #expect(service.hasStoredPreferences == false)
        #expect(service.preferences == .default)
        #expect(backend.fetchCallCount == 1)
    }

    @Test("load() with stored prefs → loaded with hasStored=true")
    func testLoadWithStoredPrefs() async {
        let backend = MockMessagePreferencesBackend()
        var stored = MessagePreferences.default
        stored.channels.sms = true
        stored.categories.marketing = true
        backend.fetchResult = .success((stored, true))
        let service = MessagePreferencesService(backend: backend)

        await service.load()

        guard case .loaded(let prefs, let hasStored) = service.state else {
            Issue.record("Expected .loaded")
            return
        }
        #expect(hasStored == true)
        #expect(prefs.channels.sms == true)
        #expect(prefs.categories.marketing == true)
    }

    @Test("load() failure → state is .error, preferences unchanged")
    func testLoadError() async {
        let backend = MockMessagePreferencesBackend()
        backend.fetchResult = .failure(StubError(message: "offline"))
        let service = MessagePreferencesService(backend: backend)

        await service.load()

        guard case .error = service.state else {
            Issue.record("Expected .error")
            return
        }
        #expect(service.preferences == .default)
    }

    // MARK: - Update (create, partial, opt-out)

    @Test("update() with create path applies patch and marks hasStored")
    func testUpdateCreatesFromDefaults() async {
        let backend = MockMessagePreferencesBackend()
        // Backend echoes back what the client sent (simulating the merge)
        var persisted = MessagePreferences.default
        persisted.channels.sms = true
        backend.upsertResult = .success(persisted)
        let service = MessagePreferencesService(backend: backend)

        await service.update(MessagePreferencesPatch(smsEnabled: true))

        #expect(service.preferences.channels.sms == true)
        #expect(service.hasStoredPreferences == true)
        #expect(backend.upsertCallCount == 1)
        #expect(backend.lastUpsertPatch?.smsEnabled == true)
    }

    @Test("update() with partial patch preserves unset fields")
    func testUpdatePartial() async {
        let backend = MockMessagePreferencesBackend()
        var loaded = MessagePreferences.default
        loaded.categories.marketing = true
        backend.fetchResult = .success((loaded, true))
        let service = MessagePreferencesService(backend: backend)
        await service.load()

        // Backend echoes back merged result
        var afterUpdate = loaded
        afterUpdate.channels.sms = true
        backend.upsertResult = .success(afterUpdate)

        await service.update(MessagePreferencesPatch(smsEnabled: true))

        // Marketing should still be true (preserved from load)
        #expect(service.preferences.categories.marketing == true)
        #expect(service.preferences.channels.sms == true)
    }

    @Test("update() with opt-out toggle flips specific channels")
    func testUpdateOptOutChannel() async {
        let backend = MockMessagePreferencesBackend()
        var withoutEmail = MessagePreferences.default
        withoutEmail.channels.email = false
        backend.upsertResult = .success(withoutEmail)
        let service = MessagePreferencesService(backend: backend)

        await service.update(MessagePreferencesPatch(emailEnabled: false))

        #expect(service.preferences.channels.email == false)
        #expect(service.preferences.channels.push == true)
    }

    @Test("update() failure rolls back optimistic changes")
    func testUpdateRollbackOnFailure() async {
        let backend = MockMessagePreferencesBackend()
        let baseline = MessagePreferences.default
        backend.fetchResult = .success((baseline, true))
        let service = MessagePreferencesService(backend: backend)
        await service.load()

        // Upsert fails — optimistic change should be rolled back
        backend.upsertResult = .failure(StubError(message: "network down"))

        await service.update(MessagePreferencesPatch(marketingEnabled: true))

        #expect(service.preferences == baseline)
        guard case .error = service.state else {
            Issue.record("Expected .error after failed update")
            return
        }
    }

    @Test("update() failure for first-time user restores hasStoredPreferences=false")
    func testUpdateRollbackFirstTimeUser() async {
        // Regression: codex P2 on PR #40. A first-time user (no stored
        // row) optimistically flipped hasStoredPreferences=true before
        // the backend call. If the call failed, the flag was left true,
        // suppressing onboarding nudges even though nothing was saved.
        let backend = MockMessagePreferencesBackend()
        backend.fetchResult = .success((MessagePreferences.default, false))
        let service = MessagePreferencesService(backend: backend)
        await service.load()
        #expect(service.hasStoredPreferences == false)

        backend.upsertResult = .failure(StubError(message: "boom"))

        await service.update(MessagePreferencesPatch(smsEnabled: true))

        #expect(service.hasStoredPreferences == false)
        #expect(service.preferences == .default)
        guard case .error = service.state else {
            Issue.record("Expected .error")
            return
        }
    }

    @Test("optOutAll() failure for first-time user also rolls back hasStoredPreferences")
    func testOptOutAllRollbackFirstTimeUser() async {
        let backend = MockMessagePreferencesBackend()
        backend.fetchResult = .success((MessagePreferences.default, false))
        let service = MessagePreferencesService(backend: backend)
        await service.load()
        #expect(service.hasStoredPreferences == false)

        backend.optOutAllResult = .failure(StubError(message: "boom"))

        await service.optOutAll()

        #expect(service.hasStoredPreferences == false)
        #expect(service.preferences == .default)
    }

    @Test("resetToDefaults() failure for first-time user also rolls back hasStoredPreferences")
    func testResetRollbackFirstTimeUser() async {
        let backend = MockMessagePreferencesBackend()
        backend.fetchResult = .success((MessagePreferences.default, false))
        let service = MessagePreferencesService(backend: backend)
        await service.load()

        backend.resetResult = .failure(StubError(message: "boom"))

        await service.resetToDefaults()

        #expect(service.hasStoredPreferences == false)
    }

    // MARK: - Opt-out all

    @Test("optOutAll() disables every channel and preserves categories")
    func testOptOutAll() async {
        let backend = MockMessagePreferencesBackend()
        var loaded = MessagePreferences.default
        loaded.categories.marketing = true
        backend.fetchResult = .success((loaded, true))
        let service = MessagePreferencesService(backend: backend)
        await service.load()

        // Backend returns fully opted-out channels + preserved categories
        let optedOut = MessagePreferences(
            channels: .optedOut,
            categories: loaded.categories
        )
        backend.optOutAllResult = .success(optedOut)

        await service.optOutAll()

        #expect(service.preferences.isGloballyOptedOut == true)
        #expect(service.preferences.categories.marketing == true)
        #expect(backend.optOutCallCount == 1)
    }

    @Test("optOutAll() failure rolls back to previous state")
    func testOptOutAllRollback() async {
        let backend = MockMessagePreferencesBackend()
        backend.fetchResult = .success((MessagePreferences.default, true))
        let service = MessagePreferencesService(backend: backend)
        await service.load()

        backend.optOutAllResult = .failure(StubError(message: "boom"))

        await service.optOutAll()

        #expect(service.preferences == .default)
        guard case .error = service.state else {
            Issue.record("Expected .error")
            return
        }
    }

    // MARK: - Reset to defaults

    @Test("resetToDefaults() returns preferences to default values")
    func testResetToDefaults() async {
        let backend = MockMessagePreferencesBackend()
        var custom = MessagePreferences.default
        custom.channels.sms = true
        custom.categories.marketing = true
        backend.fetchResult = .success((custom, true))
        let service = MessagePreferencesService(backend: backend)
        await service.load()

        backend.resetResult = .success(.default)

        await service.resetToDefaults()

        #expect(service.preferences == .default)
        #expect(backend.resetCallCount == 1)
    }
}
