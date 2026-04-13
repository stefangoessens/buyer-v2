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

enum AuthPhase: String, Sendable, Codable, Equatable {
    case signedOut = "signed_out"
    case restoring
    case signedIn = "signed_in"
    case expired
    case authUnavailable = "auth_unavailable"
}

// MARK: - AuthState

enum AuthState: Sendable, Equatable {
    case signedOut
    case restoring
    case signedIn(user: AuthUser)
    case expired
    case authUnavailable
}

extension AuthState {

    var phase: AuthPhase {
        switch self {
        case .signedOut:
            return .signedOut
        case .restoring:
            return .restoring
        case .signedIn:
            return .signedIn
        case .expired:
            return .expired
        case .authUnavailable:
            return .authUnavailable
        }
    }

    var user: AuthUser? {
        guard case .signedIn(let user) = self else {
            return nil
        }
        return user
    }

    var allowsProtectedContent: Bool {
        phase == .signedIn
    }
}
