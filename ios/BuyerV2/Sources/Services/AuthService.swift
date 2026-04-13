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

    var isAuthenticated: Bool {
        if case .signedIn = state { return true }
        return false
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
        do {
            guard let tokenData = try await keychain.load(key: Self.accessTokenKey),
                  let token = String(data: tokenData, encoding: .utf8)
            else {
                state = .signedOut
                return
            }
            let user = try await provider.validateToken(token)
            state = .signedIn(user: user)
        } catch {
            // Access token invalid/expired — attempt refresh before signing out
            if isUnauthorized(error) {
                await restoreSession()
                return
            }
            state = .authUnavailable
        }
    }

    func signIn(email: String, password: String) async throws {
        let tokens = try await provider.authenticate(email: email, password: password)
        try await storeTokens(tokens)
        let user = try await provider.validateToken(tokens.accessToken)
        state = .signedIn(user: user)
    }

    func signOut() async {
        try? await keychain.delete(key: Self.accessTokenKey)
        try? await keychain.delete(key: Self.refreshTokenKey)
        state = .signedOut
    }

    func handleTokenExpired() {
        state = .expired
    }

    func restoreSession() async {
        do {
            guard let refreshData = try await keychain.load(key: Self.refreshTokenKey),
                  let refreshToken = String(data: refreshData, encoding: .utf8)
            else {
                throw AuthError.noRefreshToken
            }
            let tokens = try await provider.refreshToken(refreshToken)
            try await storeTokens(tokens)
            let user = try await provider.validateToken(tokens.accessToken)
            state = .signedIn(user: user)
        } catch {
            state = isUnauthorized(error) ? .signedOut : .authUnavailable
        }
    }

    // MARK: - Private

    private func storeTokens(_ tokens: AuthTokens) async throws {
        guard let accessData = tokens.accessToken.data(using: .utf8),
              let refreshData = tokens.refreshToken.data(using: .utf8)
        else {
            throw KeychainStore.KeychainError.encodingFailed
        }
        try await keychain.save(key: Self.accessTokenKey, data: accessData)
        try await keychain.save(key: Self.refreshTokenKey, data: refreshData)
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
}
