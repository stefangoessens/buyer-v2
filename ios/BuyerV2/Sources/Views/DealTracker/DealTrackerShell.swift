import SwiftUI

/// Root container for an authenticated buyer. Loads deals on appear and
/// switches between loading, empty, error, and active deal tab views.
struct DealTrackerShell: View {

    let user: AuthUser

    @Environment(DealService.self) private var dealService
    @Environment(AuthService.self) private var authService
    @Environment(DealTasksService.self) private var tasksService
    @Environment(DealTimelineService.self) private var timelineService
    @Environment(DealCacheCoordinator.self) private var cacheCoordinator

    @State private var isShowingPreferences = false

    var body: some View {
        Group {
            switch dealService.state {
            case .loading:
                loadingView
            case .noDeal:
                NavigationStack {
                    NoDealView()
                        .navigationTitle("buyer-v2")
                        .navigationBarTitleDisplayMode(.inline)
                        .toolbar { accountMenuToolbar }
                }
            case .activeDeal(let deal):
                activeDealView(deal: deal)
            case .error(let message):
                NavigationStack {
                    errorView(message: message)
                        .navigationTitle("buyer-v2")
                        .navigationBarTitleDisplayMode(.inline)
                        .toolbar { accountMenuToolbar }
                }
            }
        }
        .animation(.easeInOut(duration: 0.25), value: dealService.state)
        .sheet(isPresented: $isShowingPreferences) {
            PreferencesView()
        }
        .task {
            await dealService.loadDeals(for: user.id)
        }
        // Drive the tasks/timeline services whenever the deal state changes —
        // loading tasks/events when we resolve to an active deal, flipping
        // to signed-out/no-active-deal otherwise so the tab views render the
        // correct placeholder without ad hoc branching.
        .onChange(of: dealService.state) { _, newState in
            Task {
                await syncChildServices(with: newState)
                await persistSnapshotIfReady()
            }
        }
        // Persist a fresh snapshot to the offline-first cache whenever
        // the child services settle on live data. The coordinator writes
        // DealSummary + tasks + events with a lastSyncedAt stamp so a
        // future cold start can warm the shell from disk.
        .onChange(of: tasksService.state) { _, _ in
            Task { await persistSnapshotIfReady() }
        }
        .onChange(of: timelineService.state) { _, _ in
            Task { await persistSnapshotIfReady() }
        }
        // Clear the cache when the user signs out or the session expires
        // so no prior-session data survives into a different sign-in.
        .onChange(of: authService.state) { _, newState in
            Task {
                switch newState {
                case .signedOut, .expired:
                    await cacheCoordinator.clearForSignOut(userId: user.id)
                case .signedIn, .restoring:
                    break
                }
            }
        }
    }

    /// Persist a unified snapshot to the cache when all three services
    /// have settled on live data. We don't cache partial state: loading /
    /// stale / error states all short-circuit.
    private func persistSnapshotIfReady() async {
        // Deal: must be in a terminal active/empty state
        let dealSnapshot: DealSummary?
        switch dealService.state {
        case .activeDeal(let deal):
            dealSnapshot = deal
        case .noDeal:
            dealSnapshot = nil
        case .loading, .error:
            return
        }

        // Tasks: only cache from loaded/empty
        let tasksSnapshot: [DealTask]
        switch tasksService.state {
        case .loaded(let tasks):
            tasksSnapshot = tasks
        case .noTasks, .noActiveDeal:
            tasksSnapshot = []
        case .idle, .loading, .signedOut, .stale, .error:
            return
        }

        // Timeline: same pattern
        let eventsSnapshot: [MilestoneEvent]
        switch timelineService.state {
        case .loaded(let events):
            eventsSnapshot = events
        case .noEvents, .noActiveDeal:
            eventsSnapshot = []
        case .idle, .loading, .signedOut, .stale, .error:
            return
        }

        await cacheCoordinator.applyLiveSnapshot(
            userId: user.id,
            deal: dealSnapshot,
            tasks: tasksSnapshot,
            events: eventsSnapshot
        )
    }

    private func syncChildServices(with state: DealTrackerState) async {
        switch state {
        case .activeDeal(let deal):
            await tasksService.loadTasks(dealRoomId: deal.id)
            await timelineService.loadEvents(dealRoomId: deal.id)
        case .noDeal:
            tasksService.handleNoActiveDeal()
            timelineService.handleNoActiveDeal()
        case .error, .loading:
            break
        }
    }

    // MARK: - Account Menu

    @ToolbarContentBuilder
    private var accountMenuToolbar: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            Menu {
                Button {
                    isShowingPreferences = true
                } label: {
                    Label("Preferences", systemImage: "slider.horizontal.3")
                }

                Divider()

                Button(role: .destructive) {
                    Task { await authService.signOut() }
                } label: {
                    Label("Sign Out", systemImage: "rectangle.portrait.and.arrow.right")
                }
            } label: {
                Image(systemName: "person.circle")
                    .font(.system(size: 20))
                    .foregroundStyle(Color(hex: 0x1B2B65))
            }
            .accessibilityLabel("Account menu")
        }
    }

    // MARK: - Loading

    private var loadingView: some View {
        VStack(spacing: 24) {
            Image(systemName: "house.fill")
                .font(.system(size: 56, weight: .regular))
                .foregroundStyle(Color(hex: 0x1B2B65))

            ProgressView()
                .controlSize(.large)
                .tint(Color(hex: 0x1B2B65))

            Text("Loading your deal…")
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemBackground))
    }

    // MARK: - Active Deal (Tabs)

    private func activeDealView(deal: DealSummary) -> some View {
        TabView {
            NavigationStack {
                DealStatusView(deal: deal)
            }
            .tabItem {
                Label("Status", systemImage: "house.fill")
            }

            NavigationStack {
                DealTasksView()
                    .navigationTitle("Tasks")
            }
            .tabItem {
                Label("Tasks", systemImage: "checklist")
            }

            NavigationStack {
                DealTimelineView()
                    .navigationTitle("Timeline")
            }
            .tabItem {
                Label("Timeline", systemImage: "clock.arrow.circlepath")
            }
        }
        .tint(Color(hex: 0x1B2B65))
    }

    // MARK: - Error

    private func errorView(message: String) -> some View {
        VStack(spacing: 20) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 56, weight: .regular))
                .foregroundStyle(Color(hex: 0xFF6B4A))

            VStack(spacing: 8) {
                Text("Something Went Wrong")
                    .font(.system(size: 22, weight: .bold))
                    .foregroundStyle(Color(hex: 0x1B2B65))

                Text(message)
                    .font(.system(size: 15))
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }

            Button {
                Task { await dealService.refresh() }
            } label: {
                Text("Try Again")
                    .fontWeight(.semibold)
                    .frame(maxWidth: 220)
                    .padding(.vertical, 14)
            }
            .buttonStyle(.borderedProminent)
            .tint(Color(hex: 0xFF6B4A))
            .padding(.top, 8)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemBackground))
    }
}
