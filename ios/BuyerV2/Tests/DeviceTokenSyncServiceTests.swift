import Foundation
import Testing

@testable import BuyerV2

// MARK: - MockTokenSyncBackend

final class MockTokenSyncBackend: TokenSyncBackend, @unchecked Sendable {

    // Configurable responses
    var registerResult: Result<Void, Error> = .success(())
    var invalidateResult: Result<Void, Error> = .success(())
    var cleanupResult: Result<Void, Error> = .success(())

    // Call tracking
    var registerCallCount = 0
    var invalidateCallCount = 0
    var cleanupCallCount = 0

    var lastRegistration: DeviceTokenRegistration?
    var lastInvalidatedToken: String?
    var lastCleanupDeviceId: String?
    var lastCleanupToken: String?

    func register(_ registration: DeviceTokenRegistration) async throws {
        registerCallCount += 1
        lastRegistration = registration
        try registerResult.get()
    }

    func invalidate(token: String) async throws {
        invalidateCallCount += 1
        lastInvalidatedToken = token
        try invalidateResult.get()
    }

    func cleanup(deviceId: String?, token: String?) async throws {
        cleanupCallCount += 1
        lastCleanupDeviceId = deviceId
        lastCleanupToken = token
        try cleanupResult.get()
    }
}

// MARK: - Test Fixtures

private struct MockTokenSyncError: Error, Equatable {
    let message: String
}

private func makeRegistration(
    token: String = "apns-token-abc",
    platform: TokenPlatform = .ios,
    environment: TokenEnvironment = .development,
    deviceId: String? = "device-123",
    appVersion: String? = "1.0.0",
    osVersion: String? = "17.4"
) -> DeviceTokenRegistration {
    DeviceTokenRegistration(
        token: token,
        platform: platform,
        environment: environment,
        deviceId: deviceId,
        appVersion: appVersion,
        osVersion: osVersion
    )
}

// MARK: - DeviceTokenSyncService Tests

@Suite("DeviceTokenSyncService state transitions", .serialized)
@MainActor
struct DeviceTokenSyncServiceTests {

    // MARK: - Initial State

    @Test("Initial state is .idle and currentToken is nil")
    func testInitialState() {
        let backend = MockTokenSyncBackend()
        let service = DeviceTokenSyncService(backend: backend)

        guard case .idle = service.state else {
            Issue.record("Expected .idle, got \(service.state)")
            return
        }
        #expect(service.currentToken == nil)
        #expect(backend.registerCallCount == 0)
        #expect(backend.invalidateCallCount == 0)
        #expect(backend.cleanupCallCount == 0)
    }

    // MARK: - First Registration Success

    @Test("registerDeviceToken success transitions to .registered and sets currentToken")
    func testFirstRegistrationSuccess() async {
        let backend = MockTokenSyncBackend()
        backend.registerResult = .success(())

        let service = DeviceTokenSyncService(backend: backend)
        let registration = makeRegistration(token: "token-1")

        await service.registerDeviceToken(registration)

        guard case .registered(let token) = service.state else {
            Issue.record("Expected .registered, got \(service.state)")
            return
        }
        #expect(token == "token-1")
        #expect(service.currentToken == "token-1")
        #expect(backend.registerCallCount == 1)
        #expect(backend.lastRegistration == registration)
    }

    // MARK: - Registration Failure

    @Test("registerDeviceToken failure transitions to .error and leaves currentToken nil")
    func testRegistrationFailure() async {
        let backend = MockTokenSyncBackend()
        backend.registerResult = .failure(MockTokenSyncError(message: "network down"))

        let service = DeviceTokenSyncService(backend: backend)

        await service.registerDeviceToken(makeRegistration(token: "token-1"))

        guard case .error(let message) = service.state else {
            Issue.record("Expected .error, got \(service.state)")
            return
        }
        #expect(!message.isEmpty)
        #expect(service.currentToken == nil)
        #expect(backend.registerCallCount == 1)
    }

    // MARK: - Same Token Short-Circuit

    @Test("registerDeviceToken called twice with same token only hits backend once")
    func testSameTokenShortCircuit() async {
        let backend = MockTokenSyncBackend()
        backend.registerResult = .success(())

        let service = DeviceTokenSyncService(backend: backend)
        let registration = makeRegistration(token: "token-1")

        await service.registerDeviceToken(registration)
        #expect(backend.registerCallCount == 1)

        // Second call with the same token — should short-circuit
        await service.registerDeviceToken(registration)
        #expect(backend.registerCallCount == 1)

        guard case .registered(let token) = service.state else {
            Issue.record("Expected .registered, got \(service.state)")
            return
        }
        #expect(token == "token-1")
        #expect(service.currentToken == "token-1")
    }

    // MARK: - Token Change Replaces

    @Test("registerDeviceToken with different token replaces the previous one")
    func testTokenChangeReplaces() async {
        let backend = MockTokenSyncBackend()
        backend.registerResult = .success(())

        let service = DeviceTokenSyncService(backend: backend)

        await service.registerDeviceToken(makeRegistration(token: "token-1"))
        #expect(backend.registerCallCount == 1)
        #expect(service.currentToken == "token-1")

        // New token — should re-register
        await service.registerDeviceToken(makeRegistration(token: "token-2"))
        #expect(backend.registerCallCount == 2)
        #expect(service.currentToken == "token-2")

        guard case .registered(let token) = service.state else {
            Issue.record("Expected .registered, got \(service.state)")
            return
        }
        #expect(token == "token-2")
        #expect(backend.lastRegistration?.token == "token-2")
    }

    // MARK: - Handle Invalid Token

    @Test("handleInvalidToken calls backend.invalidate and transitions to .invalidated")
    func testHandleInvalidToken() async {
        let backend = MockTokenSyncBackend()
        backend.registerResult = .success(())
        backend.invalidateResult = .success(())

        let service = DeviceTokenSyncService(backend: backend)
        await service.registerDeviceToken(makeRegistration(token: "token-1"))

        // Precondition
        guard case .registered = service.state else {
            Issue.record("Pre-condition failed: expected .registered")
            return
        }

        await service.handleInvalidToken()

        guard case .invalidated = service.state else {
            Issue.record("Expected .invalidated, got \(service.state)")
            return
        }
        #expect(service.currentToken == nil)
        #expect(backend.invalidateCallCount == 1)
        #expect(backend.lastInvalidatedToken == "token-1")
    }

    // MARK: - Cleanup On Sign-Out Success

    @Test("cleanupOnSignOut success resets state to .idle and calls backend.cleanup with current device scope")
    func testCleanupOnSignOutSuccess() async {
        let backend = MockTokenSyncBackend()
        backend.registerResult = .success(())
        backend.cleanupResult = .success(())

        let service = DeviceTokenSyncService(backend: backend)
        await service.registerDeviceToken(
            makeRegistration(token: "token-1", deviceId: "device-1")
        )

        // Precondition
        guard case .registered = service.state else {
            Issue.record("Pre-condition failed: expected .registered")
            return
        }
        #expect(service.currentToken == "token-1")
        #expect(service.currentDeviceId == "device-1")

        await service.cleanupOnSignOut()

        guard case .idle = service.state else {
            Issue.record("Expected .idle, got \(service.state)")
            return
        }
        #expect(service.currentToken == nil)
        #expect(service.currentDeviceId == nil)
        #expect(backend.cleanupCallCount == 1)
        // Cleanup must be scoped to the CURRENT device, not the whole user
        #expect(backend.lastCleanupDeviceId == "device-1")
        #expect(backend.lastCleanupToken == "token-1")
    }

    // MARK: - Cleanup On Sign-Out Failure Still Resets

    @Test("cleanupOnSignOut failure still resets local state to .idle")
    func testCleanupOnSignOutFailureStillResets() async {
        let backend = MockTokenSyncBackend()
        backend.registerResult = .success(())
        backend.cleanupResult = .failure(MockTokenSyncError(message: "backend boom"))

        let service = DeviceTokenSyncService(backend: backend)
        await service.registerDeviceToken(makeRegistration(token: "token-1"))

        // Precondition
        guard case .registered = service.state else {
            Issue.record("Pre-condition failed: expected .registered")
            return
        }
        #expect(service.currentToken == "token-1")

        await service.cleanupOnSignOut()

        // Local state must be cleared regardless of backend outcome
        guard case .idle = service.state else {
            Issue.record("Expected .idle after failed cleanup, got \(service.state)")
            return
        }
        #expect(service.currentToken == nil)
        #expect(backend.cleanupCallCount == 1)
    }
}
