import SwiftUI

/// Authenticated home screen entry point. Owns the deal-scoped
/// services for the signed-in user and hosts the deal tracker shell.
///
/// The `cacheCoordinator` is warmed from disk on appear so the shell
/// can render any prior-session data before the live fetches return —
/// offline-first UX per KIN-810.
struct ContentView: View {

    let user: AuthUser

    @State private var dealService = DealService()
    @State private var tasksService = DealTasksService()
    @State private var timelineService = DealTimelineService()
    @State private var cacheCoordinator = DealCacheCoordinator()
    @State private var preferencesService = MessagePreferencesService(
        backend: ConvexMessagePreferencesBackend(
            tokenProvider: { await AuthService.loadAccessToken() }
        )
    )

    var body: some View {
        DealTrackerShell(user: user)
            .environment(dealService)
            .environment(tasksService)
            .environment(timelineService)
            .environment(cacheCoordinator)
            .environment(preferencesService)
            .task {
                // Warm from disk cache immediately — the deal tracker
                // shell can render stale-but-usable data while the live
                // fetches kick off in parallel.
                await cacheCoordinator.warmFromCache(userId: user.id)
            }
    }
}
