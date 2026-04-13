import Foundation
import Observation

// MARK: - AuthProvider Protocol

protocol AuthProvider: Sendable {
    func authenticate(email: String, password: String) async throws -> AuthTokens
    func refreshToken(_ refreshToken: String) async throws -> AuthTokens
    func validateToken(_ token: String) async throws -> AuthUser
}

// MARK: - ConvexAuthProvider

/// Transitional auth transport boundary. The session contract is provider-neutral
/// so this can be replaced by Clerk/Auth0 integration without changing the rest
/// of the app.
final class ConvexAuthProvider: AuthProvider, Sendable {

    private let baseURL: URL

    init(baseURL: URL = URL(string: "https://api.buyerv2.com")!) {
        self.baseURL = baseURL
    }

    func authenticate(email: String, password: String) async throws -> AuthTokens {
        let url = baseURL.appendingPathComponent("/auth/login")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: String] = ["email": email, "password": password]
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await URLSession.shared.data(for: request)
        try validateHTTPResponse(response)
        return try decodeTokens(from: data)
    }

    func refreshToken(_ refreshToken: String) async throws -> AuthTokens {
        let url = baseURL.appendingPathComponent("/auth/refresh")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: String] = ["refreshToken": refreshToken]
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await URLSession.shared.data(for: request)
        try validateHTTPResponse(response)
        return try decodeTokens(from: data)
    }

    func validateToken(_ token: String) async throws -> AuthUser {
        let url = baseURL.appendingPathComponent("/auth/validate")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        let (data, response) = try await URLSession.shared.data(for: request)
        try validateHTTPResponse(response)
        return try JSONDecoder().decode(AuthUser.self, from: data)
    }

    // MARK: - Private

    private func validateHTTPResponse(_ response: URLResponse) throws {
        guard let http = response as? HTTPURLResponse else {
            throw AuthError.invalidResponse
        }
        guard (200...299).contains(http.statusCode) else {
            if http.statusCode == 401 {
                throw AuthError.unauthorized
            }
            throw AuthError.httpError(statusCode: http.statusCode)
        }
    }

    private func decodeTokens(from data: Data) throws -> AuthTokens {
        struct TokenResponse: Decodable {
            let accessToken: String
            let refreshToken: String
            let expiresAt: TimeInterval
        }
        let decoded = try JSONDecoder().decode(TokenResponse.self, from: data)
        return AuthTokens(
            accessToken: decoded.accessToken,
            refreshToken: decoded.refreshToken,
            expiresAt: Date(timeIntervalSince1970: decoded.expiresAt)
        )
    }
}

// MARK: - AuthError

enum AuthError: Error {
    case invalidResponse
    case unauthorized
    case httpError(statusCode: Int)
    case noStoredToken
    case noRefreshToken
}

// MARK: - AuthService

@MainActor
@Observable
final class AuthService {

    private(set) var state: AuthState = .restoring
    private var credentials: SessionCredentials?

    var isAuthenticated: Bool {
        state.allowsProtectedContent
    }

    private let provider: AuthProvider
    private let keychain = KeychainStore()

    private static let accessTokenKey = "authToken"
    private static let refreshTokenKey = "refreshToken"

    init(provider: AuthProvider = ConvexAuthProvider()) {
        self.provider = provider
    }

    // MARK: - Public

    func initialize() async {
        state = .restoring

        do {
            let accessToken = try await loadToken(for: Self.accessTokenKey)
            let refreshToken = try await loadToken(for: Self.refreshTokenKey)

            guard accessToken != nil || refreshToken != nil else {
                credentials = nil
                state = .signedOut
                return
            }

            credentials = SessionCredentials(
                accessToken: accessToken,
                refreshToken: refreshToken
            )

            if let accessToken {
                let user = try await provider.validateToken(accessToken)
                state = .signedIn(user: user)
                return
            }

            guard hasRefreshToken else {
                await clearStoredSession()
                state = .signedOut
                return
            }

            await restoreSession()
        } catch {
            // Access token invalid/expired — attempt refresh before signing out
            if isUnauthorized(error), hasRefreshToken {
                await restoreSession()
                return
            }
            if isUnauthorized(error) {
                await clearStoredSession()
                state = .expired
                return
            }
            credentials = nil
            state = .authUnavailable
        }
    }

    func signIn(email: String, password: String) async throws {
        let tokens = try await provider.authenticate(email: email, password: password)
        let user = try await provider.validateToken(tokens.accessToken)
        try await persist(tokens: tokens)
        credentials = SessionCredentials(tokens: tokens)
        state = .signedIn(user: user)
    }

    func signOut() async {
        await clearStoredSession()
        state = .signedOut
    }

    func handleTokenExpired() async {
        credentials?.accessToken = nil
        try? await keychain.delete(key: Self.accessTokenKey)
        state = .expired
    }

    /// Async snapshot of the current access token from the live auth
    /// boundary. Protected callers only receive a token when the app is
    /// in a signed-in state; expired and signed-out sessions fail safe.
    func accessToken() async -> String? {
        guard case .signedIn = state else {
            return nil
        }
        guard let token = credentials?.accessToken, !token.isEmpty else {
            return nil
        }
        return token
    }

    func restoreSession() async {
        state = .restoring

        do {
            let refreshToken = try await currentRefreshToken()
            let tokens = try await provider.refreshToken(refreshToken)
            let user = try await provider.validateToken(tokens.accessToken)
            try await persist(tokens: tokens)
            credentials = SessionCredentials(tokens: tokens)
            state = .signedIn(user: user)
        } catch {
            if isUnauthorized(error) || isMissingRefreshToken(error) {
                await clearStoredSession()
                state = .expired
                return
            }
            state = .authUnavailable
        }
    }

    // MARK: - Private

    private func persist(tokens: AuthTokens) async throws {
        guard let accessData = tokens.accessToken.data(using: .utf8),
              let refreshData = tokens.refreshToken.data(using: .utf8)
        else {
            throw KeychainStore.KeychainError.encodingFailed
        }
        try await keychain.save(key: Self.accessTokenKey, data: accessData)
        try await keychain.save(key: Self.refreshTokenKey, data: refreshData)
    }

    private func loadToken(for key: String) async throws -> String? {
        guard let data = try await keychain.load(key: key),
              let token = String(data: data, encoding: .utf8),
              !token.isEmpty
        else {
            return nil
        }
        return token
    }

    private func currentRefreshToken() async throws -> String {
        if let token = credentials?.refreshToken, !token.isEmpty {
            return token
        }
        guard let token = try await loadToken(for: Self.refreshTokenKey) else {
            throw AuthError.noRefreshToken
        }
        credentials = SessionCredentials(
            accessToken: credentials?.accessToken,
            refreshToken: token
        )
        return token
    }

    private func clearStoredSession() async {
        credentials = nil
        try? await keychain.delete(key: Self.accessTokenKey)
        try? await keychain.delete(key: Self.refreshTokenKey)
    }

    private var hasRefreshToken: Bool {
        guard let refreshToken = credentials?.refreshToken else {
            return false
        }
        return !refreshToken.isEmpty
    }

    private func isUnauthorized(_ error: Error) -> Bool {
        guard let authError = error as? AuthError else {
            return false
        }
        if case .unauthorized = authError {
            return true
        }
        return false
    }

    private func isMissingRefreshToken(_ error: Error) -> Bool {
        guard let authError = error as? AuthError else {
            return false
        }
        if case .noRefreshToken = authError {
            return true
        }
        return false
    }
}

private struct SessionCredentials: Sendable, Equatable {
    var accessToken: String?
    let refreshToken: String

    init(accessToken: String?, refreshToken: String?) {
        self.accessToken = accessToken
        self.refreshToken = refreshToken ?? ""
    }

    init(tokens: AuthTokens) {
        self.accessToken = tokens.accessToken
        self.refreshToken = tokens.refreshToken
    }
}
