import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

struct PreferencesView: View {

    @Environment(MessagePreferencesService.self) private var service
    @Environment(AuthService.self) private var authService
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL

    private static let timezones = TimeZone.knownTimeZoneIdentifiers.sorted()

    var body: some View {
        NavigationStack {
            Group {
                switch currentDisplay() {
                case .loading:
                    loadingView
                case .content(let prefs, let hasStored, let saveState):
                    contentView(preferences: prefs, hasStored: hasStored, saveState: saveState)
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
        .task {
            await service.refreshPushPermissionState()
        }
    }

    // MARK: - View-model glue

    private func currentDisplay() -> PreferencesDisplayState {
        let vm = PreferencesViewModel(
            authState: authService.state,
            serviceState: service.state,
            saveState: service.saveState
        )
        return vm.display()
    }

    // MARK: - Loading / error / signed out

    private var loadingView: some View {
        VStack(spacing: 16) {
            ProgressView()
                .controlSize(.large)
                .tint(Color(hex: 0x1B2B65))
            Text("Loading preferences...")
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemBackground))
    }

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

    // MARK: - Content

    private func contentView(
        preferences: MessagePreferences,
        hasStored: Bool,
        saveState: MessagePreferencesSaveState
    ) -> some View {
        Form {
            if case .saving = saveState {
                Section {
                    savingBanner
                }
            } else if case .error(let message) = saveState {
                Section {
                    saveErrorBanner(message: message)
                }
            }

            if !hasStored {
                Section {
                    firstTimeNudge
                }
            }

            Section {
                headerCard
            }

            if service.pushPermissionState == .denied {
                Section {
                    pushPermissionDeniedCard
                } header: {
                    sectionHeader("Push access")
                }
            }

            quietHoursSection(preferences: preferences)

            ForEach(MessageCategory.allCases, id: \.rawValue) { category in
                categorySection(category: category, preferences: preferences)
            }

            Section {
                Button {
                    Task { await service.disableAllOptionalNotifications() }
                } label: {
                    Label("Turn off optional notifications", systemImage: "bell.slash.fill")
                        .foregroundStyle(Color(hex: 0xFF6B4A))
                }
                .accessibilityIdentifier("preferences.disableOptional")

                Button {
                    Task { await service.resetToDefaults() }
                } label: {
                    Label("Reset to defaults", systemImage: "arrow.counterclockwise")
                        .foregroundStyle(Color(hex: 0x1B2B65))
                }
                .accessibilityIdentifier("preferences.reset")
            } header: {
                sectionHeader("Bulk actions")
            } footer: {
                Text("Safety alerts stay on even when you turn optional notifications off.")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color(.systemGroupedBackground))
    }

    @ViewBuilder
    private func quietHoursSection(preferences: MessagePreferences) -> some View {
        let quietHours = preferences.quietHours ?? QuietHours.suggestedDefault

        Section {
            Toggle(
                "Hold push and SMS overnight",
                isOn: Binding(
                    get: { preferences.quietHours != nil },
                    set: { enabled in
                        Task { await service.setQuietHoursEnabled(enabled) }
                    }
                )
            )
            .tint(Color(hex: 0x1B2B65))

            if preferences.quietHours != nil {
                DatePicker(
                    "Start",
                    selection: Binding(
                        get: { timeDate(from: quietHours.start) },
                        set: { date in
                            Task { await service.setQuietHours(start: timeString(from: date)) }
                        }
                    ),
                    displayedComponents: .hourAndMinute
                )

                DatePicker(
                    "End",
                    selection: Binding(
                        get: { timeDate(from: quietHours.end) },
                        set: { date in
                            Task { await service.setQuietHours(end: timeString(from: date)) }
                        }
                    ),
                    displayedComponents: .hourAndMinute
                )

                Picker(
                    "Timezone",
                    selection: Binding(
                        get: { quietHours.timezone },
                        set: { timezone in
                            Task { await service.setQuietHours(timezone: timezone) }
                        }
                    )
                ) {
                    ForEach(Self.timezones, id: \.self) { timezone in
                        Text(timezone).tag(timezone)
                    }
                }

                HStack(alignment: .top, spacing: 10) {
                    Image(systemName: quietHours.crossesMidnight ? "moon.stars.fill" : "clock.fill")
                        .foregroundStyle(Color(hex: 0x1B2B65))
                    Text(
                        quietHours.crossesMidnight
                            ? "This quiet-hours window crosses midnight."
                            : "This quiet-hours window stays within the same day."
                    )
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                }
                .padding(.top, 4)
            }
        } header: {
            sectionHeader("Quiet hours")
        } footer: {
            Text("Push and SMS are held until quiet hours end. Email, in-app, and safety alerts still deliver.")
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private func categorySection(
        category: MessageCategory,
        preferences: MessagePreferences
    ) -> some View {
        Section {
            ForEach(MessageChannel.allCases, id: \.rawValue) { channel in
                let row = preferences.matrix[category]
                preferenceRow(
                    category: category,
                    channel: channel,
                    isOn: row.isEnabled(channel),
                    isDisabled: category.isMandatory || pushToggleBlocked(channel: channel),
                    subtitle: toggleSubtitle(category: category, channel: channel)
                )
            }
        } header: {
            VStack(alignment: .leading, spacing: 6) {
                sectionHeader(category.title)
                Text(category.subtitle)
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
            }
        } footer: {
            if category == .safety {
                Text("Wire-fraud warnings and time-critical closing alerts cannot be disabled by preference. This is a legal and safety requirement.")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
            } else if category == .marketing {
                Text("Marketing stays explicit opt-in. It does not inherit transactional defaults.")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
            } else if category == .marketUpdates {
                Text("Legacy \"updates\" preferences migrate here as market updates.")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
            } else if category == .tours {
                Text("You can also text STOP to any message to stop all SMS.")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func preferenceRow(
        category: MessageCategory,
        channel: MessageChannel,
        isOn: Bool,
        isDisabled: Bool,
        subtitle: String
    ) -> some View {
        HStack(spacing: 12) {
            Image(systemName: category.isMandatory ? "lock.fill" : channel.icon)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(category.isMandatory ? Color(hex: 0xFF6B4A) : Color(hex: 0x1B2B65))
                .frame(width: 26, height: 26)
                .background(
                    (category.isMandatory ? Color(hex: 0xFFF4F0) : Color(hex: 0xF4F6FB))
                )
                .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))

            VStack(alignment: .leading, spacing: 2) {
                Text(channel.title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Color(hex: 0x1B2B65))
                Text(subtitle)
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
            }

            Spacer(minLength: 8)

            Toggle(
                "",
                isOn: Binding(
                    get: { category.isMandatory ? true : isOn },
                    set: { value in
                        Task {
                            await service.setPreference(
                                category: category,
                                channel: channel,
                                isEnabled: value
                            )
                        }
                    }
                )
            )
            .labelsHidden()
            .tint(Color(hex: 0x1B2B65))
            .disabled(isDisabled)
            .accessibilityLabel("\(category.title) \(channel.title)")
        }
        .padding(.vertical, 2)
    }

    // MARK: - Cards

    private var headerCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Choose how buyer-v2 reaches you.")
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(Color(hex: 0x1B2B65))
            Text("Each category has its own delivery matrix. Safety alerts stay on so you still get wire-fraud warnings and closing-day alerts.")
                .font(.system(size: 13))
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 4)
    }

    private var pushPermissionDeniedCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                Image(systemName: "bell.slash.fill")
                    .foregroundStyle(Color(hex: 0xFF6B4A))
                Text("Push disabled in iOS Settings")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Color(hex: 0x1B2B65))
            }

            Text("Your buyer-v2 push preferences can stay enabled, but iOS will still block delivery until notifications are turned back on for this app.")
                .font(.system(size: 13))
                .foregroundStyle(.secondary)

            Button("Open Settings") {
                openAppSettings()
            }
            .buttonStyle(.borderedProminent)
            .tint(Color(hex: 0x1B2B65))
            .accessibilityIdentifier("preferences.openSettings")
        }
        .padding(.vertical, 4)
    }

    private var firstTimeNudge: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Review your defaults")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Color(hex: 0x1B2B65))
            Text("Operational alerts start on. Marketing and market updates stay off until you opt in.")
                .font(.system(size: 13))
                .foregroundStyle(.secondary)
        }
    }

    private var savingBanner: some View {
        HStack(spacing: 10) {
            ProgressView()
                .controlSize(.small)
                .tint(Color(hex: 0x1B2B65))
            Text("Saving your latest changes...")
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(Color(hex: 0x1B2B65))
        }
        .padding(.vertical, 4)
    }

    private func saveErrorBanner(message: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("We couldn't save that change.")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Color(hex: 0x9C3A1C))
            Text(message)
                .font(.system(size: 12))
                .foregroundStyle(Color(hex: 0x9C3A1C))
        }
        .padding(.vertical, 4)
    }

    // MARK: - Helpers

    private func sectionHeader(_ title: String) -> some View {
        Text(title)
            .font(.system(size: 12, weight: .semibold))
            .textCase(.uppercase)
            .foregroundStyle(.secondary)
    }

    private func toggleSubtitle(
        category: MessageCategory,
        channel: MessageChannel
    ) -> String {
        if category.isMandatory {
            if channel == .push, service.pushPermissionState == .denied {
                return "Enabled in buyer-v2, but iOS Settings are blocking delivery."
            }
            return "Always on for wire-fraud warnings and time-critical closing alerts."
        }

        if channel == .push {
            switch service.pushPermissionState {
            case .denied:
                return "Blocked by iOS Settings on this device."
            case .unknown:
                return "App-level setting. iOS permission is still undecided."
            case .allowed:
                return channel.subtitle
            }
        }

        return channel.subtitle
    }

    private func pushToggleBlocked(channel: MessageChannel) -> Bool {
        channel == .push && service.pushPermissionState == .denied
    }

    private func timeDate(from hhmm: String) -> Date {
        let parts = hhmm.split(separator: ":")
        guard parts.count == 2,
              let hour = Int(parts[0]),
              let minute = Int(parts[1]),
              (0...23).contains(hour),
              (0...59).contains(minute)
        else {
            return Date()
        }

        let calendar = Calendar(identifier: .gregorian)
        return calendar.date(
            bySettingHour: hour,
            minute: minute,
            second: 0,
            of: Date()
        ) ?? Date()
    }

    private func timeString(from date: Date) -> String {
        let components = Calendar(identifier: .gregorian).dateComponents(
            [.hour, .minute],
            from: date
        )
        let hour = components.hour ?? 0
        let minute = components.minute ?? 0
        return String(format: "%02d:%02d", hour, minute)
    }

    private func openAppSettings() {
        #if canImport(UIKit)
        guard let url = URL(string: UIApplication.openSettingsURLString) else {
            return
        }
        openURL(url)
        #endif
    }
}
