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

// MARK: - Test helper

private struct StubAuthStateHolder: @unchecked Sendable {
    var state: AuthState
}

@MainActor
private final class MutableAuthState: @unchecked Sendable {
    var state: AuthState = .signedOut
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

// MARK: - Service tests

@Suite("ShareImportService state transitions", .serialized)
@MainActor
struct ShareImportServiceTests {

    @Test("initial state is .idle")
    func testInitialState() {
        let backend = MockShareImportBackend()
        let service = ShareImportService(
            backend: backend,
            authState: { .signedIn(user: makeSignedInUser()) }
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
        backend.submitResult = .success(
            ShareImportBackendResponse(
                kind: .existing,
                dealRoomId: "dr-42",
                intakeJobId: nil
            )
        )
        let service = ShareImportService(
            backend: backend,
            authState: { .signedIn(user: makeSignedInUser()) }
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
        backend.submitResult = .success(
            ShareImportBackendResponse(
                kind: .created,
                dealRoomId: nil,
                intakeJobId: "job-99"
            )
        )
        let service = ShareImportService(
            backend: backend,
            authState: { .signedIn(user: makeSignedInUser()) }
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
        let service = ShareImportService(
            backend: backend,
            authState: { .signedOut }
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
        backend.submitResult = .success(
            ShareImportBackendResponse(
                kind: .created,
                dealRoomId: nil,
                intakeJobId: "job-resume"
            )
        )

        // Start signed out
        let mutableAuth = MutableAuthState()
        mutableAuth.state = .signedOut
        let service = ShareImportService(
            backend: backend,
            authState: { mutableAuth.state }
        )

        await service.handleSharedURL("https://www.zillow.com/homedetails/xyz")
        guard case .signInRequired = service.state else {
            Issue.record("Expected .signInRequired")
            return
        }

        // Simulate sign-in completing
        mutableAuth.state = .signedIn(user: makeSignedInUser())
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
        let service = ShareImportService(
            backend: backend,
            authState: { .expired }
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
        backend.submitResult = .failure(ShareImportError.notAuthenticated)
        let service = ShareImportService(
            backend: backend,
            authState: { .signedIn(user: makeSignedInUser()) }
        )

        await service.handleSharedURL("https://www.zillow.com/homedetails/abc")

        guard case .sessionExpired = service.state else {
            Issue.record("Expected .sessionExpired")
            return
        }
    }

    // MARK: - Invalid URLs

    @Test("unsupported portal → .invalid(.unsupportedPortal)")
    func testUnsupportedPortal() async {
        let backend = MockShareImportBackend()
        let service = ShareImportService(
            backend: backend,
            authState: { .signedIn(user: makeSignedInUser()) }
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
        let service = ShareImportService(
            backend: backend,
            authState: { .signedIn(user: makeSignedInUser()) }
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
        let service = ShareImportService(
            backend: backend,
            authState: { .signedIn(user: makeSignedInUser()) }
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
        backend.submitResult = .failure(StubImportError(message: "offline"))
        let service = ShareImportService(
            backend: backend,
            authState: { .signedIn(user: makeSignedInUser()) }
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

    // MARK: - Dismiss

    @Test("dismiss clears pendingUrl and returns to idle")
    func testDismiss() async {
        let backend = MockShareImportBackend()
        let service = ShareImportService(
            backend: backend,
            authState: { .signedOut }
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
