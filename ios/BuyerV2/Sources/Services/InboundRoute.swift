import Foundation

// MARK: - InboundRoute

/// A typed destination that can be reached from an external entry point
/// (universal link, deep link, push notification tap, share extension).
///
/// The app's navigation layer consumes resolved routes; it never parses
/// URLs or push payloads directly. Keeping routes in one typed enum lets
/// every surface that can receive external entry reuse the same decision
/// logic and error handling.
enum InboundRoute: Sendable, Equatable {
    /// Open the deal room tab for the given deal room ID.
    case dealRoom(dealRoomId: String)

    /// Open the Tasks tab of the deal room, optionally focusing a task.
    case task(dealRoomId: String, taskId: String?)

    /// Open the Timeline tab of the deal room.
    case timeline(dealRoomId: String)

    /// Open the property detail view by its canonical or portal ID.
    case property(propertyId: String)

    /// Default home — used when an inbound payload resolves to no
    /// specific destination (e.g. the bare app icon tap).
    case home
}

// MARK: - InboundRoutePayload

/// Raw input from an external entry point. All fields are strings so
/// callers can pass whatever format the platform surfaced (URL, push
/// payload dict, share extension bundle) without coupling the resolver
/// to a specific transport.
struct InboundRoutePayload: Sendable, Equatable {
    /// The raw URL string, if any (universal link, share extension).
    let url: String?

    /// Push notification data dictionary flattened to `[String: String]`.
    /// The resolver keys off known fields: `route`, `dealRoomId`, etc.
    let pushData: [String: String]?

    init(url: String? = nil, pushData: [String: String]? = nil) {
        self.url = url
        self.pushData = pushData
    }
}

// MARK: - RouteResolutionResult

/// The outcome of resolving an inbound payload against the current auth
/// state. Navigation code switches on this result exhaustively — no
/// ad hoc branching based on string checks or URL parsing.
enum RouteResolutionResult: Sendable, Equatable {
    /// Payload parsed successfully and the user is allowed to reach it.
    case resolved(InboundRoute)

    /// Payload parsed successfully but the user is signed out. The caller
    /// should show sign-in and apply the pending route after auth completes.
    case signInRequired(pendingRoute: InboundRoute)

    /// Payload parsed successfully but the session is expired. Same as
    /// signInRequired but surfaces the recovery state explicitly so the
    /// UI can prefer a "session expired" message over a fresh sign-in.
    case sessionExpired(pendingRoute: InboundRoute)

    /// The payload could not be parsed into a known route. The caller
    /// should fall back to the app's default entry (home).
    case invalidTarget(reason: InvalidTargetReason)
}

// MARK: - InvalidTargetReason

enum InvalidTargetReason: Error, Sendable, Equatable {
    /// No URL or push payload was provided.
    case emptyPayload

    /// The URL scheme or host was not recognized.
    case unsupportedScheme

    /// A required field (e.g. dealRoomId) was missing from the payload.
    case missingField(name: String)

    /// The resolved target ID was rejected by a validity check.
    case invalidIdentifier(field: String, value: String)
}
