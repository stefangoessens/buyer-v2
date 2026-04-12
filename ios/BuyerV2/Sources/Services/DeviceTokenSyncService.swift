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
    func cleanup() async throws
}

// MARK: - ConvexTokenSyncBackend

final class ConvexTokenSyncBackend: TokenSyncBackend, Sendable {

    private let baseURL: URL

    init(baseURL: URL = URL(string: "https://api.buyerv2.com")!) {
        self.baseURL = baseURL
    }

    func register(_ registration: DeviceTokenRegistration) async throws {
        let url = baseURL.appendingPathComponent("/deviceTokens/register")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(registration)

        let (_, response) = try await URLSession.shared.data(for: request)
        try validateHTTPResponse(response)
    }

    func invalidate(token: String) async throws {
        let url = baseURL.appendingPathComponent("/deviceTokens/invalidate")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: String] = ["token": token]
        request.httpBody = try JSONEncoder().encode(body)

        let (_, response) = try await URLSession.shared.data(for: request)
        try validateHTTPResponse(response)
    }

    func cleanup() async throws {
        let url = baseURL.appendingPathComponent("/deviceTokens/cleanup")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let (_, response) = try await URLSession.shared.data(for: request)
        try validateHTTPResponse(response)
    }

    // MARK: - Private

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
            state = .invalidated
        }

        do {
            try await backend.invalidate(token: tokenToInvalidate)
        } catch {
            // Local state is cleared via defer regardless of backend outcome.
        }
    }

    /// Clean up all device tokens for the current user. Called during sign-out.
    /// Local state is always reset to `.idle` and `currentToken` is always
    /// cleared, even if the backend call fails — we don't want to leave stale
    /// sync state behind after sign-out.
    func cleanupOnSignOut() async {
        defer {
            currentToken = nil
            state = .idle
        }

        do {
            try await backend.cleanup()
        } catch {
            // Local state is cleared via defer regardless of backend outcome.
        }
    }
}
