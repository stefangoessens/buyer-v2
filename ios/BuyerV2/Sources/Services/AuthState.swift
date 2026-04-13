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
}

struct AuthSessionClaims: Sendable, Codable, Equatable {
    let authTokenIdentifier: String?
    let authSubject: String?
    let authIssuer: String?
    let authProvider: AuthProviderType?
    let sessionVersion: Int?
    let issuedAt: Date?
    let expiresAt: Date?

    init(
        authTokenIdentifier: String? = nil,
        authSubject: String? = nil,
        authIssuer: String? = nil,
        authProvider: AuthProviderType? = nil,
        sessionVersion: Int? = nil,
        issuedAt: Date? = nil,
        expiresAt: Date? = nil
    ) {
        self.authTokenIdentifier = authTokenIdentifier
        self.authSubject = authSubject
        self.authIssuer = authIssuer
        self.authProvider = authProvider
        self.sessionVersion = sessionVersion
        self.issuedAt = issuedAt
        self.expiresAt = expiresAt
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        authTokenIdentifier = try container.decodeIfPresent(
            String.self,
            forKey: .authTokenIdentifier
        )
        authSubject = try container.decodeIfPresent(String.self, forKey: .authSubject)
        authIssuer = try container.decodeIfPresent(String.self, forKey: .authIssuer)
        authProvider = try container.decodeIfPresent(AuthProviderType.self, forKey: .authProvider)
        sessionVersion = try container.decodeIfPresent(Int.self, forKey: .sessionVersion)
        issuedAt = try container.decodeFlexibleDateIfPresent(forKey: .issuedAt)
        expiresAt = try container.decodeFlexibleDateIfPresent(forKey: .expiresAt)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encodeIfPresent(authTokenIdentifier, forKey: .authTokenIdentifier)
        try container.encodeIfPresent(authSubject, forKey: .authSubject)
        try container.encodeIfPresent(authIssuer, forKey: .authIssuer)
        try container.encodeIfPresent(authProvider, forKey: .authProvider)
        try container.encodeIfPresent(sessionVersion, forKey: .sessionVersion)
        try container.encodeISO8601DateIfPresent(issuedAt, forKey: .issuedAt)
        try container.encodeISO8601DateIfPresent(expiresAt, forKey: .expiresAt)
    }
}

// MARK: - AuthUser

struct AuthUser: Sendable, Codable, Equatable {
    let userId: String
    let email: String
    let name: String
    let role: UserRole
    let claims: AuthSessionClaims?

    init(
        userId: String,
        email: String,
        name: String,
        role: UserRole,
        claims: AuthSessionClaims? = nil
    ) {
        self.userId = userId
        self.email = email
        self.name = name
        self.role = role
        self.claims = claims
    }

    init(
        id: String,
        email: String,
        name: String,
        role: UserRole,
        authTokenIdentifier: String? = nil,
        authSubject: String? = nil,
        authIssuer: String? = nil,
        provider: AuthProviderType? = nil,
        sessionVersion: Int? = nil,
        issuedAt: Date? = nil,
        expiresAt: Date? = nil
    ) {
        self.init(
            userId: id,
            email: email,
            name: name,
            role: role,
            claims: Self.makeClaims(
                authTokenIdentifier: authTokenIdentifier,
                authSubject: authSubject,
                authIssuer: authIssuer,
                provider: provider,
                sessionVersion: sessionVersion,
                issuedAt: issuedAt,
                expiresAt: expiresAt
            )
        )
    }

    var id: String { userId }
    var authTokenIdentifier: String? { claims?.authTokenIdentifier }
    var authSubject: String? { claims?.authSubject }
    var authIssuer: String? { claims?.authIssuer }
    var provider: AuthProviderType? { claims?.authProvider }
    var sessionVersion: Int? { claims?.sessionVersion }
    var issuedAt: Date? { claims?.issuedAt }
    var expiresAt: Date? { claims?.expiresAt }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        if let userId = try container.decodeIfPresent(String.self, forKey: .userId) {
            self.userId = userId
            self.email = try container.decode(String.self, forKey: .email)
            self.name = try container.decode(String.self, forKey: .name)
            self.role = try container.decode(UserRole.self, forKey: .role)
            self.claims = try container.decodeIfPresent(AuthSessionClaims.self, forKey: .claims)
            return
        }

        self.userId = try container.decode(String.self, forKey: .id)
        self.email = try container.decode(String.self, forKey: .email)
        self.name = try container.decode(String.self, forKey: .name)
        self.role = try container.decode(UserRole.self, forKey: .role)
        self.claims = Self.makeClaims(
            authTokenIdentifier: try container.decodeIfPresent(
                String.self,
                forKey: .authTokenIdentifier
            ),
            authSubject: try container.decodeIfPresent(String.self, forKey: .authSubject),
            authIssuer: try container.decodeIfPresent(String.self, forKey: .authIssuer),
            provider: try container.decodeIfPresent(AuthProviderType.self, forKey: .provider),
            sessionVersion: try container.decodeIfPresent(Int.self, forKey: .sessionVersion),
            issuedAt: try container.decodeFlexibleDateIfPresent(forKey: .issuedAt),
            expiresAt: try container.decodeFlexibleDateIfPresent(forKey: .expiresAt)
        )
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(userId, forKey: .userId)
        try container.encode(email, forKey: .email)
        try container.encode(name, forKey: .name)
        try container.encode(role, forKey: .role)
        try container.encodeIfPresent(claims, forKey: .claims)
    }

    private static func makeClaims(
        authTokenIdentifier: String?,
        authSubject: String?,
        authIssuer: String?,
        provider: AuthProviderType?,
        sessionVersion: Int?,
        issuedAt: Date?,
        expiresAt: Date?
    ) -> AuthSessionClaims? {
        guard authTokenIdentifier != nil
            || authSubject != nil
            || authIssuer != nil
            || provider != nil
            || sessionVersion != nil
            || issuedAt != nil
            || expiresAt != nil
        else {
            return nil
        }

        return AuthSessionClaims(
            authTokenIdentifier: authTokenIdentifier,
            authSubject: authSubject,
            authIssuer: authIssuer,
            authProvider: provider,
            sessionVersion: sessionVersion,
            issuedAt: issuedAt,
            expiresAt: expiresAt
        )
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

private extension AuthSessionClaims {
    enum CodingKeys: String, CodingKey {
        case authTokenIdentifier
        case authSubject
        case authIssuer
        case authProvider
        case sessionVersion
        case issuedAt
        case expiresAt
    }
}

private extension AuthUser {
    enum CodingKeys: String, CodingKey {
        case userId
        case id
        case email
        case name
        case role
        case claims
        case authTokenIdentifier
        case authSubject
        case authIssuer
        case provider
        case sessionVersion
        case issuedAt
        case expiresAt
    }
}

private extension KeyedDecodingContainer {
    func decodeFlexibleDateIfPresent(forKey key: Key) throws -> Date? {
        if let isoString = try decodeIfPresent(String.self, forKey: key) {
            return DateDecoding.decode(isoString)
        }

        if let timestamp = try decodeIfPresent(Double.self, forKey: key) {
            return Date(timeIntervalSince1970: timestamp)
        }

        if let timestamp = try decodeIfPresent(Int.self, forKey: key) {
            return Date(timeIntervalSince1970: TimeInterval(timestamp))
        }

        return nil
    }
}

private extension KeyedEncodingContainer {
    mutating func encodeISO8601DateIfPresent(
        _ value: Date?,
        forKey key: Key
    ) throws {
        guard let value else { return }
        try encode(DateEncoding.encode(value), forKey: key)
    }
}

private enum DateDecoding {
    private static let fractionalFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private static let standardFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    static func decode(_ value: String) -> Date? {
        return fractionalFormatter.date(from: value) ?? standardFormatter.date(from: value)
    }
}

private enum DateEncoding {
    private static let formatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    static func encode(_ value: Date) -> String {
        return formatter.string(from: value)
    }
}
