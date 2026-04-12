import SwiftUI

/// Placeholder for the authenticated home screen.
/// Will be replaced by deal tracker shell (KIN-795).
struct ContentView: View {

    let user: AuthUser

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "house.fill")
                .font(.system(size: 48))
                .foregroundStyle(Color(hex: 0x1B2B65))
            Text("Welcome, \(user.name)")
                .font(.largeTitle)
                .fontWeight(.bold)
            Text(user.email)
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .padding()
    }
}
