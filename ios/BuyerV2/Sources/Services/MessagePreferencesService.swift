import Foundation
import Observation

// MARK: - Categories & Channels

enum MessageCategory: String, Sendable, Codable, CaseIterable {
    case transactional
    case tours
    case offers
    case updates
    case marketing
}

enum MessageChannel: String, Sendable, Codable, CaseIterable {
    case email
    case sms
    case push
    case inApp = "in_app"
}

// MARK: - Models

struct ChannelEnablement: Sendable, Codable, Equatable {
    var email: Bool
    var sms: Bool
    var push: Bool
    var inApp: Bool

    static let `default` = ChannelEnablement(
        email: true,
        sms: false,
        push: true,
        inApp: true
    )

    static let optedOut = ChannelEnablement(
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
}

struct CategoryEnablement: Sendable, Codable, Equatable {
    var transactional: Bool
    var tours: Bool
    var offers: Bool
    var updates: Bool
    var marketing: Bool

    static let `default` = CategoryEnablement(
        transactional: true,
        tours: true,
        offers: true,
        updates: true,
        marketing: false
    )

    func isEnabled(_ category: MessageCategory) -> Bool {
        switch category {
        case .transactional: return transactional
        case .tours: return tours
        case .offers: return offers
        case .updates: return updates
        case .marketing: return marketing
        }
    }
}

struct MessagePreferences: Sendable, Codable, Equatable {
    var channels: ChannelEnablement
    var categories: CategoryEnablement

    static let `default` = MessagePreferences(
        channels: .default,
        categories: .default
    )

    /// Matches `shouldDeliver` in `src/lib/messagePreferences.ts`.
    /// A message is delivered only when both the channel and category are enabled.
    func shouldDeliver(channel: MessageChannel, category: MessageCategory) -> Bool {
        channels.isEnabled(channel) && categories.isEnabled(category)
    }

    /// Matches `isGloballyOptedOut` in the web helper. True when every
    /// delivery channel is disabled.
    var isGloballyOptedOut: Bool {
        !channels.email && !channels.sms && !channels.push && !channels.inApp
    }
}

// MARK: - Partial updates

/// Partial patch for `updatePreferences`. Nil fields are left unchanged.
struct MessagePreferencesPatch: Sendable, Codable, Equatable {
    var emailEnabled: Bool?
    var smsEnabled: Bool?
    var pushEnabled: Bool?
    var inAppEnabled: Bool?
    var transactionalEnabled: Bool?
    var toursEnabled: Bool?
    var offersEnabled: Bool?
    var updatesEnabled: Bool?
    var marketingEnabled: Bool?

    init(
        emailEnabled: Bool? = nil,
        smsEnabled: Bool? = nil,
        pushEnabled: Bool? = nil,
        inAppEnabled: Bool? = nil,
        transactionalEnabled: Bool? = nil,
        toursEnabled: Bool? = nil,
        offersEnabled: Bool? = nil,
        updatesEnabled: Bool? = nil,
        marketingEnabled: Bool? = nil
    ) {
        self.emailEnabled = emailEnabled
        self.smsEnabled = smsEnabled
        self.pushEnabled = pushEnabled
        self.inAppEnabled = inAppEnabled
        self.transactionalEnabled = transactionalEnabled
        self.toursEnabled = toursEnabled
        self.offersEnabled = offersEnabled
        self.updatesEnabled = updatesEnabled
        self.marketingEnabled = marketingEnabled
    }
}

/// Apply a partial patch to an existing preferences object. Unset fields
/// keep their prior value. Pure function — same contract as
/// `mergePreferences` in the web helper so client-side edits preview
/// exactly what the backend will store.
func applyPatch(
    _ patch: MessagePreferencesPatch,
    to existing: MessagePreferences
) -> MessagePreferences {
    var result = existing
    if let v = patch.emailEnabled { result.channels.email = v }
    if let v = patch.smsEnabled { result.channels.sms = v }
    if let v = patch.pushEnabled { result.channels.push = v }
    if let v = patch.inAppEnabled { result.channels.inApp = v }
    if let v = patch.transactionalEnabled { result.categories.transactional = v }
    if let v = patch.toursEnabled { result.categories.tours = v }
    if let v = patch.offersEnabled { result.categories.offers = v }
    if let v = patch.updatesEnabled { result.categories.updates = v }
    if let v = patch.marketingEnabled { result.categories.marketing = v }
    return result
}

// MARK: - Load state

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
    func fetch() async throws -> (preferences: MessagePreferences, hasStored: Bool)
    func upsert(_ patch: MessagePreferencesPatch) async throws -> MessagePreferences
    func optOutAll() async throws -> MessagePreferences
    func resetToDefaults() async throws -> MessagePreferences
}

// MARK: - Errors

enum MessagePreferencesError: LocalizedError {
    case notAuthenticated
    case invalidResponse
    case httpError(statusCode: Int)

    var errorDescription: String? {
        switch self {
        case .notAuthenticated:
            // The PreferencesViewModel matches on "not authenticated"
            // (case-insensitive) to route the screen into its signed-out
            // branch when the backend signals an expired/missing token
            // before AuthService has caught up. Keep the text stable.
            return "You're not authenticated. Sign in again to manage preferences."
        case .invalidResponse:
            return "The preference service returned an unexpected response."
        case .httpError(let statusCode):
            return "The preference service returned HTTP \(statusCode)."
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

    private let backend: MessagePreferencesBackend

    init(backend: MessagePreferencesBackend) {
        self.backend = backend
    }

    // MARK: - Load

    /// Fetch the current user's preferences from the backend.
    func load() async {
        state = .loading
        saveState = .idle
        do {
            let result = try await backend.fetch()
            preferences = result.preferences
            hasStoredPreferences = result.hasStored
            state = .loaded(result.preferences, hasStored: result.hasStored)
        } catch {
            state = .error(error.localizedDescription)
        }
    }

    // MARK: - Update

    /// Apply a partial patch locally (optimistic) and persist it. On
    /// failure, BOTH `preferences` AND `hasStoredPreferences` roll back
    /// to their pre-optimistic values so UI toggles and onboarding nudges
    /// don't drift from backend truth — critical for first-time users
    /// where an optimistic flip to hasStoredPreferences=true must be
    /// reverted if the backend write fails.
    func update(_ patch: MessagePreferencesPatch) async {
        let prefsSnapshot = preferences
        let hasStoredSnapshot = hasStoredPreferences
        let optimistic = applyPatch(patch, to: prefsSnapshot)
        preferences = optimistic
        hasStoredPreferences = true
        saveState = .saving
        state = .loaded(optimistic, hasStored: true)

        do {
            let persisted = try await backend.upsert(patch)
            preferences = persisted
            saveState = .idle
            state = .loaded(persisted, hasStored: true)
        } catch {
            // Roll back BOTH preferences and hasStoredPreferences so a
            // first-time user's onboarding nudge isn't suppressed by a
            // failed write.
            preferences = prefsSnapshot
            hasStoredPreferences = hasStoredSnapshot
            saveState = .error(error.localizedDescription)
            state = .loaded(prefsSnapshot, hasStored: hasStoredSnapshot)
        }
    }

    // MARK: - Opt out / reset

    func optOutAll() async {
        let prefsSnapshot = preferences
        let hasStoredSnapshot = hasStoredPreferences
        let optimistic = MessagePreferences(
            channels: .optedOut,
            categories: prefsSnapshot.categories
        )
        preferences = optimistic
        hasStoredPreferences = true
        saveState = .saving
        state = .loaded(optimistic, hasStored: true)

        do {
            let persisted = try await backend.optOutAll()
            preferences = persisted
            saveState = .idle
            state = .loaded(persisted, hasStored: true)
        } catch {
            preferences = prefsSnapshot
            hasStoredPreferences = hasStoredSnapshot
            saveState = .error(error.localizedDescription)
            state = .loaded(prefsSnapshot, hasStored: hasStoredSnapshot)
        }
    }

    func resetToDefaults() async {
        let prefsSnapshot = preferences
        let hasStoredSnapshot = hasStoredPreferences
        preferences = .default
        hasStoredPreferences = true
        saveState = .saving
        state = .loaded(.default, hasStored: true)

        do {
            let persisted = try await backend.resetToDefaults()
            preferences = persisted
            saveState = .idle
            state = .loaded(persisted, hasStored: true)
        } catch {
            preferences = prefsSnapshot
            hasStoredPreferences = hasStoredSnapshot
            saveState = .error(error.localizedDescription)
            state = .loaded(prefsSnapshot, hasStored: hasStoredSnapshot)
        }
    }
}
