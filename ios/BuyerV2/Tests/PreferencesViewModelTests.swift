import Foundation
import Testing
import UserNotifications

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
            .error("something broke"),
        ] {
            let vm = PreferencesViewModel(
                authState: .signedOut,
                serviceState: serviceState,
                saveState: .idle
            )
            #expect(vm.display() == .signedOut)
        }
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

    @Test("loaded state preserves save status")
    func testLoadedStatePreservesSaveStatus() {
        var prefs = MessagePreferences.default
        prefs = prefs.withPreference(category: .offers, channel: .email, enabled: false)

        let vm = PreferencesViewModel(
            authState: .signedIn(user: sampleUser),
            serviceState: .loaded(prefs, hasStored: true),
            saveState: .saving
        )

        guard case .content(let shown, let hasStored, let saveState) = vm.display() else {
            Issue.record("Expected content display")
            return
        }

        #expect(shown == prefs)
        #expect(hasStored == true)
        #expect(saveState == .saving)
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
    func testAuthErrorMapsSignedOut() {
        for message in ["notAuthenticated", "Not Authenticated", "HTTP 401", "403 Forbidden"] {
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
struct ConvexMessagePreferencesBackendAuthTests {

    @Test("missing token -> notAuthenticated on every call")
    func testMissingTokenThrows() async {
        let backend = ConvexMessagePreferencesBackend(
            baseURL: URL(string: "https://test.local")!,
            tokenProvider: { nil }
        )

        await #expect(throws: MessagePreferencesError.self) {
            _ = try await backend.fetch()
        }
        await #expect(throws: MessagePreferencesError.self) {
            _ = try await backend.upsert(.default)
        }
    }

    @Test("empty token -> notAuthenticated")
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

@Suite("Push permission state mapping")
struct PushPermissionStateTests {

    @Test("UNAuthorizationStatus maps to expected push permission state")
    func testPermissionMapping() {
        #expect(PushPermissionState.from(.notDetermined) == .unknown)
        #expect(PushPermissionState.from(.denied) == .denied)
        #expect(PushPermissionState.from(.authorized) == .allowed)
        #expect(PushPermissionState.from(.provisional) == .allowed)
        #expect(PushPermissionState.from(.ephemeral) == .allowed)
    }
}

@Suite("MessagePreferencesService signed-out surface", .serialized)
@MainActor
struct MessagePreferencesServiceSignedOutTests {

    private struct NotAuthBackend: MessagePreferencesBackend {
        func fetch() async throws -> MessagePreferencesSnapshot {
            throw MessagePreferencesError.notAuthenticated
        }

        func upsert(_: MessagePreferences) async throws -> MessagePreferences {
            throw MessagePreferencesError.notAuthenticated
        }
    }

    private let signedInUser = AuthUser(
        id: "u1",
        email: "e@example.com",
        name: "E",
        role: .buyer
    )

    @Test("service load routes auth failures to the signed-out surface")
    func testLoadNotAuthenticatedRoutesToSignedOut() async {
        let service = MessagePreferencesService(backend: NotAuthBackend())
        await service.load()

        guard case .error(let message) = service.state else {
            Issue.record("Expected error state")
            return
        }

        let vm = PreferencesViewModel(
            authState: .signedIn(user: signedInUser),
            serviceState: .error(message),
            saveState: service.saveState
        )
        #expect(vm.display() == .signedOut)
    }
}
