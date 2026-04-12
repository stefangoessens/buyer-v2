import SwiftUI

/// SwiftUI surface for buyer-facing message preferences. Reads the
/// typed `MessagePreferences` state from `MessagePreferencesService`,
/// writes updates through the service, and renders an explicit screen
/// for each display branch (`loading`, `content`, `error`, `signedOut`)
/// produced by `PreferencesViewModel`.
struct PreferencesView: View {

    @Environment(MessagePreferencesService.self) private var service
    @Environment(AuthService.self) private var authService
    @Environment(\.dismiss) private var dismiss

    // Local snapshots so an optimistic service.update() rolling back
    // keeps the screen in the "content + error banner" shape rather
    // than jumping straight to the hard error state. The boolean gate
    // is driven by whether we've ever seen a successful `.loaded`,
    // NOT by comparing the cached prefs to `.default` — otherwise a
    // first-time user whose first load returned `(.default, false)`
    // would fall through to the hard error screen on their first
    // failed write (codex P2 on PR #83).
    @State private var lastKnownPreferences: MessagePreferences = .default
    @State private var lastKnownHasStored: Bool = false
    @State private var hasSuccessfullyLoaded: Bool = false

    var body: some View {
        NavigationStack {
            Group {
                switch currentDisplay() {
                case .loading:
                    loadingView
                case .content(let prefs, let hasStored, let saveError):
                    contentView(preferences: prefs, hasStored: hasStored, saveError: saveError)
                case .error(let message):
                    errorView(message: message)
                case .signedOut:
                    signedOutView
                }
            }
            .navigationTitle("Preferences")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Done") { dismiss() }
                        .foregroundStyle(Color(hex: 0x1B2B65))
                }
            }
        }
        .task {
            await service.load()
        }
        .onChange(of: service.state) { _, newState in
            // Cache the latest loaded snapshot so a rollback still
            // renders toggles instead of a blank error screen.
            if case .loaded(let prefs, let hasStored) = newState {
                lastKnownPreferences = prefs
                lastKnownHasStored = hasStored
                hasSuccessfullyLoaded = true
            }
        }
    }

    // MARK: - View-model glue

    private func currentDisplay() -> PreferencesDisplayState {
        let vm = PreferencesViewModel(
            authState: authService.state,
            serviceState: service.state
        )
        return vm.displayWithOverlay(
            lastKnownPreferences: lastKnownPreferences,
            lastKnownHasStored: lastKnownHasStored,
            hasSuccessfullyLoaded: hasSuccessfullyLoaded
        )
    }

    // MARK: - Loading

    private var loadingView: some View {
        VStack(spacing: 16) {
            ProgressView()
                .controlSize(.large)
                .tint(Color(hex: 0x1B2B65))
            Text("Loading preferences…")
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemBackground))
    }

    // MARK: - Content

    private func contentView(
        preferences: MessagePreferences,
        hasStored: Bool,
        saveError: String?
    ) -> some View {
        Form {
            if let saveError {
                Section {
                    saveErrorBanner(message: saveError)
                        .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                        .listRowBackground(Color(hex: 0xFFF4F0))
                }
            }

            if !hasStored {
                Section {
                    firstTimeNudge
                        .listRowInsets(EdgeInsets(top: 12, leading: 16, bottom: 12, trailing: 16))
                        .listRowBackground(Color(hex: 0xF4F6FB))
                }
            }

            Section {
                channelToggle(
                    title: "Email",
                    subtitle: "Deal updates, receipts, and previews",
                    icon: "envelope.fill",
                    isOn: preferences.channels.email,
                    set: { value in
                        await service.update(MessagePreferencesPatch(emailEnabled: value))
                    }
                )
                channelToggle(
                    title: "SMS",
                    subtitle: "Urgent tour and offer reminders",
                    icon: "message.fill",
                    isOn: preferences.channels.sms,
                    set: { value in
                        await service.update(MessagePreferencesPatch(smsEnabled: value))
                    }
                )
                channelToggle(
                    title: "Push",
                    subtitle: "Notifications to this device",
                    icon: "bell.badge.fill",
                    isOn: preferences.channels.push,
                    set: { value in
                        await service.update(MessagePreferencesPatch(pushEnabled: value))
                    }
                )
                channelToggle(
                    title: "In-App",
                    subtitle: "Messages visible inside the app",
                    icon: "tray.fill",
                    isOn: preferences.channels.inApp,
                    set: { value in
                        await service.update(MessagePreferencesPatch(inAppEnabled: value))
                    }
                )
            } header: {
                sectionHeader("Delivery channels")
            } footer: {
                Text("A message is delivered only when both its channel and its category are turned on.")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
            }

            Section {
                categoryToggle(
                    title: "Transactional",
                    subtitle: "Receipts, signed documents, closing updates",
                    isOn: preferences.categories.transactional,
                    set: { value in
                        await service.update(MessagePreferencesPatch(transactionalEnabled: value))
                    }
                )
                categoryToggle(
                    title: "Tours",
                    subtitle: "Tour confirmations, reminders, follow-ups",
                    isOn: preferences.categories.tours,
                    set: { value in
                        await service.update(MessagePreferencesPatch(toursEnabled: value))
                    }
                )
                categoryToggle(
                    title: "Offers",
                    subtitle: "Offer status, counteroffers, negotiation",
                    isOn: preferences.categories.offers,
                    set: { value in
                        await service.update(MessagePreferencesPatch(offersEnabled: value))
                    }
                )
                categoryToggle(
                    title: "Updates",
                    subtitle: "General product and deal room updates",
                    isOn: preferences.categories.updates,
                    set: { value in
                        await service.update(MessagePreferencesPatch(updatesEnabled: value))
                    }
                )
                categoryToggle(
                    title: "Marketing",
                    subtitle: "Market insights, community launches",
                    isOn: preferences.categories.marketing,
                    set: { value in
                        await service.update(MessagePreferencesPatch(marketingEnabled: value))
                    }
                )
            } header: {
                sectionHeader("Categories")
            }

            Section {
                Button {
                    Task { await service.optOutAll() }
                } label: {
                    Label("Turn off all notifications", systemImage: "bell.slash.fill")
                        .foregroundStyle(Color(hex: 0xFF6B4A))
                }
                .accessibilityIdentifier("preferences.optOutAll")

                Button {
                    Task { await service.resetToDefaults() }
                } label: {
                    Label("Reset to defaults", systemImage: "arrow.counterclockwise")
                        .foregroundStyle(Color(hex: 0x1B2B65))
                }
                .accessibilityIdentifier("preferences.reset")
            } header: {
                sectionHeader("Bulk actions")
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color(.systemGroupedBackground))
    }

    // MARK: - Error

    private func errorView(message: String) -> some View {
        VStack(spacing: 20) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 48))
                .foregroundStyle(Color(hex: 0xFF6B4A))

            VStack(spacing: 8) {
                Text("Couldn't load preferences")
                    .font(.system(size: 20, weight: .bold))
                    .foregroundStyle(Color(hex: 0x1B2B65))
                Text(message)
                    .font(.system(size: 14))
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }

            Button {
                Task { await service.load() }
            } label: {
                Text("Try again")
                    .fontWeight(.semibold)
                    .frame(maxWidth: 220)
                    .padding(.vertical, 12)
            }
            .buttonStyle(.borderedProminent)
            .tint(Color(hex: 0x1B2B65))
            .accessibilityIdentifier("preferences.retry")
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemBackground))
    }

    // MARK: - Signed out

    private var signedOutView: some View {
        VStack(spacing: 20) {
            Image(systemName: "person.crop.circle.badge.exclamationmark")
                .font(.system(size: 48))
                .foregroundStyle(Color(hex: 0x1B2B65))

            VStack(spacing: 8) {
                Text("Sign in to manage preferences")
                    .font(.system(size: 20, weight: .bold))
                    .foregroundStyle(Color(hex: 0x1B2B65))
                Text("Your notification settings are tied to your buyer account.")
                    .font(.system(size: 14))
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }

            Button {
                dismiss()
                Task { await authService.signOut() }
            } label: {
                Text("Sign in again")
                    .fontWeight(.semibold)
                    .frame(maxWidth: 220)
                    .padding(.vertical, 12)
            }
            .buttonStyle(.borderedProminent)
            .tint(Color(hex: 0x1B2B65))
            .accessibilityIdentifier("preferences.signInAgain")
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemBackground))
    }

    // MARK: - Cells

    private func channelToggle(
        title: String,
        subtitle: String,
        icon: String,
        isOn: Bool,
        set: @escaping (Bool) async -> Void
    ) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Color(hex: 0x1B2B65))
                .frame(width: 26, height: 26)
                .background(Color(hex: 0xF4F6FB))
                .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Color(hex: 0x1B2B65))
                Text(subtitle)
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
            }

            Spacer(minLength: 8)

            Toggle("", isOn: Binding(
                get: { isOn },
                set: { newValue in Task { await set(newValue) } }
            ))
            .labelsHidden()
            .tint(Color(hex: 0x1B2B65))
            .accessibilityLabel(title)
        }
        .padding(.vertical, 2)
    }

    private func categoryToggle(
        title: String,
        subtitle: String,
        isOn: Bool,
        set: @escaping (Bool) async -> Void
    ) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Color(hex: 0x1B2B65))
                Text(subtitle)
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
            }

            Spacer(minLength: 8)

            Toggle("", isOn: Binding(
                get: { isOn },
                set: { newValue in Task { await set(newValue) } }
            ))
            .labelsHidden()
            .tint(Color(hex: 0x1B2B65))
            .accessibilityLabel(title)
        }
        .padding(.vertical, 2)
    }

    // MARK: - Decorations

    private var firstTimeNudge: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "sparkles")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Color(hex: 0x1B2B65))
            VStack(alignment: .leading, spacing: 2) {
                Text("You're using the defaults")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Color(hex: 0x1B2B65))
                Text("Adjust any toggle to save your preferences.")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 4)
        }
    }

    private func saveErrorBanner(message: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "exclamationmark.circle.fill")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Color(hex: 0xFF6B4A))
            VStack(alignment: .leading, spacing: 2) {
                Text("Couldn't save — we reverted the change")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Color(hex: 0xFF6B4A))
                Text(message)
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 4)
        }
        .accessibilityIdentifier("preferences.saveErrorBanner")
    }

    private func sectionHeader(_ title: String) -> some View {
        Text(title)
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(Color(hex: 0x1B2B65).opacity(0.75))
            .textCase(.uppercase)
    }
}
