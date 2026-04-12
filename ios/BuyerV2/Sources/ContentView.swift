import SwiftUI

/// Authenticated home screen entry point. Owns the deal-scoped
/// services for the signed-in user and hosts the deal tracker shell.
struct ContentView: View {

    let user: AuthUser

    @State private var dealService = DealService()
    @State private var tasksService = DealTasksService()
    @State private var timelineService = DealTimelineService()

    var body: some View {
        DealTrackerShell(user: user)
            .environment(dealService)
            .environment(tasksService)
            .environment(timelineService)
    }
}
