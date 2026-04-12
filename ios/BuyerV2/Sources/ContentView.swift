import SwiftUI

/// Authenticated home screen entry point. Owns the `DealService`
/// instance for the signed-in user and hosts the deal tracker shell.
struct ContentView: View {

    let user: AuthUser

    @State private var dealService = DealService()

    var body: some View {
        DealTrackerShell(user: user)
            .environment(dealService)
    }
}
