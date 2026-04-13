import Foundation
import Testing

@testable import BuyerV2

// MARK: - Validator tests

@Suite("ShareImportValidator pure URL validation")
struct ShareImportValidatorTests {

    @Test("detects Zillow URL")
    func testDetectZillow() {
        let portal = ShareImportValidator.detectPortal(
            for: "https://www.zillow.com/homedetails/123-main-st/12345_zpid/"
        )
        #expect(portal == .zillow)
    }

    @Test("detects Redfin URL")
    func testDetectRedfin() {
        let portal = ShareImportValidator.detectPortal(
            for: "https://www.redfin.com/FL/Miami/123-Main-St-33139/home/12345"
        )
        #expect(portal == .redfin)
    }

    @Test("detects Realtor.com URL")
    func testDetectRealtor() {
        let portal = ShareImportValidator.detectPortal(
            for: "https://www.realtor.com/realestateandhomes-detail/123-Main-St_Miami_FL_33139_M12345-67890"
        )
        #expect(portal == .realtor)
    }

    @Test("detects mobile zillow subdomain")
    func testDetectMobileZillow() {
        let portal = ShareImportValidator.detectPortal(
            for: "https://m.zillow.com/homedetails/12345"
        )
        #expect(portal == .zillow)
    }

    @Test("returns nil for unsupported host")
    func testUnsupportedHost() {
        expect(
            ShareImportValidator.detectPortal(
                for: "https://trulia.com/homedetails/123"
            ) == nil
        )
    }

    @Test("returns nil for non-http scheme")
    func testUnsupportedScheme() {
        expect(
            ShareImportValidator.detectPortal(for: "ftp://zillow.com/foo") == nil
        )
    }

    @Test("validate rejects empty input")
    func testValidateEmpty() {
        let result = ShareImportValidator.validate(urlString: "")
        guard case .invalid(let reason) = result else {
            Issue.record("Expected .invalid")
            return
        }
        #expect(reason == .emptyInput)
    }

    @Test("validate rejects whitespace-only input")
    func testValidateWhitespace() {
        let result = ShareImportValidator.validate(urlString: "   \n  ")
        guard case .invalid(let reason) = result else {
            Issue.record("Expected .invalid")
            return
        }
        #expect(reason == .emptyInput)
    }

    @Test("validate rejects malformed URL")
    func testValidateMalformed() {
        let result = ShareImportValidator.validate(urlString: "not a url")
        guard case .invalid = result else {
            Issue.record("Expected .invalid")
            return
        }
    }

    @Test("validate rejects unsupported scheme")
    func testValidateScheme() {
        let result = ShareImportValidator.validate(urlString: "ftp://zillow.com/x")
        guard case .invalid(let reason) = result else {
            Issue.record("Expected .invalid")
            return
        }
        #expect(reason == .unsupportedScheme)
    }

    @Test("validate rejects unsupported portal")
    func testValidatePortal() {
        let result = ShareImportValidator.validate(
            urlString: "https://trulia.com/homedetails/123"
        )
        guard case .invalid(let reason) = result else {
            Issue.record("Expected .invalid")
            return
        }
        #expect(reason == .unsupportedPortal)
    }

    @Test("validate accepts full Zillow URL")
    func testValidateZillowHappyPath() {
        let url = "https://www.zillow.com/homedetails/123-main-st/12345_zpid/"
        let result = ShareImportValidator.validate(urlString: url)
        guard case .valid(let portal, let normalized) = result else {
            Issue.record("Expected .valid")
            return
        }
        #expect(portal == .zillow)
        #expect(normalized == url)
    }

    @Test("validate trims whitespace in normalized URL")
    func testValidateTrimsWhitespace() {
        let result = ShareImportValidator.validate(
            urlString: "  https://www.zillow.com/homedetails/123  "
        )
        guard case .valid(_, let normalized) = result else {
            Issue.record("Expected .valid")
            return
        }
        #expect(normalized == "https://www.zillow.com/homedetails/123")
    }

    @Test("every invalid reason has a non-empty display message")
    func testDisplayMessages() {
        for reason in [
            ShareInvalidReason.emptyInput,
            .malformedURL,
            .unsupportedScheme,
            .unsupportedPortal,
        ] {
            #expect(reason.displayMessage.count > 0)
        }
    }
}

// MARK: - Mock backend

final class MockShareImportBackend: ShareImportBackend, @unchecked Sendable {
    var submitResult: Result<ShareImportBackendResponse, Error> = .success(
        ShareImportBackendResponse(
            kind: .existing,
            dealRoomId: "dr-mock",
            intakeJobId: nil
        )
    )
    var submitCallCount = 0
    var lastSubmittedURL: String?
    var lastSubmittedPortal: ShareImportPortal?

    func submitImport(
        url: String,
        portal: ShareImportPortal
    ) async throws -> ShareImportBackendResponse {
        submitCallCount += 1
        lastSubmittedURL = url
        lastSubmittedPortal = portal
        return try submitResult.get()
    }
}

private final class ShareImportAuthProvider: AuthProvider, @unchecked Sendable {
    var authenticateResult: Result<AuthTokens, Error> = .success(
        AuthTokens(
            accessToken: "share-import-access",
            refreshToken: "share-import-refresh",
            expiresAt: .distantFuture
        )
    )
    var validateResult: Result<AuthUser, Error> = .success(makeSignedInUser())

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

private func makeSignedInUser() -> AuthUser {
    AuthUser(
        id: "user-1",
        email: "buyer@example.com",
        name: "Test Buyer",
        role: .buyer
    )
}

private struct StubImportError: Error {
    let message: String
}

@MainActor
private func makeAuthService(state: AuthState) async -> AuthService {
    let provider = ShareImportAuthProvider()
    provider.validateResult = .success(makeSignedInUser())
    let service = AuthService(provider: provider)

    switch state {
    case .restoring:
        return service
    case .signedOut:
        await service.signOut()
    case .signedIn:
        try? await service.signIn(email: "buyer@example.com", password: "pass")
    case .expired:
        try? await service.signIn(email: "buyer@example.com", password: "pass")
        await service.handleTokenExpired()
    case .authUnavailable:
        try? await service.signIn(email: "buyer@example.com", password: "pass")
        provider.validateResult = .failure(AuthError.invalidResponse)
        await service.initialize()
    }

    return service
}

// MARK: - Service tests

@Suite("ShareImportService state transitions", .serialized)
@MainActor
struct ShareImportServiceTests {

    @Test("initial state is .idle")
    func testInitialState() {
        let backend = MockShareImportBackend()
        let authService = AuthService(provider: ShareImportAuthProvider())
        let service = ShareImportService(
            backend: backend,
            authService: authService
        )
        guard case .idle = service.state else {
            Issue.record("Expected .idle")
            return
        }
    }

    // MARK: - Signed-in happy paths

    @Test("signed-in + valid URL + existing deal room → .imported(.existingDealRoom)")
    func testSignedInExistingDealRoom() async {
        let backend = MockShareImportBackend()
        let authService = await makeAuthService(state: .signedIn(user: makeSignedInUser()))
        backend.submitResult = .success(
            ShareImportBackendResponse(
                kind: .existing,
                dealRoomId: "dr-42",
                intakeJobId: nil
            )
        )
        let service = ShareImportService(
            backend: backend,
            authService: authService
        )

        await service.handleSharedURL(
            "https://www.zillow.com/homedetails/123-main/42_zpid/"
        )

        guard case .imported(let outcome) = service.state else {
            Issue.record("Expected .imported, got \(service.state)")
            return
        }
        #expect(outcome == .existingDealRoom(dealRoomId: "dr-42"))
        #expect(backend.submitCallCount == 1)
        #expect(backend.lastSubmittedPortal == .zillow)
    }

    @Test("signed-in + valid URL + new intake job → .imported(.newIntakeJob)")
    func testSignedInNewIntakeJob() async {
        let backend = MockShareImportBackend()
        let authService = await makeAuthService(state: .signedIn(user: makeSignedInUser()))
        backend.submitResult = .success(
            ShareImportBackendResponse(
                kind: .created,
                dealRoomId: nil,
                intakeJobId: "job-99"
            )
        )
        let service = ShareImportService(
            backend: backend,
            authService: authService
        )

        await service.handleSharedURL(
            "https://www.redfin.com/FL/Miami/123-Main/home/99"
        )

        guard case .imported(let outcome) = service.state else {
            Issue.record("Expected .imported")
            return
        }
        #expect(outcome == .newIntakeJob(intakeJobId: "job-99"))
    }

    // MARK: - Signed-out flow

    @Test("signed-out → .signInRequired(pendingUrl)")
    func testSignedOutStashesPending() async {
        let backend = MockShareImportBackend()
        let authService = await makeAuthService(state: .signedOut)
        let service = ShareImportService(
            backend: backend,
            authService: authService
        )

        let url = "https://www.zillow.com/homedetails/123"
        await service.handleSharedURL(url)

        guard case .signInRequired(let pending) = service.state else {
            Issue.record("Expected .signInRequired")
            return
        }
        #expect(pending == url)
        #expect(backend.submitCallCount == 0) // never hit backend
    }

    @Test("resumePendingImport after sign-in completes successfully")
    func testResumePendingImport() async {
        let backend = MockShareImportBackend()
        let authService = await makeAuthService(state: .signedOut)
        backend.submitResult = .success(
            ShareImportBackendResponse(
                kind: .created,
                dealRoomId: nil,
                intakeJobId: "job-resume"
            )
        )

        let service = ShareImportService(
            backend: backend,
            authService: authService
        )

        await service.handleSharedURL("https://www.zillow.com/homedetails/xyz")
        guard case .signInRequired = service.state else {
            Issue.record("Expected .signInRequired")
            return
        }

        // Simulate sign-in completing
        try? await authService.signIn(email: "buyer@example.com", password: "pass")
        await service.resumePendingImport()

        guard case .imported(let outcome) = service.state else {
            Issue.record("Expected .imported after resume")
            return
        }
        #expect(outcome == .newIntakeJob(intakeJobId: "job-resume"))
    }

    // MARK: - Expired session

    @Test("expired session → .sessionExpired(pendingUrl)")
    func testExpiredSession() async {
        let backend = MockShareImportBackend()
        let authService = await makeAuthService(state: .expired)
        let service = ShareImportService(
            backend: backend,
            authService: authService
        )

        await service.handleSharedURL("https://www.zillow.com/homedetails/abc")

        guard case .sessionExpired(let pending) = service.state else {
            Issue.record("Expected .sessionExpired")
            return
        }
        #expect(pending == "https://www.zillow.com/homedetails/abc")
        #expect(backend.submitCallCount == 0)
    }

    @Test("backend 401 → .sessionExpired (treated like token revocation)")
    func testBackend401() async {
        let backend = MockShareImportBackend()
        let authService = await makeAuthService(state: .signedIn(user: makeSignedInUser()))
        backend.submitResult = .failure(ShareImportError.notAuthenticated)
        let service = ShareImportService(
            backend: backend,
            authService: authService
        )

        await service.handleSharedURL("https://www.zillow.com/homedetails/abc")

        guard case .sessionExpired = service.state else {
            Issue.record("Expected .sessionExpired")
            return
        }
        guard case .expired = authService.state else {
            Issue.record("Expected auth service to move to .expired, got \(authService.state)")
            return
        }
    }

    // MARK: - Invalid URLs

    @Test("unsupported portal → .invalid(.unsupportedPortal)")
    func testUnsupportedPortal() async {
        let backend = MockShareImportBackend()
        let authService = await makeAuthService(state: .signedIn(user: makeSignedInUser()))
        let service = ShareImportService(
            backend: backend,
            authService: authService
        )

        await service.handleSharedURL("https://www.trulia.com/home/123")

        guard case .invalid(let reason) = service.state else {
            Issue.record("Expected .invalid")
            return
        }
        #expect(reason == .unsupportedPortal)
        #expect(backend.submitCallCount == 0)
    }

    @Test("empty URL → .invalid(.emptyInput)")
    func testEmptyURL() async {
        let backend = MockShareImportBackend()
        let authService = await makeAuthService(state: .signedIn(user: makeSignedInUser()))
        let service = ShareImportService(
            backend: backend,
            authService: authService
        )

        await service.handleSharedURL("")

        guard case .invalid(let reason) = service.state else {
            Issue.record("Expected .invalid")
            return
        }
        #expect(reason == .emptyInput)
    }

    @Test("malformed URL → .invalid(.malformedURL) or similar")
    func testMalformedURL() async {
        let backend = MockShareImportBackend()
        let authService = await makeAuthService(state: .signedIn(user: makeSignedInUser()))
        let service = ShareImportService(
            backend: backend,
            authService: authService
        )

        await service.handleSharedURL("not a url")

        guard case .invalid = service.state else {
            Issue.record("Expected .invalid")
            return
        }
    }

    // MARK: - Network errors

    @Test("network error → .error(message) with pending URL preserved")
    func testNetworkError() async {
        let backend = MockShareImportBackend()
        let authService = await makeAuthService(state: .signedIn(user: makeSignedInUser()))
        backend.submitResult = .failure(StubImportError(message: "offline"))
        let service = ShareImportService(
            backend: backend,
            authService: authService
        )

        let url = "https://www.zillow.com/homedetails/123"
        await service.handleSharedURL(url)

        guard case .error = service.state else {
            Issue.record("Expected .error")
            return
        }

        // Retry path: after network recovers, resumePendingImport re-fires
        backend.submitResult = .success(
            ShareImportBackendResponse(
                kind: .created,
                dealRoomId: nil,
                intakeJobId: "job-retry"
            )
        )
        await service.resumePendingImport()
        guard case .imported = service.state else {
            Issue.record("Expected .imported after retry")
            return
        }
    }

    // MARK: - Malformed success responses (codex PR #52 regression)

    @Test("kind=existing with missing dealRoomId → .error (not .imported with empty id)")
    func testMissingDealRoomIdError() async {
        // Regression: codex P1 on PR #52. The backend returning
        // kind: existing without a dealRoomId must surface as an
        // error — fabricating an empty string would silently break
        // downstream navigation.
        let backend = MockShareImportBackend()
        let authService = await makeAuthService(state: .signedIn(user: makeSignedInUser()))
        backend.submitResult = .success(
            ShareImportBackendResponse(
                kind: .existing,
                dealRoomId: nil,
                intakeJobId: nil
            )
        )
        let service = ShareImportService(
            backend: backend,
            authService: authService
        )

        await service.handleSharedURL("https://www.zillow.com/homedetails/x")

        guard case .error = service.state else {
            Issue.record("Expected .error, got \(service.state)")
            return
        }
    }

    @Test("kind=existing with empty dealRoomId → .error")
    func testEmptyDealRoomIdError() async {
        let backend = MockShareImportBackend()
        let authService = await makeAuthService(state: .signedIn(user: makeSignedInUser()))
        backend.submitResult = .success(
            ShareImportBackendResponse(
                kind: .existing,
                dealRoomId: "",
                intakeJobId: nil
            )
        )
        let service = ShareImportService(
            backend: backend,
            authService: authService
        )

        await service.handleSharedURL("https://www.zillow.com/homedetails/x")

        guard case .error = service.state else {
            Issue.record("Expected .error for empty dealRoomId")
            return
        }
    }

    @Test("kind=created with missing intakeJobId → .error")
    func testMissingIntakeJobIdError() async {
        let backend = MockShareImportBackend()
        let authService = await makeAuthService(state: .signedIn(user: makeSignedInUser()))
        backend.submitResult = .success(
            ShareImportBackendResponse(
                kind: .created,
                dealRoomId: nil,
                intakeJobId: nil
            )
        )
        let service = ShareImportService(
            backend: backend,
            authService: authService
        )

        await service.handleSharedURL("https://www.redfin.com/FL/Miami/123/home/1")

        guard case .error = service.state else {
            Issue.record("Expected .error, got \(service.state)")
            return
        }
    }

    // MARK: - Dismiss

    @Test("dismiss clears pendingUrl and returns to idle")
    func testDismiss() async {
        let backend = MockShareImportBackend()
        let authService = await makeAuthService(state: .signedOut)
        let service = ShareImportService(
            backend: backend,
            authService: authService
        )
        await service.handleSharedURL("https://www.zillow.com/homedetails/z")

        service.dismiss()

        guard case .idle = service.state else {
            Issue.record("Expected .idle after dismiss")
            return
        }
        // Resuming after dismiss should be a no-op (nothing pending)
        await service.resumePendingImport()
        guard case .idle = service.state else {
            Issue.record("Expected .idle preserved (no pending)")
            return
        }
    }
}

// MARK: - Tiny expect helper used in pure-validator tests

private func expect(_ condition: Bool, _ message: String = "expected condition") {
    #expect(condition)
}
