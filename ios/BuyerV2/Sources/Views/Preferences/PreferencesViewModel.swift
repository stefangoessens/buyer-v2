import Foundation

/// Display-state projection for `PreferencesView`. Maps the underlying
/// `MessagePreferencesService` + `AuthService` states into the four
/// screens the view actually renders — `loading`, `content`, `error`,
/// and `signedOut` — so the view itself is a thin switch and each path
/// is unit-testable without ViewInspector.
///
/// Why it exists: KIN-848 acceptance requires explicit loading / update
/// / failure / signed-out paths. SwiftUI views aren't directly
/// unit-testable in this package (no ViewInspector dependency), so we
/// drive the mapping through a pure function that can be asserted in
/// XCTest.
enum PreferencesDisplayState: Sendable, Equatable {
    /// Initial state before `.task { await load() }` runs, or while the
    /// backend fetch is in flight.
    case loading

    /// Loaded preferences. `hasStored` distinguishes "defaults returned
    /// because no row exists yet" from "user explicitly chose defaults",
    /// which the view uses to badge first-time users. `saveState`
    /// keeps optimistic writes explicit without collapsing a failed
    /// save into the hard load-error screen.
    case content(MessagePreferences, hasStored: Bool, saveState: MessagePreferencesSaveState)

    /// Hard failure that requires a retry (not a partial-write rollback).
    case error(String)

    /// The current caller cannot read preferences. Rendered when auth
    /// state is signed-out OR when the service returns a
    /// `.notAuthenticated` error on load — both collapse to the same
    /// "sign back in" screen so the view never shows stale toggles.
    case signedOut
}

/// Pure mapper. Keeping this separate from the SwiftUI view lets the
/// tests exercise every branch without constructing a `View`.
struct PreferencesViewModel {

    let authState: AuthState
    let serviceState: MessagePreferencesLoadState
    let saveState: MessagePreferencesSaveState

    func display() -> PreferencesDisplayState {
        // Auth boundary: any non-signed-in state wins over service state.
        // .restoring is treated as loading so we don't flash a signed-out
        // screen during app cold-start.
        switch authState {
        case .restoring:
            return .loading
        case .signedOut, .expired, .authUnavailable:
            return .signedOut
        case .signedIn:
            break
        }

        switch serviceState {
        case .idle, .loading:
            return .loading
        case .loaded(let prefs, let hasStored):
            return .content(prefs, hasStored: hasStored, saveState: saveState)
        case .error(let message):
            // An auth failure surfaced by the backend should route to the
            // signed-out screen even if AuthService hasn't caught up yet,
            // so the user sees a single coherent story.
            if Self.isAuthError(message) {
                return .signedOut
            }
            return .error(message)
        }
    }

    // MARK: - Heuristics

    /// Match the fixed error-description produced by
    /// `MessagePreferencesError.notAuthenticated`. We compare on the
    /// localized description because that's what `MessagePreferencesService`
    /// stores when it catches an error — the original typed error is
    /// discarded inside `load()` / `update()`.
    private static func isAuthError(_ message: String) -> Bool {
        let lowered = message.lowercased()
        return lowered.contains("notauthenticated")
            || lowered.contains("not authenticated")
            || lowered.contains("unauthorized")
            || lowered.contains("401")
            || lowered.contains("403")
    }
}
