import SwiftUI

@main
struct BuyerV2App: App {

    @State private var authService = AuthService()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(authService)
                .task {
                    await authService.initialize()
                }
        }
    }
}
