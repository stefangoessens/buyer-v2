import SwiftUI

struct SignInView: View {

    @Environment(AuthService.self) private var authService

    @State private var email = ""
    @State private var password = ""
    @State private var isLoading = false
    @State private var errorMessage: String?

    var body: some View {
        VStack(spacing: 32) {
            Spacer()

            // Logo + title
            VStack(spacing: 12) {
                Image(systemName: "house.fill")
                    .font(.system(size: 56))
                    .foregroundStyle(Color(hex: 0x1B2B65))
                Text("buyer-v2")
                    .font(.largeTitle)
                    .fontWeight(.bold)
                    .foregroundStyle(Color(hex: 0x1B2B65))
                Text("AI-native Florida buyer brokerage")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            // Form fields
            VStack(spacing: 16) {
                TextField("Email", text: $email)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .padding(14)
                    .background(Color(.secondarySystemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 6))

                SecureField("Password", text: $password)
                    .textContentType(.password)
                    .padding(14)
                    .background(Color(.secondarySystemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 6))
            }
            .padding(.horizontal, 24)

            // Error message
            if let errorMessage {
                Text(errorMessage)
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 24)
            }

            // Sign in button
            Button {
                Task { await signIn() }
            } label: {
                Group {
                    if isLoading {
                        ProgressView()
                            .tint(.white)
                    } else {
                        Text("Sign In")
                            .fontWeight(.semibold)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
            }
            .buttonStyle(.borderedProminent)
            .tint(Color(hex: 0xFF6B4A))
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .padding(.horizontal, 24)
            .disabled(isLoading)

            Spacer()
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemBackground))
    }

    // MARK: - Actions

    private func signIn() async {
        errorMessage = nil

        guard !email.trimmingCharacters(in: .whitespaces).isEmpty else {
            errorMessage = "Please enter your email address."
            return
        }
        guard !password.isEmpty else {
            errorMessage = "Please enter your password."
            return
        }

        isLoading = true
        defer { isLoading = false }

        do {
            try await authService.signIn(email: email, password: password)
        } catch {
            errorMessage = "Sign in failed. Please check your credentials."
        }
    }
}
