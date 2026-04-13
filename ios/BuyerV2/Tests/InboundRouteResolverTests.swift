import Foundation
import Testing

@testable import BuyerV2

// MARK: - Auth Test Helper

private func makeUser(
    id: String = "user-1",
    email: String = "buyer@example.com",
    name: String = "Test Buyer",
    role: UserRole = .buyer
) -> AuthUser {
    AuthUser(id: id, email: email, name: name, role: role)
}

/// Minimal AuthProvider stub — we only need it to drive AuthService state
/// via signIn / handleTokenExpired / signOut, not make real auth calls.
private final class StubAuthProvider: AuthProvider, @unchecked Sendable {
    var authenticateResult: Result<AuthTokens, Error> = .failure(AuthError.unauthorized)
    var validateResult: Result<AuthUser, Error> = .failure(AuthError.unauthorized)

    func authenticate(email: String, password: String) async throws -> AuthTokens {
        try authenticateResult.get()
    }

    func refreshToken(_ refreshToken: String) async throws -> AuthTokens {
        try authenticateResult.get()
    }

    func validateToken(_ token: String) async throws -> AuthUser {
        try validateResult.get()
    }
}

// MARK: - InboundRouteResolver Tests

@Suite("InboundRouteResolver — payload parsing and auth gating", .serialized)
@MainActor
struct InboundRouteResolverTests {

    // ─────────────────────────────────────────────────────────────────────
    // Pure parser tests — auth state doesn't matter, exercise parseRoute
    // ─────────────────────────────────────────────────────────────────────

    // MARK: - Empty / invalid payloads

    @Test("parseRoute returns emptyPayload when both url and pushData are nil")
    func testParseEmptyPayload() {
        let payload = InboundRoutePayload()
        let result = InboundRouteResolver.parseRoute(from: payload)
        guard case .failure(.emptyPayload) = result else {
            Issue.record("Expected .emptyPayload, got \(result)")
            return
        }
    }

    @Test("parseRoute rejects unsupported URL schemes")
    func testParseUnsupportedScheme() {
        let payload = InboundRoutePayload(url: "ftp://example.com/deal-room/abc")
        let result = InboundRouteResolver.parseRoute(from: payload)
        guard case .failure(.unsupportedScheme) = result else {
            Issue.record("Expected .unsupportedScheme, got \(result)")
            return
        }
    }

    @Test("parseRoute rejects HTTPS URLs from unknown hosts")
    func testParseUnknownHost() {
        let payload = InboundRoutePayload(url: "https://evil.com/deal-room/abc")
        let result = InboundRouteResolver.parseRoute(from: payload)
        guard case .failure(.unsupportedScheme) = result else {
            Issue.record("Expected .unsupportedScheme, got \(result)")
            return
        }
    }

    // MARK: - Custom scheme URLs

    @Test("parses buyerv2://deal-room/<id> as .dealRoom")
    func testCustomSchemeDealRoom() {
        let payload = InboundRoutePayload(url: "buyerv2://deal-room/dr_123")
        guard case .success(let route) = InboundRouteResolver.parseRoute(from: payload)
        else {
            Issue.record("Expected success, got failure")
            return
        }
        #expect(route == .dealRoom(dealRoomId: "dr_123"))
    }

    @Test("parses buyerv2://task/<dealId>/<taskId> as .task with taskId")
    func testCustomSchemeTaskWithId() {
        let payload = InboundRoutePayload(url: "buyerv2://task/dr_123/tk_456")
        guard case .success(let route) = InboundRouteResolver.parseRoute(from: payload)
        else {
            Issue.record("Expected success")
            return
        }
        #expect(route == .task(dealRoomId: "dr_123", taskId: "tk_456"))
    }

    @Test("parses buyerv2://task/<dealId> without taskId as .task(nil)")
    func testCustomSchemeTaskNoId() {
        let payload = InboundRoutePayload(url: "buyerv2://task/dr_123")
        guard case .success(let route) = InboundRouteResolver.parseRoute(from: payload)
        else {
            Issue.record("Expected success")
            return
        }
        #expect(route == .task(dealRoomId: "dr_123", taskId: nil))
    }

    @Test("parses buyerv2://timeline/<dealId> as .timeline")
    func testCustomSchemeTimeline() {
        let payload = InboundRoutePayload(url: "buyerv2://timeline/dr_123")
        guard case .success(let route) = InboundRouteResolver.parseRoute(from: payload)
        else {
            Issue.record("Expected success")
            return
        }
        #expect(route == .timeline(dealRoomId: "dr_123"))
    }

    @Test("parses buyerv2://property/<id> as .property")
    func testCustomSchemeProperty() {
        let payload = InboundRoutePayload(url: "buyerv2://property/prop_789")
        guard case .success(let route) = InboundRouteResolver.parseRoute(from: payload)
        else {
            Issue.record("Expected success")
            return
        }
        #expect(route == .property(propertyId: "prop_789"))
    }

    @Test("parses buyerv2://home as .home")
    func testCustomSchemeHome() {
        let payload = InboundRoutePayload(url: "buyerv2://home")
        guard case .success(let route) = InboundRouteResolver.parseRoute(from: payload)
        else {
            Issue.record("Expected success")
            return
        }
        #expect(route == .home)
    }

    @Test("returns .missingField when dealRoomId is absent for deal-room route")
    func testCustomSchemeDealRoomMissingId() {
        let payload = InboundRoutePayload(url: "buyerv2://deal-room")
        guard case .failure(.missingField(let name)) = InboundRouteResolver.parseRoute(
            from: payload
        ) else {
            Issue.record("Expected .missingField")
            return
        }
        #expect(name == "dealRoomId")
    }

    // MARK: - Empty segment safety (codex P2 fix)

    @Test("buyerv2://task//tk_1 with empty dealRoomId segment fails with .missingField — not misparsed as dealRoomId=tk_1")
    func testCustomSchemeTaskEmptyDealRoomSegment() {
        // Regression guard: previously, split(separator:) collapsed empty
        // subsequences, so `//tk_1` was misparsed as `tk_1` being the
        // dealRoomId. Now we preserve empties and fail safely.
        let payload = InboundRoutePayload(url: "buyerv2://task//tk_1")
        guard case .failure(.missingField(let name)) = InboundRouteResolver.parseRoute(
            from: payload
        ) else {
            Issue.record("Expected .missingField for empty dealRoomId")
            return
        }
        #expect(name == "dealRoomId")
    }

    @Test("https://buyerv2.com/task//tk_1 also fails safely")
    func testHTTPSTaskEmptyDealRoomSegment() {
        let payload = InboundRoutePayload(
            url: "https://buyerv2.com/task//tk_1"
        )
        guard case .failure(.missingField(let name)) = InboundRouteResolver.parseRoute(
            from: payload
        ) else {
            Issue.record("Expected .missingField for empty dealRoomId")
            return
        }
        #expect(name == "dealRoomId")
    }

    @Test("buyerv2://deal-room// with empty id fails with .missingField")
    func testCustomSchemeDealRoomEmptySegment() {
        let payload = InboundRoutePayload(url: "buyerv2://deal-room/")
        guard case .failure(.missingField(let name)) = InboundRouteResolver.parseRoute(
            from: payload
        ) else {
            Issue.record("Expected .missingField")
            return
        }
        #expect(name == "dealRoomId")
    }

    @Test("buyerv2://task/dr_123/ with trailing slash still parses as taskId=nil")
    func testCustomSchemeTaskTrailingSlash() {
        // A trailing slash after dealRoomId should not poison the parse.
        // The interior empty segment means "no taskId", not a broken route.
        let payload = InboundRoutePayload(url: "buyerv2://task/dr_123/")
        guard case .success(let route) = InboundRouteResolver.parseRoute(from: payload)
        else {
            Issue.record("Expected success for trailing-slash task URL")
            return
        }
        #expect(route == .task(dealRoomId: "dr_123", taskId: nil))
    }

    // MARK: - HTTPS universal links

    @Test("parses https://buyerv2.com/deal-room/<id> as .dealRoom")
    func testHTTPSDealRoom() {
        let payload = InboundRoutePayload(url: "https://buyerv2.com/deal-room/dr_abc")
        guard case .success(let route) = InboundRouteResolver.parseRoute(from: payload)
        else {
            Issue.record("Expected success")
            return
        }
        #expect(route == .dealRoom(dealRoomId: "dr_abc"))
    }

    @Test("parses https://app.buyerv2.com/task/<dealId>/<taskId> as .task")
    func testHTTPSTaskSubdomain() {
        let payload = InboundRoutePayload(
            url: "https://app.buyerv2.com/task/dr_xyz/tk_999"
        )
        guard case .success(let route) = InboundRouteResolver.parseRoute(from: payload)
        else {
            Issue.record("Expected success")
            return
        }
        #expect(route == .task(dealRoomId: "dr_xyz", taskId: "tk_999"))
    }

    @Test("parses empty-path buyerv2.com URL as .home")
    func testHTTPSRootIsHome() {
        let payload = InboundRoutePayload(url: "https://buyerv2.com/")
        guard case .success(let route) = InboundRouteResolver.parseRoute(from: payload)
        else {
            Issue.record("Expected success")
            return
        }
        #expect(route == .home)
    }

    // MARK: - Deal room tab suffix

    @Test("deal-room/<id>/tasks maps to .task without taskId")
    func testDealRoomTasksTab() {
        let payload = InboundRoutePayload(url: "buyerv2://deal-room/dr_123/tasks")
        guard case .success(let route) = InboundRouteResolver.parseRoute(from: payload)
        else {
            Issue.record("Expected success")
            return
        }
        #expect(route == .task(dealRoomId: "dr_123", taskId: nil))
    }

    @Test("deal-room/<id>/timeline maps to .timeline")
    func testDealRoomTimelineTab() {
        let payload = InboundRoutePayload(url: "buyerv2://deal-room/dr_123/timeline")
        guard case .success(let route) = InboundRouteResolver.parseRoute(from: payload)
        else {
            Issue.record("Expected success")
            return
        }
        #expect(route == .timeline(dealRoomId: "dr_123"))
    }

    @Test("unknown deal-room tab returns .invalidIdentifier")
    func testDealRoomUnknownTab() {
        let payload = InboundRoutePayload(url: "buyerv2://deal-room/dr_123/bogus")
        guard case .failure(.invalidIdentifier(let field, let value)) =
            InboundRouteResolver.parseRoute(from: payload)
        else {
            Issue.record("Expected .invalidIdentifier")
            return
        }
        #expect(field == "tab")
        #expect(value == "bogus")
    }

    // MARK: - Push payloads

    @Test("parses push payload with route=deal_room as .dealRoom")
    func testPushDealRoom() {
        let payload = InboundRoutePayload(
            pushData: ["route": "deal_room", "dealRoomId": "dr_push_1"]
        )
        guard case .success(let route) = InboundRouteResolver.parseRoute(from: payload)
        else {
            Issue.record("Expected success")
            return
        }
        #expect(route == .dealRoom(dealRoomId: "dr_push_1"))
    }

    @Test("parses push payload with route=task and taskId")
    func testPushTask() {
        let payload = InboundRoutePayload(
            pushData: [
                "route": "task",
                "dealRoomId": "dr_1",
                "taskId": "tk_2",
            ]
        )
        guard case .success(let route) = InboundRouteResolver.parseRoute(from: payload)
        else {
            Issue.record("Expected success")
            return
        }
        #expect(route == .task(dealRoomId: "dr_1", taskId: "tk_2"))
    }

    @Test("push payload missing route returns .missingField")
    func testPushMissingRoute() {
        let payload = InboundRoutePayload(
            pushData: ["dealRoomId": "dr_1"]
        )
        guard case .failure(.missingField(let name)) =
            InboundRouteResolver.parseRoute(from: payload)
        else {
            Issue.record("Expected .missingField")
            return
        }
        #expect(name == "route")
    }

    @Test("push payload takes precedence over URL when both provided")
    func testPushOverridesURL() {
        // If both are provided, push wins because a push tap is the
        // explicit user action the resolver should honor.
        let payload = InboundRoutePayload(
            url: "buyerv2://home",
            pushData: ["route": "deal_room", "dealRoomId": "dr_push"]
        )
        guard case .success(let route) = InboundRouteResolver.parseRoute(from: payload)
        else {
            Issue.record("Expected success")
            return
        }
        #expect(route == .dealRoom(dealRoomId: "dr_push"))
    }

    // ─────────────────────────────────────────────────────────────────────
    // Auth-gated resolution tests — exercise resolve() with live AuthService
    // ─────────────────────────────────────────────────────────────────────

    @Test("resolve → .resolved when user is signed in")
    func testResolveSignedIn() async throws {
        let provider = StubAuthProvider()
        provider.authenticateResult = .success(
            AuthTokens(
                accessToken: "a",
                refreshToken: "r",
                expiresAt: Date(timeIntervalSinceNow: 3600)
            )
        )
        provider.validateResult = .success(makeUser())
        let authService = AuthService(provider: provider)
        try await authService.signIn(email: "buyer@example.com", password: "pw")
        // Precondition
        guard case .signedIn = authService.state else {
            Issue.record("Pre-condition failed: expected .signedIn")
            return
        }

        let resolver = InboundRouteResolver(authService: authService)
        let result = resolver.resolve(
            InboundRoutePayload(url: "buyerv2://deal-room/dr_123")
        )

        guard case .resolved(let route) = result else {
            Issue.record("Expected .resolved, got \(result)")
            return
        }
        #expect(route == .dealRoom(dealRoomId: "dr_123"))
    }

    @Test("resolve → .signInRequired(pending) when user is signed out")
    func testResolveSignedOut() async {
        let provider = StubAuthProvider()
        let authService = AuthService(provider: provider)
        await authService.initialize() // empty keychain → .signedOut
        guard case .signedOut = authService.state else {
            Issue.record("Pre-condition failed: expected .signedOut")
            return
        }

        let resolver = InboundRouteResolver(authService: authService)
        let result = resolver.resolve(
            InboundRoutePayload(url: "buyerv2://timeline/dr_abc")
        )

        guard case .signInRequired(let pending) = result else {
            Issue.record("Expected .signInRequired, got \(result)")
            return
        }
        #expect(pending == .timeline(dealRoomId: "dr_abc"))
    }

    @Test("resolve → .sessionExpired(pending) when auth state is .expired")
    func testResolveExpired() async throws {
        let provider = StubAuthProvider()
        provider.authenticateResult = .success(
            AuthTokens(
                accessToken: "a",
                refreshToken: "r",
                expiresAt: Date(timeIntervalSinceNow: 3600)
            )
        )
        provider.validateResult = .success(makeUser())
        let authService = AuthService(provider: provider)
        try await authService.signIn(email: "buyer@example.com", password: "pw")
        authService.handleTokenExpired()
        guard case .expired = authService.state else {
            Issue.record("Pre-condition failed: expected .expired")
            return
        }

        let resolver = InboundRouteResolver(authService: authService)
        let result = resolver.resolve(
            InboundRoutePayload(
                pushData: ["route": "task", "dealRoomId": "dr_1", "taskId": "tk_2"]
            )
        )

        guard case .sessionExpired(let pending) = result else {
            Issue.record("Expected .sessionExpired, got \(result)")
            return
        }
        #expect(pending == .task(dealRoomId: "dr_1", taskId: "tk_2"))
    }

    @Test("resolve → .invalidTarget when payload can't be parsed (bypasses auth)")
    func testResolveInvalidTargetBypassesAuth() async throws {
        // Even when signed-in, an unparseable payload must surface as
        // .invalidTarget so the caller falls back to home — never return
        // .resolved for something we couldn't parse.
        let provider = StubAuthProvider()
        provider.authenticateResult = .success(
            AuthTokens(
                accessToken: "a",
                refreshToken: "r",
                expiresAt: Date(timeIntervalSinceNow: 3600)
            )
        )
        provider.validateResult = .success(makeUser())
        let authService = AuthService(provider: provider)
        try await authService.signIn(email: "buyer@example.com", password: "pw")

        let resolver = InboundRouteResolver(authService: authService)
        let result = resolver.resolve(
            InboundRoutePayload(url: "ftp://somewhere/nothing")
        )

        guard case .invalidTarget(let reason) = result else {
            Issue.record("Expected .invalidTarget, got \(result)")
            return
        }
        guard case .unsupportedScheme = reason else {
            Issue.record("Expected .unsupportedScheme, got \(reason)")
            return
        }
    }

    @Test("resolve → .signInRequired while AuthService is .restoring")
    func testResolveRestoringMapsToSignInRequired() {
        // Before initialize() runs, AuthService state is .restoring.
        // Callers should hold the pending route and re-resolve once
        // auth finishes restoring.
        let provider = StubAuthProvider()
        let authService = AuthService(provider: provider)
        guard case .restoring = authService.state else {
            Issue.record("Pre-condition failed: expected .restoring")
            return
        }

        let resolver = InboundRouteResolver(authService: authService)
        let result = resolver.resolve(
            InboundRoutePayload(url: "buyerv2://property/prop_1")
        )

        guard case .signInRequired(let pending) = result else {
            Issue.record("Expected .signInRequired, got \(result)")
            return
        }
        #expect(pending == .property(propertyId: "prop_1"))
    }
}
