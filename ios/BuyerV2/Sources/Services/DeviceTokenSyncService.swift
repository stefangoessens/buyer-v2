import Foundation
import Observation

// MARK: - Models

enum TokenPlatform: String, Sendable, Codable {
    case ios
    case android
}

enum TokenEnvironment: String, Sendable, Codable {
    case development
    case production
}

struct DeviceTokenRegistration: Sendable, Codable, Equatable {
    let token: String
    let platform: TokenPlatform
    let environment: TokenEnvironment
    let deviceId: String?
    let appVersion: String?
    let osVersion: String?

    init(
        token: String,
        platform: TokenPlatform,
        environment: TokenEnvironment,
        deviceId: String? = nil,
        appVersion: String? = nil,
        osVersion: String? = nil
    ) {
        self.token = token
        self.platform = platform
        self.environment = environment
        self.deviceId = deviceId
        self.appVersion = appVersion
        self.osVersion = osVersion
    }
}

// MARK: - DeviceTokenSyncState

enum DeviceTokenSyncState: Sendable, Equatable {
    case idle
    case registering
    case registered(token: String)
    case invalidated
    case error(String)
}

// MARK: - DeviceTokenSyncError

enum DeviceTokenSyncError: Error {
    case notAuthenticated
    case invalidResponse
    case httpError(statusCode: Int)
}

// MARK: - TokenSyncBackend Protocol

protocol TokenSyncBackend: Sendable {
    func register(_ registration: DeviceTokenRegistration) async throws
    func invalidate(token: String) async throws
    /// Delete token rows for the current device only — scoped by
    /// deviceId (preferred) or token. See KIN-826 codex P1 fix.
    func cleanup(deviceId: String?, token: String?) async throws
}

// MARK: - AccessTokenProvider

/// Returns the current access token for authenticating backend calls,
/// or nil if the user is signed out / session is unrecoverable.
typealias AccessTokenProvider = @Sendable () async -> String?

// MARK: - ConvexTokenSyncBackend

final class ConvexTokenSyncBackend: TokenSyncBackend, Sendable {

    private let baseURL: URL
    private let tokenProvider: AccessTokenProvider

    init(
        baseURL: URL = URL(string: "https://api.buyerv2.com")!,
        tokenProvider: @escaping AccessTokenProvider = { nil }
    ) {
        self.baseURL = baseURL
        self.tokenProvider = tokenProvider
    }

    func register(_ registration: DeviceTokenRegistration) async throws {
        var request = try await authenticatedRequest(path: "/deviceTokens/register")
        request.httpBody = try JSONEncoder().encode(registration)

        let (_, response) = try await URLSession.shared.data(for: request)
        try validateHTTPResponse(response)
    }

    func invalidate(token: String) async throws {
        var request = try await authenticatedRequest(path: "/deviceTokens/invalidate")
        let body: [String: String] = ["token": token]
        request.httpBody = try JSONEncoder().encode(body)

        let (_, response) = try await URLSession.shared.data(for: request)
        try validateHTTPResponse(response)
    }

    func cleanup(deviceId: String?, token: String?) async throws {
        var request = try await authenticatedRequest(path: "/deviceTokens/cleanup")
        // Scope the cleanup to the current device. At least one identifier
        // must be present — the backend no-ops if both are nil.
        var body: [String: String] = [:]
        if let deviceId { body["deviceId"] = deviceId }
        if let token { body["token"] = token }
        request.httpBody = try JSONEncoder().encode(body)

        let (_, response) = try await URLSession.shared.data(for: request)
        try validateHTTPResponse(response)
    }

    // MARK: - Private

    /// Build a POST request with the standard JSON content type and the
    /// current access token attached as a Bearer token. Throws
    /// `.notAuthenticated` if no token is available — we never fire an
    /// unauthenticated token-sync call.
    private func authenticatedRequest(path: String) async throws -> URLRequest {
        guard let accessToken = await tokenProvider() else {
            throw DeviceTokenSyncError.notAuthenticated
        }
        let url = baseURL.appendingPathComponent(path)
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        return request
    }

    private func validateHTTPResponse(_ response: URLResponse) throws {
        guard let http = response as? HTTPURLResponse else {
            throw DeviceTokenSyncError.invalidResponse
        }
        guard (200...299).contains(http.statusCode) else {
            if http.statusCode == 401 {
                throw DeviceTokenSyncError.notAuthenticated
            }
            throw DeviceTokenSyncError.httpError(statusCode: http.statusCode)
        }
    }
}

// MARK: - DeviceTokenSyncService

@MainActor
@Observable
final class DeviceTokenSyncService {

    private(set) var state: DeviceTokenSyncState = .idle
    private(set) var currentToken: String?
    private(set) var currentDeviceId: String?

    private let backend: TokenSyncBackend

    init(backend: TokenSyncBackend = ConvexTokenSyncBackend()) {
        self.backend = backend
    }

    // MARK: - Public

    /// Register a new device token with the backend. If the token matches
    /// `currentToken` and the service is already in the `.registered` state,
    /// this is a no-op. Otherwise the backend is called and state is updated.
    func registerDeviceToken(_ registration: DeviceTokenRegistration) async {
        // Short-circuit: already registered with this exact token
        if registration.token == currentToken,
           case .registered(let registeredToken) = state,
           registeredToken == registration.token {
            return
        }

        state = .registering

        do {
            try await backend.register(registration)
            currentToken = registration.token
            currentDeviceId = registration.deviceId
            state = .registered(token: registration.token)
        } catch {
            state = .error(error.localizedDescription)
        }
    }

    /// Mark the current token as invalidated. Called when APNS reports the
    /// token is no longer valid. Always transitions state to `.invalidated`
    /// and clears `currentToken`, even if the backend call fails.
    func handleInvalidToken() async {
        let tokenToInvalidate = currentToken ?? ""

        defer {
            currentToken = nil
            currentDeviceId = nil
            state = .invalidated
        }

        do {
            try await backend.invalidate(token: tokenToInvalidate)
        } catch {
            // Local state is cleared via defer regardless of backend outcome.
        }
    }

    /// Clean up the CURRENT device's token row on sign-out. Scoped by
    /// deviceId (preferred) or token so other still-signed-in devices on
    /// the same account keep their push registrations. Local state is
    /// always reset to `.idle` even if the backend call fails — we don't
    /// want to leave stale sync state behind after sign-out.
    func cleanupOnSignOut() async {
        let deviceIdToCleanup = currentDeviceId
        let tokenToCleanup = currentToken

        defer {
            currentToken = nil
            currentDeviceId = nil
            state = .idle
        }

        do {
            try await backend.cleanup(
                deviceId: deviceIdToCleanup,
                token: tokenToCleanup
            )
        } catch {
            // Local state is cleared via defer regardless of backend outcome.
        }
    }
}
