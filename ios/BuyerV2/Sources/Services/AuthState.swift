import Foundation

// MARK: - UserRole

enum UserRole: String, Sendable, Codable {
    case buyer
    case broker
    case admin
}

enum AuthProviderType: String, Sendable, Codable {
    case clerk
    case auth0
    case legacy
}

// MARK: - AuthUser

struct AuthUser: Sendable, Codable, Equatable {
    let id: String
    let email: String
    let name: String
    let role: UserRole
    let authSubject: String?
    let provider: AuthProviderType?
    let sessionVersion: Int?
    let issuedAt: Date?
    let expiresAt: Date?

    init(
        id: String,
        email: String,
        name: String,
        role: UserRole,
        authSubject: String? = nil,
        provider: AuthProviderType? = nil,
        sessionVersion: Int? = nil,
        issuedAt: Date? = nil,
        expiresAt: Date? = nil
    ) {
        self.id = id
        self.email = email
        self.name = name
        self.role = role
        self.authSubject = authSubject
        self.provider = provider
        self.sessionVersion = sessionVersion
        self.issuedAt = issuedAt
        self.expiresAt = expiresAt
    }
}

// MARK: - AuthTokens

struct AuthTokens: Sendable {
    let accessToken: String
    let refreshToken: String
    let expiresAt: Date
}

// MARK: - AuthState

enum AuthState: Sendable, Equatable {
    case signedOut
    case restoring
    case signedIn(user: AuthUser)
    case expired
    case authUnavailable
}
