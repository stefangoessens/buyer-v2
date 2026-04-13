import Foundation
import Testing

@testable import BuyerV2

@Suite("PreferencesViewModel display mapping")
struct PreferencesViewModelDisplayTests {

    private let sampleUser = AuthUser(
        id: "user_1",
        email: "buyer@example.com",
        name: "Buyer One",
        role: .buyer
    )

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
                serviceState: serviceState,
                saveState: .idle
            )
            #expect(vm.display() == .signedOut)
        }
    }

    @Test("expired auth maps to signedOut")
    func testExpiredAuthMapsSignedOut() {
        let vm = PreferencesViewModel(
            authState: .expired,
            serviceState: .loaded(.default, hasStored: true),
            saveState: .idle
        )
        #expect(vm.display() == .signedOut)
    }

    @Test("restoring auth keeps the screen in loading")
    func testRestoringAuthKeepsLoading() {
        let vm = PreferencesViewModel(
            authState: .restoring,
            serviceState: .loaded(.default, hasStored: true),
            saveState: .idle
        )
        #expect(vm.display() == .loading)
    }

    @Test("signed-in + idle service -> loading")
    func testSignedInIdleMapsLoading() {
        let vm = PreferencesViewModel(
            authState: .signedIn(user: sampleUser),
            serviceState: .idle,
            saveState: .idle
        )
        #expect(vm.display() == .loading)
    }

    @Test("signed-in + loading service -> loading")
    func testSignedInLoadingMapsLoading() {
        let vm = PreferencesViewModel(
            authState: .signedIn(user: sampleUser),
            serviceState: .loading,
            saveState: .idle
        )
        #expect(vm.display() == .loading)
    }

    @Test("loaded first-time user keeps hasStored=false")
    func testLoadedFirstTimeUser() {
        let vm = PreferencesViewModel(
            authState: .signedIn(user: sampleUser),
            serviceState: .loaded(.default, hasStored: false),
            saveState: .idle
        )
        guard case .content(let prefs, let hasStored, let saveState) = vm.display() else {
            Issue.record("Expected .content")
            return
        }
        #expect(prefs == .default)
        #expect(hasStored == false)
        #expect(saveState == .idle)
    }

    @Test("loaded state preserves explicit saving status")
    func testLoadedSavingState() {
        var prefs = MessagePreferences.default
        prefs.channels.sms = true

        let vm = PreferencesViewModel(
            authState: .signedIn(user: sampleUser),
            serviceState: .loaded(prefs, hasStored: true),
            saveState: .saving
        )
        guard case .content(let shown, let hasStored, let saveState) = vm.display() else {
            Issue.record("Expected .content")
            return
        }
        #expect(shown == prefs)
        #expect(hasStored == true)
        #expect(saveState == .saving)
    }

    @Test("loaded state preserves save failure banner state")
    func testLoadedSaveErrorState() {
        let vm = PreferencesViewModel(
            authState: .signedIn(user: sampleUser),
            serviceState: .loaded(.default, hasStored: false),
            saveState: .error("upstream 500")
        )
        guard case .content(_, let hasStored, let saveState) = vm.display() else {
            Issue.record("Expected .content")
            return
        }
        #expect(hasStored == false)
        #expect(saveState == .error("upstream 500"))
    }

    @Test("generic load error maps to error screen")
    func testGenericErrorMapsError() {
        let vm = PreferencesViewModel(
            authState: .signedIn(user: sampleUser),
            serviceState: .error("offline"),
            saveState: .idle
        )
        #expect(vm.display() == .error("offline"))
    }

    @Test("auth-shaped load error maps to signed out")
    func testAuthErrorMapsSignedOutEvenWhenAuthStateLagsBehind() {
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
                serviceState: .error(message),
                saveState: .idle
            )
            #expect(vm.display() == .signedOut, "case: \(message)")
        }
    }
}

@Suite("ConvexMessagePreferencesBackend auth boundary")
struct ConvexMessagePreferencesBackendTests {

    @Test("missing token -> notAuthenticated on every call")
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

    @Test("empty-string token -> notAuthenticated")
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

    private let signedInUser = AuthUser(
        id: "u1",
        email: "e@example.com",
        name: "E",
        role: .buyer
    )

    @Test("service load() surfaces notAuthenticated as an error state the view-model treats as signed-out")
    func testLoadNotAuthenticatedRoutesToSignedOut() async {
        let service = MessagePreferencesService(backend: NotAuthBackend())
        await service.load()

        guard case .error(let message) = service.state else {
            Issue.record("Expected error, got \(service.state)")
            return
        }

        let vm = PreferencesViewModel(
            authState: .signedIn(user: signedInUser),
            serviceState: .error(message),
            saveState: service.saveState
        )
        #expect(vm.display() == .signedOut)
    }

    @Test("service update() failure keeps committed toggles on-screen with an explicit save error")
    func testUpdateFailureRollsBackIntoContent() async {
        final class PartialBackend: MessagePreferencesBackend, @unchecked Sendable {
            func fetch() async throws -> (preferences: MessagePreferences, hasStored: Bool) {
                var prefs = MessagePreferences.default
                prefs.channels.sms = true
                return (prefs, true)
            }
            func upsert(_: MessagePreferencesPatch) async throws -> MessagePreferences {
                throw MessagePreferencesError.httpError(statusCode: 500)
            }
            func optOutAll() async throws -> MessagePreferences { .default }
            func resetToDefaults() async throws -> MessagePreferences { .default }
        }

        let service = MessagePreferencesService(backend: PartialBackend())
        await service.load()

        let loadedPrefs = service.preferences
        await service.update(MessagePreferencesPatch(marketingEnabled: true))

        #expect(service.preferences == loadedPrefs)
        #expect(service.saveState == .error("The preference service returned HTTP 500."))

        let vm = PreferencesViewModel(
            authState: .signedIn(user: signedInUser),
            serviceState: service.state,
            saveState: service.saveState
        )

        guard case .content(let shown, let hasStored, let saveState) = vm.display() else {
            Issue.record("Expected .content after rollback")
            return
        }
        #expect(shown == loadedPrefs)
        #expect(hasStored == true)
        #expect(saveState == .error("The preference service returned HTTP 500."))
    }
}
