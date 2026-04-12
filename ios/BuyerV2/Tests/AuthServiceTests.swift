import Foundation
import Testing

@testable import BuyerV2

// MARK: - MockAuthProvider

final class MockAuthProvider: AuthProvider, @unchecked Sendable {

    // Configurable responses
    var authenticateResult: Result<AuthTokens, Error> = .failure(AuthError.unauthorized)
    var refreshResult: Result<AuthTokens, Error> = .failure(AuthError.unauthorized)
    var validateResult: Result<AuthUser, Error> = .failure(AuthError.unauthorized)

    // Queue of validate results — if non-empty, dequeued in order; otherwise falls back to validateResult
    var validateResultQueue: [Result<AuthUser, Error>] = []

    // Call tracking
    var authenticateCallCount = 0
    var refreshCallCount = 0
    var validateCallCount = 0
    var lastValidatedToken: String?

    func authenticate(email: String, password: String) async throws -> AuthTokens {
        authenticateCallCount += 1
        return try authenticateResult.get()
    }

    func refreshToken(_ refreshToken: String) async throws -> AuthTokens {
        refreshCallCount += 1
        return try refreshResult.get()
    }

    func validateToken(_ token: String) async throws -> AuthUser {
        validateCallCount += 1
        lastValidatedToken = token
        if !validateResultQueue.isEmpty {
            return try validateResultQueue.removeFirst().get()
        }
        return try validateResult.get()
    }
}

// MARK: - Test Helpers

private let testUser = AuthUser(
    id: "user-123",
    email: "buyer@example.com",
    name: "Test Buyer",
    role: .buyer
)

private let testTokens = AuthTokens(
    accessToken: "access-token-abc",
    refreshToken: "refresh-token-xyz",
    expiresAt: Date(timeIntervalSinceNow: 3600)
)

// MARK: - AuthService Tests

@Suite("AuthService session state transitions", .serialized)
@MainActor
struct AuthServiceTests {

    // MARK: - Initial State

    @Test("Initial state is .restoring")
    func testInitialState() {
        let provider = MockAuthProvider()
        let service = AuthService(provider: provider)

        guard case .restoring = service.state else {
            Issue.record("Expected .restoring, got \(service.state)")
            return
        }
    }

    // MARK: - Initialize

    @Test("initialize() transitions to .signedOut when keychain is empty")
    func testInitializeWithNoStoredToken() async {
        let provider = MockAuthProvider()
        let service = AuthService(provider: provider)

        await service.initialize()

        guard case .signedOut = service.state else {
            Issue.record("Expected .signedOut, got \(service.state)")
            return
        }
        #expect(provider.validateCallCount == 0)
    }

    @Test("initialize() transitions to .signedIn when valid token in keychain")
    func testInitializeWithValidToken() async {
        let provider = MockAuthProvider()
        provider.authenticateResult = .success(testTokens)
        provider.validateResult = .success(testUser)
        let service = AuthService(provider: provider)

        // Sign in first to populate the keychain
        try? await service.signIn(email: "buyer@example.com", password: "pass")

        // Reset to restoring to simulate a fresh launch
        // Re-create service with same provider (keychain persists in-process)
        let freshService = AuthService(provider: provider)
        provider.validateCallCount = 0

        await freshService.initialize()

        guard case .signedIn(let user) = freshService.state else {
            Issue.record("Expected .signedIn, got \(freshService.state)")
            return
        }
        #expect(user == testUser)
        #expect(provider.validateCallCount == 1)
    }

    @Test("initialize() attempts refresh when token validation fails, then signs out if refresh also fails")
    func testInitializeWithInvalidToken() async {
        let provider = MockAuthProvider()
        provider.authenticateResult = .success(testTokens)
        provider.validateResult = .success(testUser)
        let service = AuthService(provider: provider)

        // Sign in to populate keychain with both access + refresh tokens
        try? await service.signIn(email: "buyer@example.com", password: "pass")

        // Make validation fail AND refresh fail for the next service
        provider.validateResult = .failure(AuthError.unauthorized)
        provider.refreshResult = .failure(AuthError.unauthorized)
        provider.refreshCallCount = 0
        let freshService = AuthService(provider: provider)

        await freshService.initialize()

        // Should have attempted refresh before falling back to signedOut
        #expect(provider.refreshCallCount == 1)
        guard case .signedOut = freshService.state else {
            Issue.record("Expected .signedOut, got \(freshService.state)")
            return
        }
    }

    @Test("initialize() refreshes successfully when access token expired but refresh token valid")
    func testInitializeWithExpiredAccessButValidRefresh() async {
        let provider = MockAuthProvider()
        provider.authenticateResult = .success(testTokens)
        provider.validateResult = .success(testUser)
        let service = AuthService(provider: provider)

        // Sign in to populate keychain with both tokens
        try? await service.signIn(email: "buyer@example.com", password: "pass")

        // Configure for fresh service: first validate fails (expired access token),
        // then refresh succeeds, then second validate succeeds (new token is good)
        let refreshedTokens = AuthTokens(
            accessToken: "refreshed-access",
            refreshToken: "refreshed-refresh",
            expiresAt: Date(timeIntervalSinceNow: 7200)
        )
        provider.refreshResult = .success(refreshedTokens)
        provider.validateResultQueue = [
            .failure(AuthError.unauthorized),  // first call: old access token fails
            .success(testUser),                // second call: new access token succeeds
        ]
        provider.validateCallCount = 0
        provider.refreshCallCount = 0

        let freshService = AuthService(provider: provider)
        await freshService.initialize()

        guard case .signedIn(let user) = freshService.state else {
            Issue.record("Expected .signedIn after refresh, got \(freshService.state)")
            return
        }
        #expect(user == testUser)
        #expect(provider.refreshCallCount == 1)
        #expect(provider.validateCallCount == 2)
    }

    // MARK: - Sign In

    @Test("signIn() stores tokens and transitions to .signedIn with correct user")
    func testSignInSuccess() async throws {
        let provider = MockAuthProvider()
        provider.authenticateResult = .success(testTokens)
        provider.validateResult = .success(testUser)
        let service = AuthService(provider: provider)

        try await service.signIn(email: "buyer@example.com", password: "pass")

        guard case .signedIn(let user) = service.state else {
            Issue.record("Expected .signedIn, got \(service.state)")
            return
        }
        #expect(user == testUser)
        #expect(user.email == "buyer@example.com")
        #expect(user.role == .buyer)
        #expect(provider.authenticateCallCount == 1)
        #expect(provider.validateCallCount == 1)
        #expect(provider.lastValidatedToken == "access-token-abc")
    }

    @Test("signIn() throws on auth failure")
    func testSignInFailure() async {
        let provider = MockAuthProvider()
        provider.authenticateResult = .failure(AuthError.unauthorized)
        let service = AuthService(provider: provider)

        // Set a known pre-state
        await service.initialize() // goes to .signedOut since keychain is empty

        do {
            try await service.signIn(email: "bad@example.com", password: "wrong")
            Issue.record("Expected signIn to throw")
        } catch {
            // Verify error type
            guard let authError = error as? AuthError else {
                Issue.record("Expected AuthError, got \(error)")
                return
            }
            guard case .unauthorized = authError else {
                Issue.record("Expected .unauthorized, got \(authError)")
                return
            }
        }

        // State should not have changed to signedIn
        guard case .signedOut = service.state else {
            Issue.record("Expected .signedOut after failed signIn, got \(service.state)")
            return
        }
    }

    // MARK: - Sign Out

    @Test("signOut() clears keychain and transitions to .signedOut")
    func testSignOut() async throws {
        let provider = MockAuthProvider()
        provider.authenticateResult = .success(testTokens)
        provider.validateResult = .success(testUser)
        let service = AuthService(provider: provider)

        // Sign in first
        try await service.signIn(email: "buyer@example.com", password: "pass")
        guard case .signedIn = service.state else {
            Issue.record("Pre-condition failed: expected .signedIn")
            return
        }

        await service.signOut()

        guard case .signedOut = service.state else {
            Issue.record("Expected .signedOut after signOut, got \(service.state)")
            return
        }

        // Verify keychain is cleared: a fresh service should not be able to restore
        let freshService = AuthService(provider: provider)
        await freshService.initialize()
        guard case .signedOut = freshService.state else {
            Issue.record("Expected .signedOut on fresh init after signOut, got \(freshService.state)")
            return
        }
    }

    // MARK: - Token Expired

    @Test("handleTokenExpired() transitions to .expired")
    func testHandleTokenExpired() async throws {
        let provider = MockAuthProvider()
        provider.authenticateResult = .success(testTokens)
        provider.validateResult = .success(testUser)
        let service = AuthService(provider: provider)

        // Sign in first
        try await service.signIn(email: "buyer@example.com", password: "pass")

        service.handleTokenExpired()

        guard case .expired = service.state else {
            Issue.record("Expected .expired, got \(service.state)")
            return
        }
    }

    // MARK: - Restore Session

    @Test("restoreSession() refreshes token and transitions to .signedIn")
    func testRestoreSessionSuccess() async throws {
        let provider = MockAuthProvider()
        provider.authenticateResult = .success(testTokens)
        provider.validateResult = .success(testUser)
        let service = AuthService(provider: provider)

        // Sign in to populate keychain with refresh token
        try await service.signIn(email: "buyer@example.com", password: "pass")

        // Simulate expired state
        service.handleTokenExpired()
        guard case .expired = service.state else {
            Issue.record("Pre-condition failed: expected .expired")
            return
        }

        // Configure refresh to succeed with new tokens
        let refreshedTokens = AuthTokens(
            accessToken: "new-access-token",
            refreshToken: "new-refresh-token",
            expiresAt: Date(timeIntervalSinceNow: 7200)
        )
        provider.refreshResult = .success(refreshedTokens)
        provider.validateCallCount = 0
        provider.refreshCallCount = 0

        await service.restoreSession()

        guard case .signedIn(let user) = service.state else {
            Issue.record("Expected .signedIn after restore, got \(service.state)")
            return
        }
        #expect(user == testUser)
        #expect(provider.refreshCallCount == 1)
        #expect(provider.validateCallCount == 1)
        #expect(provider.lastValidatedToken == "new-access-token")
    }

    @Test("restoreSession() transitions to .signedOut when refresh fails")
    func testRestoreSessionFailure() async throws {
        let provider = MockAuthProvider()
        provider.authenticateResult = .success(testTokens)
        provider.validateResult = .success(testUser)
        let service = AuthService(provider: provider)

        // Sign in to populate keychain
        try await service.signIn(email: "buyer@example.com", password: "pass")

        // Simulate expired and make refresh fail
        service.handleTokenExpired()
        provider.refreshResult = .failure(AuthError.unauthorized)

        await service.restoreSession()

        guard case .signedOut = service.state else {
            Issue.record("Expected .signedOut after failed restore, got \(service.state)")
            return
        }
    }

    // MARK: - isAuthenticated

    @Test("isAuthenticated returns true only for .signedIn state")
    func testIsAuthenticated() async throws {
        let provider = MockAuthProvider()
        provider.authenticateResult = .success(testTokens)
        provider.validateResult = .success(testUser)
        let service = AuthService(provider: provider)

        // .restoring -> false
        #expect(!service.isAuthenticated)

        // .signedOut -> false
        await service.initialize()
        #expect(!service.isAuthenticated)

        // .signedIn -> true
        try await service.signIn(email: "buyer@example.com", password: "pass")
        #expect(service.isAuthenticated)

        // .expired -> false
        service.handleTokenExpired()
        #expect(!service.isAuthenticated)

        // back to .signedOut -> false
        await service.signOut()
        #expect(!service.isAuthenticated)
    }
}
