import SwiftUI

struct RootView: View {

    @Environment(AuthService.self) private var authService

    @State private var showExpiredAlert = false

    var body: some View {
        Group {
            switch authService.state {
            case .restoring:
                restoringView
            case .signedOut:
                SignInView()
            case .signedIn(let user):
                authenticatedView(user: user)
            case .expired:
                // Show sign-in with alert overlay
                SignInView()
                    .onAppear { showExpiredAlert = true }
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

    // MARK: - Authenticated (stub)

    private func authenticatedView(user: AuthUser) -> some View {
        VStack(spacing: 24) {
            Image(systemName: "person.circle.fill")
                .font(.system(size: 64))
                .foregroundStyle(Color(hex: 0x1B2B65))

            VStack(spacing: 6) {
                Text(user.name)
                    .font(.title2)
                    .fontWeight(.semibold)
                Text(user.email)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Text(user.role.rawValue.capitalized)
                    .font(.caption)
                    .fontWeight(.medium)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 4)
                    .background(Color(hex: 0x1B2B65).opacity(0.1))
                    .foregroundStyle(Color(hex: 0x1B2B65))
                    .clipShape(Capsule())
            }

            Button {
                Task { await authService.signOut() }
            } label: {
                Text("Sign Out")
                    .fontWeight(.medium)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
            }
            .buttonStyle(.bordered)
            .tint(Color(hex: 0xFF6B4A))
            .padding(.horizontal, 40)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemBackground))
    }
}

