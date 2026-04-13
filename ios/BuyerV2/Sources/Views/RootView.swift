import SwiftUI

struct RootView: View {

    @Environment(AuthService.self) private var authService

    @State private var activeAlert: RootAlert?

    var body: some View {
        let presentation = RootPresentation(authState: authService.state)

        Group {
            switch presentation.surface {
            case .restoring:
                restoringView
            case .signIn:
                SignInView()
            case .authenticated(let user):
                ContentView(user: user, authService: authService)
            }
        }
        .animation(.easeInOut(duration: 0.3), value: authService.state.phase)
        .onAppear {
            activeAlert = presentation.alert
        }
        .onChange(of: authService.state) { _, newState in
            activeAlert = RootPresentation(authState: newState).alert
        }
        .alert(item: $activeAlert) { alert in
            switch alert {
            case .sessionExpired:
                return Alert(
                    title: Text("Session Expired"),
                    message: Text(
                        "Your session has expired. Restore it to continue, or sign in again."
                    ),
                    primaryButton: .default(Text("Restore Session")) {
                        Task { await authService.restoreSession() }
                    },
                    secondaryButton: .destructive(Text("Sign In Again")) {
                        Task { await authService.signOut() }
                    }
                )
            case .authUnavailable:
                return Alert(
                    title: Text("Authentication Unavailable"),
                    message: Text(
                        "Authentication is temporarily unavailable. Please try again in a moment."
                    ),
                    dismissButton: .cancel(Text("Dismiss"))
                )
            }
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

struct RootPresentation: Equatable {
    let surface: Surface
    let alert: RootAlert?

    init(authState: AuthState) {
        switch authState {
        case .restoring:
            self.surface = .restoring
            self.alert = nil
        case .signedOut:
            self.surface = .signIn
            self.alert = nil
        case .signedIn(let user):
            self.surface = .authenticated(user)
            self.alert = nil
        case .expired:
            self.surface = .signIn
            self.alert = .sessionExpired
        case .authUnavailable:
            self.surface = .signIn
            self.alert = .authUnavailable
        }
    }

    enum Surface: Equatable {
        case restoring
        case signIn
        case authenticated(AuthUser)
    }
}

enum RootAlert: String, Identifiable {
    case sessionExpired
    case authUnavailable

    var id: String { rawValue }
}
