import SwiftUI

struct RootView: View {

    @Environment(AuthService.self) private var authService

    @State private var showExpiredAlert = false
    @State private var showAuthUnavailableAlert = false

    var body: some View {
        Group {
            switch authService.state {
            case .restoring:
                restoringView
            case .signedOut:
                SignInView()
            case .signedIn(let user):
                ContentView(user: user)
            case .expired:
                // Show sign-in with alert overlay
                SignInView()
                    .onAppear { showExpiredAlert = true }
            case .authUnavailable:
                SignInView()
                    .onAppear { showAuthUnavailableAlert = true }
            }
        }
        .animation(.easeInOut(duration: 0.3), value: authService.state)
        .alert("Session Expired", isPresented: $showExpiredAlert) {
            Button("Sign In Again") {
                Task { await authService.signOut() }
            }
        } message: {
            Text("Your session has expired. Please sign in again.")
        }
        .alert("Authentication Unavailable", isPresented: $showAuthUnavailableAlert) {
            Button("Dismiss", role: .cancel) {}
        } message: {
            Text("Authentication is temporarily unavailable. Please try again in a moment.")
        }
    }

    // MARK: - Restoring

    private var restoringView: some View {
        VStack(spacing: 20) {
            Image(systemName: "house.fill")
                .font(.system(size: 56))
                .foregroundStyle(Color(hex: 0x1B2B65))
            ProgressView()
                .controlSize(.large)
            Text("Loading...")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemBackground))
    }

}
