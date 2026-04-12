import Foundation

// MARK: - UserRole

enum UserRole: String, Sendable, Codable {
    case buyer
    case broker
    case admin
}

// MARK: - AuthUser

struct AuthUser: Sendable, Codable, Equatable {
    let id: String
    let email: String
    let name: String
    let role: UserRole
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
}
