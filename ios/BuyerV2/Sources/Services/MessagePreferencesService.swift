import Foundation
import Observation
import UserNotifications

// MARK: - Categories & Channels

enum MessageCategory: String, Sendable, Codable, CaseIterable {
    case transactional
    case tours
    case offers
    case closing
    case disclosures
    case marketUpdates = "market_updates"
    case marketing
    case safety

    var title: String {
        switch self {
        case .transactional: return "Transactional"
        case .tours: return "Tours"
        case .offers: return "Offers"
        case .closing: return "Closing"
        case .disclosures: return "Disclosures"
        case .marketUpdates: return "Market updates"
        case .marketing: return "Marketing"
        case .safety: return "Safety"
        }
    }

    var subtitle: String {
        switch self {
        case .transactional:
            return "Receipts, account notices, and must-see account changes."
        case .tours:
            return "Tour confirmations, reminders, and schedule changes."
        case .offers:
            return "Offer activity, counters, and negotiation updates."
        case .closing:
            return "Closing milestones, deadlines, and final prep."
        case .disclosures:
            return "Seller disclosures, document requests, and signatures."
        case .marketUpdates:
            return "Price drops, status changes, and market movement."
        case .marketing:
            return "Optional launches, insights, and education."
        case .safety:
            return "Wire-fraud warnings and time-critical closing alerts."
        }
    }

    var isMandatory: Bool {
        self == .safety
    }
}

enum MessageChannel: String, Sendable, Codable, CaseIterable {
    case email
    case sms
    case push
    case inApp = "in_app"

    var title: String {
        switch self {
        case .email: return "Email"
        case .sms: return "SMS"
        case .push: return "Push"
        case .inApp: return "In-app"
        }
    }

    var subtitle: String {
        switch self {
        case .email: return "Messages to your inbox."
        case .sms: return "Text alerts for time-sensitive updates."
        case .push: return "Notifications on this iPhone."
        case .inApp: return "Visible inside buyer-v2."
        }
    }

    var icon: String {
        switch self {
        case .email: return "envelope.fill"
        case .sms: return "message.fill"
        case .push: return "bell.badge.fill"
        case .inApp: return "tray.fill"
        }
    }
}

// MARK: - Legacy migration types

struct LegacyChannelEnablement: Sendable, Codable, Equatable {
    var email: Bool
    var sms: Bool
    var push: Bool
    var inApp: Bool

    enum CodingKeys: String, CodingKey {
        case email
        case sms
        case push
        case inApp = "in_app"
    }
}

struct LegacyCategoryEnablement: Sendable, Codable, Equatable {
    var transactional: Bool
    var tours: Bool
    var offers: Bool
    var updates: Bool
    var marketing: Bool
}

struct LegacyMessagePreferences: Sendable, Codable, Equatable {
    var channels: LegacyChannelEnablement
    var categories: LegacyCategoryEnablement
}

// MARK: - Matrix model

struct MessageChannelPreferences: Sendable, Codable, Equatable {
    var email: Bool
    var sms: Bool
    var push: Bool
    var inApp: Bool

    enum CodingKeys: String, CodingKey {
        case email
        case sms
        case push
        case inApp = "in_app"
    }

    static let allEnabled = MessageChannelPreferences(
        email: true,
        sms: true,
        push: true,
        inApp: true
    )

    static let allDisabled = MessageChannelPreferences(
        email: false,
        sms: false,
        push: false,
        inApp: false
    )

    func isEnabled(_ channel: MessageChannel) -> Bool {
        switch channel {
        case .email: return email
        case .sms: return sms
        case .push: return push
        case .inApp: return inApp
        }
    }

    mutating func set(_ channel: MessageChannel, to enabled: Bool) {
        switch channel {
        case .email: email = enabled
        case .sms: sms = enabled
        case .push: push = enabled
        case .inApp: inApp = enabled
        }
    }
}

struct MessagePreferenceMatrix: Sendable, Codable, Equatable {
    var transactional: MessageChannelPreferences
    var tours: MessageChannelPreferences
    var offers: MessageChannelPreferences
    var closing: MessageChannelPreferences
    var disclosures: MessageChannelPreferences
    var marketUpdates: MessageChannelPreferences
    var marketing: MessageChannelPreferences
    var safety: MessageChannelPreferences

    enum CodingKeys: String, CodingKey {
        case transactional
        case tours
        case offers
        case closing
        case disclosures
        case marketUpdates = "market_updates"
        case marketing
        case safety
    }

    static let `default` = MessagePreferenceMatrix(
        transactional: .allEnabled,
        tours: .allEnabled,
        offers: .allEnabled,
        closing: .allEnabled,
        disclosures: .allEnabled,
        marketUpdates: .allDisabled,
        marketing: .allDisabled,
        safety: .allEnabled
    )

    subscript(category: MessageCategory) -> MessageChannelPreferences {
        get {
            switch category {
            case .transactional: return transactional
            case .tours: return tours
            case .offers: return offers
            case .closing: return closing
            case .disclosures: return disclosures
            case .marketUpdates: return marketUpdates
            case .marketing: return marketing
            case .safety: return safety
            }
        }
        set {
            switch category {
            case .transactional: transactional = newValue
            case .tours: tours = newValue
            case .offers: offers = newValue
            case .closing: closing = newValue
            case .disclosures: disclosures = newValue
            case .marketUpdates: marketUpdates = newValue
            case .marketing: marketing = newValue
            case .safety: safety = newValue
            }
        }
    }
}

struct QuietHours: Sendable, Codable, Equatable {
    var start: String
    var end: String
    var timezone: String

    static let suggestedDefault = QuietHours(
        start: "21:00",
        end: "08:00",
        timezone: "America/New_York"
    )!

    init?(start: String, end: String, timezone: String) {
        guard Self.isValidTime(start),
              Self.isValidTime(end),
              TimeZone(identifier: timezone) != nil
        else {
            return nil
        }
        self.start = start
        self.end = end
        self.timezone = timezone
    }

    var crossesMidnight: Bool {
        guard let startMinutes = Self.minutes(from: start),
              let endMinutes = Self.minutes(from: end)
        else {
            return false
        }
        return startMinutes >= endMinutes
    }

    func replacing(
        start: String? = nil,
        end: String? = nil,
        timezone: String? = nil
    ) -> QuietHours? {
        QuietHours(
            start: start ?? self.start,
            end: end ?? self.end,
            timezone: timezone ?? self.timezone
        )
    }

    static func isValidTime(_ value: String) -> Bool {
        minutes(from: value) != nil
    }

    static func minutes(from value: String) -> Int? {
        let parts = value.split(separator: ":")
        guard parts.count == 2,
              let hours = Int(parts[0]),
              let minutes = Int(parts[1]),
              (0...23).contains(hours),
              (0...59).contains(minutes)
        else {
            return nil
        }
        return hours * 60 + minutes
    }
}

struct MessagePreferences: Sendable, Codable, Equatable {
    var matrix: MessagePreferenceMatrix
    var quietHours: QuietHours?

    static let `default` = MessagePreferences(
        matrix: .default,
        quietHours: nil
    )

    static func migratingLegacy(_ legacy: LegacyMessagePreferences) -> MessagePreferences {
        let migratedEnabled = MessageChannelPreferences(
            email: legacy.channels.email,
            sms: legacy.channels.sms,
            push: legacy.channels.push,
            inApp: legacy.channels.inApp
        )
        let disabled = MessageChannelPreferences.allDisabled

        return MessagePreferences(
            matrix: MessagePreferenceMatrix(
                transactional: legacy.categories.transactional ? migratedEnabled : disabled,
                tours: legacy.categories.tours ? migratedEnabled : disabled,
                offers: legacy.categories.offers ? migratedEnabled : disabled,
                closing: migratedEnabled,
                disclosures: migratedEnabled,
                marketUpdates: legacy.categories.updates ? migratedEnabled : disabled,
                marketing: legacy.categories.marketing ? migratedEnabled : disabled,
                safety: .allEnabled
            ),
            quietHours: nil
        )
    }

    func isEnabled(channel: MessageChannel, category: MessageCategory) -> Bool {
        matrix[category].isEnabled(channel)
    }

    func shouldDeliver(channel: MessageChannel, category: MessageCategory) -> Bool {
        if category == .safety {
            return true
        }
        return isEnabled(channel: channel, category: category)
    }

    var isGloballyOptedOut: Bool {
        MessageCategory.allCases
            .filter { !$0.isMandatory }
            .allSatisfy { category in
                MessageChannel.allCases.allSatisfy { channel in
                    !matrix[category].isEnabled(channel)
                }
            }
    }

    func withPreference(
        category: MessageCategory,
        channel: MessageChannel,
        enabled: Bool
    ) -> MessagePreferences {
        guard !category.isMandatory else {
            return normalizedForMandatoryRules()
        }
        var copy = self
        var row = copy.matrix[category]
        row.set(channel, to: enabled)
        copy.matrix[category] = row
        return copy.normalizedForMandatoryRules()
    }

    func withQuietHours(_ quietHours: QuietHours?) -> MessagePreferences {
        var copy = self
        copy.quietHours = quietHours
        return copy.normalizedForMandatoryRules()
    }

    func optOutAllOptionalNotifications() -> MessagePreferences {
        var copy = self
        for category in MessageCategory.allCases where !category.isMandatory {
            copy.matrix[category] = .allDisabled
        }
        return copy.normalizedForMandatoryRules()
    }

    func normalizedForMandatoryRules() -> MessagePreferences {
        var copy = self
        copy.matrix.safety = .allEnabled
        return copy
    }
}

// MARK: - Push permission awareness

enum PushPermissionState: String, Sendable, Equatable {
    case unknown
    case allowed
    case denied

    static func from(_ status: UNAuthorizationStatus) -> PushPermissionState {
        switch status {
        case .authorized, .provisional, .ephemeral:
            return .allowed
        case .denied:
            return .denied
        case .notDetermined:
            return .unknown
        @unknown default:
            return .unknown
        }
    }
}

protocol PushPermissionProviding: Sendable {
    func currentStatus() async -> PushPermissionState
}

struct SystemPushPermissionProvider: PushPermissionProviding {
    func currentStatus() async -> PushPermissionState {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        return PushPermissionState.from(settings.authorizationStatus)
    }
}

// MARK: - Load state

struct MessagePreferencesSnapshot: Sendable, Equatable {
    var preferences: MessagePreferences
    var hasStored: Bool
}

enum MessagePreferencesLoadState: Sendable, Equatable {
    case idle
    case loading
    case loaded(MessagePreferences, hasStored: Bool)
    case error(String)
}

enum MessagePreferencesSaveState: Sendable, Equatable {
    case idle
    case saving
    case error(String)
}

// MARK: - Backend protocol

protocol MessagePreferencesBackend: Sendable {
    func fetch() async throws -> MessagePreferencesSnapshot
    func upsert(_ preferences: MessagePreferences) async throws -> MessagePreferences
}

// MARK: - Errors

enum MessagePreferencesError: LocalizedError {
    case notAuthenticated
    case invalidResponse
    case httpError(statusCode: Int)
    case invalidQuietHours

    var errorDescription: String? {
        switch self {
        case .notAuthenticated:
            return "You're not authenticated. Sign in again to manage preferences."
        case .invalidResponse:
            return "The preference service returned an unexpected response."
        case .httpError(let statusCode):
            return "The preference service returned HTTP \(statusCode)."
        case .invalidQuietHours:
            return "Quiet hours must use valid times and an IANA timezone."
        }
    }
}

// MARK: - Service

@MainActor
@Observable
final class MessagePreferencesService {

    private(set) var state: MessagePreferencesLoadState = .idle
    private(set) var saveState: MessagePreferencesSaveState = .idle
    private(set) var preferences: MessagePreferences = .default
    private(set) var hasStoredPreferences: Bool = false
    private(set) var pushPermissionState: PushPermissionState = .unknown

    private let backend: MessagePreferencesBackend
    private let pushPermissionProvider: PushPermissionProviding

    private var lastCommittedPreferences: MessagePreferences = .default
    private var lastCommittedHasStoredPreferences = false
    private var queuedPreferences: MessagePreferences?
    private var saveLoopRunning = false

    init(
        backend: MessagePreferencesBackend,
        pushPermissionProvider: PushPermissionProviding = SystemPushPermissionProvider()
    ) {
        self.backend = backend
        self.pushPermissionProvider = pushPermissionProvider
    }

    // MARK: - Load

    func load() async {
        state = .loading
        saveState = .idle

        async let permissionState = pushPermissionProvider.currentStatus()

        do {
            let result = try await backend.fetch()
            pushPermissionState = await permissionState
            preferences = result.preferences.normalizedForMandatoryRules()
            hasStoredPreferences = result.hasStored
            lastCommittedPreferences = preferences
            lastCommittedHasStoredPreferences = result.hasStored
            state = .loaded(preferences, hasStored: result.hasStored)
        } catch {
            pushPermissionState = await permissionState
            state = .error(displayMessage(for: error))
        }
    }

    func refreshPushPermissionState() async {
        pushPermissionState = await pushPermissionProvider.currentStatus()
    }

    // MARK: - Matrix updates

    func setPreference(
        category: MessageCategory,
        channel: MessageChannel,
        isEnabled: Bool
    ) async {
        guard !category.isMandatory else {
            return
        }
        if channel == .push, pushPermissionState == .denied {
            return
        }

        let updated = preferences.withPreference(
            category: category,
            channel: channel,
            enabled: isEnabled
        )
        queueSave(updated)
    }

    func setQuietHoursEnabled(_ enabled: Bool) async {
        let quietHours = enabled ? (preferences.quietHours ?? QuietHours.suggestedDefault) : nil
        queueSave(preferences.withQuietHours(quietHours))
    }

    func setQuietHours(
        start: String? = nil,
        end: String? = nil,
        timezone: String? = nil
    ) async {
        let base = preferences.quietHours ?? QuietHours.suggestedDefault
        guard let updated = base.replacing(start: start, end: end, timezone: timezone) else {
            saveState = .error(displayMessage(for: MessagePreferencesError.invalidQuietHours))
            return
        }
        queueSave(preferences.withQuietHours(updated))
    }

    func disableAllOptionalNotifications() async {
        queueSave(preferences.optOutAllOptionalNotifications())
    }

    func resetToDefaults() async {
        queueSave(.default.normalizedForMandatoryRules())
    }

    // MARK: - Save coordination

    private func queueSave(_ desired: MessagePreferences) {
        let normalized = desired.normalizedForMandatoryRules()
        preferences = normalized
        hasStoredPreferences = true
        saveState = .saving
        state = .loaded(normalized, hasStored: true)
        queuedPreferences = normalized

        guard !saveLoopRunning else {
            return
        }

        saveLoopRunning = true
        Task { @MainActor [weak self] in
            await self?.flushQueuedSaves()
        }
    }

    private func flushQueuedSaves() async {
        while let nextPreferences = queuedPreferences {
            queuedPreferences = nil

            do {
                let persisted = try await backend.upsert(nextPreferences)
                let normalized = persisted.normalizedForMandatoryRules()
                lastCommittedPreferences = normalized
                lastCommittedHasStoredPreferences = true

                if queuedPreferences == nil {
                    preferences = normalized
                    hasStoredPreferences = true
                    saveState = .idle
                    state = .loaded(normalized, hasStored: true)
                }
            } catch {
                if queuedPreferences == nil {
                    preferences = lastCommittedPreferences
                    hasStoredPreferences = lastCommittedHasStoredPreferences
                    saveState = .error(displayMessage(for: error))
                    state = .loaded(
                        lastCommittedPreferences,
                        hasStored: lastCommittedHasStoredPreferences
                    )
                }
            }
        }

        saveLoopRunning = false

        if queuedPreferences != nil {
            queueSave(queuedPreferences!)
        }
    }
}

private func displayMessage(for error: Error) -> String {
    if let localized = error as? LocalizedError,
       let description = localized.errorDescription,
       !description.isEmpty
    {
        return description
    }

    if let message = Mirror(reflecting: error).children.first(where: { $0.label == "message" })?
        .value as? String,
        !message.isEmpty
    {
        return message
    }

    let description = String(describing: error)
    if description != String(reflecting: type(of: error)), !description.isEmpty {
        return description
    }

    return error.localizedDescription
}
