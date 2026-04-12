import SwiftUI

/// Root container for an authenticated buyer. Loads deals on appear and
/// switches between loading, empty, error, and active deal tab views.
struct DealTrackerShell: View {

    let user: AuthUser

    @Environment(DealService.self) private var dealService
    @Environment(AuthService.self) private var authService

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
        .task {
            await dealService.loadDeals(for: user.id)
        }
    }

    // MARK: - Account Menu

    @ToolbarContentBuilder
    private var accountMenuToolbar: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            Menu {
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
