import Foundation
import Testing

@testable import BuyerV2

@Suite("AuthUser shared session contract decoding")
struct AuthStateTests {

    @Test("decodes the shared session shape with nested claims")
    func testDecodesSharedSessionShape() throws {
        let payload = """
        {
          "userId": "user-shared",
          "email": "buyer@example.com",
          "name": "Buyer Shared",
          "role": "buyer",
          "claims": {
            "authTokenIdentifier": "token-123",
            "authSubject": "user_abc",
            "authIssuer": "https://clerk.buyerv2.com",
            "authProvider": "clerk",
            "sessionVersion": 7,
            "issuedAt": "2026-04-13T13:00:00Z",
            "expiresAt": "2026-04-13T14:00:00Z"
          }
        }
        """

        let user = try JSONDecoder().decode(AuthUser.self, from: Data(payload.utf8))

        #expect(user.userId == "user-shared")
        #expect(user.email == "buyer@example.com")
        #expect(user.name == "Buyer Shared")
        #expect(user.role == .buyer)
        #expect(user.authTokenIdentifier == "token-123")
        #expect(user.authSubject == "user_abc")
        #expect(user.authIssuer == "https://clerk.buyerv2.com")
        #expect(user.provider == .clerk)
        #expect(user.sessionVersion == 7)
        #expect(user.issuedAt == ISO8601DateFormatter().date(from: "2026-04-13T13:00:00Z"))
        #expect(user.expiresAt == ISO8601DateFormatter().date(from: "2026-04-13T14:00:00Z"))
    }

    @Test("decodes the legacy flat session shape as a compatibility fallback")
    func testDecodesLegacyFlatShape() throws {
        let payload = """
        {
          "id": "user-legacy",
          "email": "legacy@example.com",
          "name": "Legacy Buyer",
          "role": "buyer",
          "authSubject": "legacy-subject",
          "authIssuer": "https://auth0.buyerv2.com",
          "provider": "auth0",
          "sessionVersion": 3,
          "expiresAt": "2026-04-13T15:00:00Z"
        }
        """

        let user = try JSONDecoder().decode(AuthUser.self, from: Data(payload.utf8))

        #expect(user.userId == "user-legacy")
        #expect(user.id == "user-legacy")
        #expect(user.provider == .auth0)
        #expect(user.authSubject == "legacy-subject")
        #expect(user.authIssuer == "https://auth0.buyerv2.com")
        #expect(user.sessionVersion == 3)
        #expect(user.expiresAt == ISO8601DateFormatter().date(from: "2026-04-13T15:00:00Z"))
    }

    @Test("encodes AuthUser back into the shared nested session shape")
    func testEncodesSharedSessionShape() throws {
        let user = AuthUser(
            userId: "user-encode",
            email: "encode@example.com",
            name: "Encode Buyer",
            role: .buyer,
            claims: AuthSessionClaims(
                authTokenIdentifier: "token-encode",
                authSubject: "encode-subject",
                authIssuer: "https://clerk.buyerv2.com",
                authProvider: .clerk,
                sessionVersion: 2,
                issuedAt: ISO8601DateFormatter().date(from: "2026-04-13T12:30:00Z"),
                expiresAt: ISO8601DateFormatter().date(from: "2026-04-13T13:30:00Z")
            )
        )

        let data = try JSONEncoder().encode(user)
        let object = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        let claims = object?["claims"] as? [String: Any]

        #expect(object?["userId"] as? String == "user-encode")
        #expect(object?["email"] as? String == "encode@example.com")
        #expect(claims?["authTokenIdentifier"] as? String == "token-encode")
        #expect(claims?["authProvider"] as? String == "clerk")
        #expect(claims?["sessionVersion"] as? Int == 2)
    }
}
