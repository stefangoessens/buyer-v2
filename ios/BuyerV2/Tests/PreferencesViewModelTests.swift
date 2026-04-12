import Foundation
import Testing

@testable import BuyerV2

// MARK: - PreferencesViewModel display-state mapping

@Suite("PreferencesViewModel display mapping")
struct PreferencesViewModelDisplayTests {

    private let sampleUser = AuthUser(
        id: "user_1",
        email: "buyer@example.com",
        name: "Buyer One",
        role: .buyer
    )

    // MARK: - Auth boundary

    @Test("signed-out auth short-circuits every service state")
    func testSignedOutAuthAlwaysWins() {
        for serviceState: MessagePreferencesLoadState in [
            .idle,
            .loading,
            .loaded(.default, hasStored: true),
            .error("something broke")
        ] {
            let vm = PreferencesViewModel(
                authState: .signedOut,
                serviceState: serviceState
            )
            #expect(vm.display() == .signedOut)
        }
    }

    @Test("expired auth maps to signedOut")
    func testExpiredAuthMapsSignedOut() {
        let vm = PreferencesViewModel(
            authState: .expired,
            serviceState: .loaded(.default, hasStored: true)
        )
        #expect(vm.display() == .signedOut)
    }

    @Test("restoring auth keeps the screen in loading")
    func testRestoringAuthKeepsLoading() {
        let vm = PreferencesViewModel(
            authState: .restoring,
            serviceState: .loaded(.default, hasStored: true)
        )
        #expect(vm.display() == .loading)
    }

    // MARK: - Loading

    @Test("signed-in + idle service → loading")
    func testSignedInIdleMapsLoading() {
        let vm = PreferencesViewModel(
            authState: .signedIn(user: sampleUser),
            serviceState: .idle
        )
        #expect(vm.display() == .loading)
    }

    @Test("signed-in + loading service → loading")
    func testSignedInLoadingMapsLoading() {
        let vm = PreferencesViewModel(
            authState: .signedIn(user: sampleUser),
            serviceState: .loading
        )
        #expect(vm.display() == .loading)
    }

    // MARK: - Loaded

    @Test("signed-in + loaded with stored=false → content with hasStored=false")
    func testLoadedFirstTimeUser() {
        let vm = PreferencesViewModel(
            authState: .signedIn(user: sampleUser),
            serviceState: .loaded(.default, hasStored: false)
        )
        guard case .content(let prefs, let hasStored, let saveError) = vm.display() else {
            Issue.record("Expected .content")
            return
        }
        #expect(prefs == .default)
        #expect(hasStored == false)
        #expect(saveError == nil)
    }

    @Test("signed-in + loaded with stored=true → content with hasStored=true")
    func testLoadedReturningUser() {
        var prefs = MessagePreferences.default
        prefs.channels.sms = true
        prefs.categories.marketing = true
        let vm = PreferencesViewModel(
            authState: .signedIn(user: sampleUser),
            serviceState: .loaded(prefs, hasStored: true)
        )
        guard case .content(let display, let hasStored, _) = vm.display() else {
            Issue.record("Expected .content")
            return
        }
        #expect(display.channels.sms == true)
        #expect(display.categories.marketing == true)
        #expect(hasStored == true)
    }

    // MARK: - Error branching

    @Test("signed-in + generic error → error screen")
    func testGenericErrorMapsError() {
        let vm = PreferencesViewModel(
            authState: .signedIn(user: sampleUser),
            serviceState: .error("offline")
        )
        #expect(vm.display() == .error("offline"))
    }

    @Test("signed-in + auth-shaped error → signed out")
    func testAuthErrorMapsSignedOutEvenWhenAuthStateLagsBehind() {
        // Regression guard: backend says 401 before AuthService has
        // rotated to .expired. The screen should collapse to the
        // signed-out view rather than flash a generic error.
        let cases = [
            "notAuthenticated",
            "Not Authenticated",
            "HTTP 401",
            "unauthorized request",
            "403 Forbidden"
        ]
        for message in cases {
            let vm = PreferencesViewModel(
                authState: .signedIn(user: sampleUser),
                serviceState: .error(message)
            )
            #expect(vm.display() == .signedOut, "case: \(message)")
        }
    }

    // MARK: - Rollback overlay

    @Test("rollback overlay keeps content rendered + surfaces error banner")
    func testDisplayPreservingPreferencesSurfacesSaveError() {
        var prefs = MessagePreferences.default
        prefs.channels.sms = true

        let vm = PreferencesViewModel(
            authState: .signedIn(user: sampleUser),
            serviceState: .error("upstream 500")
        )
        let display = vm.displayPreservingPreferences(prefs, hasStored: true)
        guard case .content(let shown, let hasStored, let saveError) = display else {
            Issue.record("Expected .content overlay")
            return
        }
        #expect(shown == prefs)
        #expect(hasStored == true)
        #expect(saveError == "upstream 500")
    }

    @Test("rollback overlay still routes auth errors to signed-out")
    func testDisplayPreservingPreferencesRespectsAuthFailure() {
        let vm = PreferencesViewModel(
            authState: .signedIn(user: sampleUser),
            serviceState: .error("401 Unauthorized")
        )
        let display = vm.displayPreservingPreferences(.default, hasStored: true)
        #expect(display == .signedOut)
    }

    @Test("rollback overlay during restore → loading")
    func testDisplayPreservingPreferencesDuringRestore() {
        let vm = PreferencesViewModel(
            authState: .restoring,
            serviceState: .error("boom")
        )
        let display = vm.displayPreservingPreferences(.default, hasStored: true)
        #expect(display == .loading)
    }

    @Test("rollback overlay falls through to display() for non-error states")
    func testDisplayPreservingPreferencesFallsThroughForLoaded() {
        let vm = PreferencesViewModel(
            authState: .signedIn(user: sampleUser),
            serviceState: .loaded(.default, hasStored: true)
        )
        let display = vm.displayPreservingPreferences(.default, hasStored: false)
        // No error → fall through to the plain `.content` from display()
        // with hasStored taken from the service, not the overlay hint.
        guard case .content(_, let hasStored, let saveError) = display else {
            Issue.record("Expected .content")
            return
        }
        #expect(hasStored == true)
        #expect(saveError == nil)
    }
}

// MARK: - ConvexMessagePreferencesBackend auth error path

@Suite("ConvexMessagePreferencesBackend auth boundary")
struct ConvexMessagePreferencesBackendTests {

    @Test("missing token → notAuthenticated on every call")
    func testMissingTokenThrows() async throws {
        let backend = ConvexMessagePreferencesBackend(
            baseURL: URL(string: "https://test.local")!,
            tokenProvider: { nil }
        )

        await #expect(throws: MessagePreferencesError.self) {
            _ = try await backend.fetch()
        }
        await #expect(throws: MessagePreferencesError.self) {
            _ = try await backend.upsert(MessagePreferencesPatch(smsEnabled: true))
        }
        await #expect(throws: MessagePreferencesError.self) {
            _ = try await backend.optOutAll()
        }
        await #expect(throws: MessagePreferencesError.self) {
            _ = try await backend.resetToDefaults()
        }
    }

    @Test("empty-string token → notAuthenticated")
    func testEmptyTokenThrows() async {
        let backend = ConvexMessagePreferencesBackend(
            baseURL: URL(string: "https://test.local")!,
            tokenProvider: { "" }
        )

        do {
            _ = try await backend.fetch()
            Issue.record("Expected throw")
        } catch let error as MessagePreferencesError {
            guard case .notAuthenticated = error else {
                Issue.record("Expected notAuthenticated, got \(error)")
                return
            }
        } catch {
            Issue.record("Expected MessagePreferencesError, got \(type(of: error))")
        }
    }
}

// MARK: - Signed-out rollback scenario at the service level

@Suite("MessagePreferencesService signed-out surface", .serialized)
@MainActor
struct MessagePreferencesServiceSignedOutTests {

    private struct NotAuthBackend: MessagePreferencesBackend {
        func fetch() async throws -> (preferences: MessagePreferences, hasStored: Bool) {
            throw MessagePreferencesError.notAuthenticated
        }
        func upsert(_: MessagePreferencesPatch) async throws -> MessagePreferences {
            throw MessagePreferencesError.notAuthenticated
        }
        func optOutAll() async throws -> MessagePreferences {
            throw MessagePreferencesError.notAuthenticated
        }
        func resetToDefaults() async throws -> MessagePreferences {
            throw MessagePreferencesError.notAuthenticated
        }
    }

    @Test("service load() surfaces notAuthenticated as an error state the view-model treats as signed-out")
    func testLoadNotAuthenticatedRoutesToSignedOut() async {
        let service = MessagePreferencesService(backend: NotAuthBackend())
        await service.load()

        guard case .error(let message) = service.state else {
            Issue.record("Expected error, got \(service.state)")
            return
        }

        let vm = PreferencesViewModel(
            authState: .signedIn(user: AuthUser(
                id: "u1",
                email: "e@example.com",
                name: "E",
                role: .buyer
            )),
            serviceState: .error(message)
        )
        #expect(vm.display() == .signedOut)
    }

    @Test("service update() failure after load() keeps toggles + banner via rollback overlay")
    func testUpdateFailureRollsBackWithOverlay() async {
        // Build a backend that succeeds on fetch but fails on upsert.
        final class PartialBackend: MessagePreferencesBackend, @unchecked Sendable {
            var upsertShouldFail = true
            func fetch() async throws -> (preferences: MessagePreferences, hasStored: Bool) {
                var prefs = MessagePreferences.default
                prefs.channels.sms = true
                return (prefs, true)
            }
            func upsert(_: MessagePreferencesPatch) async throws -> MessagePreferences {
                if upsertShouldFail {
                    throw MessagePreferencesError.httpError(statusCode: 500)
                }
                return .default
            }
            func optOutAll() async throws -> MessagePreferences { .default }
            func resetToDefaults() async throws -> MessagePreferences { .default }
        }

        let backend = PartialBackend()
        let service = MessagePreferencesService(backend: backend)
        await service.load()

        // Snapshot what load produced — this is what the view would cache.
        let loadedPrefs = service.preferences
        let loadedHasStored = service.hasStoredPreferences

        await service.update(MessagePreferencesPatch(marketingEnabled: true))

        // The service rolls preferences back. The overlay should keep
        // rendering the post-load toggles + surface the save error.
        #expect(service.preferences == loadedPrefs)

        guard case .error(let message) = service.state else {
            Issue.record("Expected error post-rollback")
            return
        }

        let vm = PreferencesViewModel(
            authState: .signedIn(user: AuthUser(
                id: "u1",
                email: "e@example.com",
                name: "E",
                role: .buyer
            )),
            serviceState: .error(message)
        )
        let display = vm.displayPreservingPreferences(loadedPrefs, hasStored: loadedHasStored)
        guard case .content(let shown, let hasStored, let saveError) = display else {
            Issue.record("Expected overlay .content, got \(display)")
            return
        }
        #expect(shown == loadedPrefs)
        #expect(hasStored == true)
        #expect(saveError != nil)
    }
}
