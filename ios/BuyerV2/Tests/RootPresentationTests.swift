import Testing

@testable import BuyerV2

@Suite("RootPresentation auth shell mapping")
struct RootPresentationTests {

    private let user = AuthUser(
        id: "user-1",
        email: "buyer@example.com",
        name: "Buyer One",
        role: .buyer
    )

    @Test("restoring auth renders restoring surface with no alert")
    func testRestoringPresentation() {
        let presentation = RootPresentation(authState: .restoring)

        #expect(presentation.surface == .restoring)
        #expect(presentation.alert == nil)
    }

    @Test("signed-out auth renders sign-in surface with no alert")
    func testSignedOutPresentation() {
        let presentation = RootPresentation(authState: .signedOut)

        #expect(presentation.surface == .signIn)
        #expect(presentation.alert == nil)
    }

    @Test("signed-in auth renders authenticated surface")
    func testSignedInPresentation() {
        let presentation = RootPresentation(authState: .signedIn(user: user))

        #expect(presentation.surface == .authenticated(user))
        #expect(presentation.alert == nil)
    }

    @Test("expired auth routes to sign-in with session-expired alert")
    func testExpiredPresentation() {
        let presentation = RootPresentation(authState: .expired)

        #expect(presentation.surface == .signIn)
        #expect(presentation.alert == .sessionExpired)
    }

    @Test("auth unavailable routes to sign-in with unavailable alert")
    func testAuthUnavailablePresentation() {
        let presentation = RootPresentation(authState: .authUnavailable)

        #expect(presentation.surface == .signIn)
        #expect(presentation.alert == .authUnavailable)
    }
}
