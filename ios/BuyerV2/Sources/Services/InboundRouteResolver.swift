import Foundation

// MARK: - InboundRouteResolver

/// Resolves an `InboundRoutePayload` into a typed `RouteResolutionResult`,
/// consulting the current `AuthService` state to decide whether the user
/// can reach the destination directly or must authenticate first.
///
/// This is the ONE place in the app that knows how to parse universal
/// links, deep links, and push payloads into typed routes. App start,
/// scene activation, universal link delegate methods, and push tap
/// handlers all funnel through here.
@MainActor
final class InboundRouteResolver {

    private let authService: AuthService

    /// The set of URL hosts this resolver accepts as the buyer-v2 app.
    /// Anything else is treated as an unsupported scheme.
    static let acceptedHosts: Set<String> = [
        "buyerv2.com",
        "www.buyerv2.com",
        "app.buyerv2.com",
    ]

    /// The set of custom URL schemes we treat as native deep links.
    static let acceptedSchemes: Set<String> = [
        "buyerv2",
    ]

    init(authService: AuthService) {
        self.authService = authService
    }

    // MARK: - Public

    /// Resolve a raw inbound payload against the current auth state.
    ///
    /// Order of operations:
    ///   1. Parse the payload into an `InboundRoute` (pure — no auth).
    ///   2. If parse fails → `.invalidTarget`.
    ///   3. If auth state is `.signedIn` → `.resolved(route)`.
    ///   4. If auth state is `.expired` → `.sessionExpired(route)`.
    ///   5. Otherwise (`.signedOut`, `.restoring`) → `.signInRequired(route)`.
    ///
    /// The restoring state deliberately maps to `.signInRequired` rather
    /// than blocking: callers should hold the pending route and re-ask
    /// after the auth service finishes restoring (the AuthService state
    /// observer will rerun this resolver).
    func resolve(_ payload: InboundRoutePayload) -> RouteResolutionResult {
        let parseResult = Self.parseRoute(from: payload)
        switch parseResult {
        case .failure(let reason):
            return .invalidTarget(reason: reason)
        case .success(let route):
            switch authService.state {
            case .signedIn:
                return .resolved(route)
            case .expired:
                return .sessionExpired(pendingRoute: route)
            case .signedOut, .restoring:
                return .signInRequired(pendingRoute: route)
            }
        }
    }

    // MARK: - Pure parsing

    /// Parse an inbound payload into a typed route without touching
    /// auth state. Exposed as `static` so tests can exercise the parser
    /// directly without constructing an AuthService.
    static func parseRoute(
        from payload: InboundRoutePayload
    ) -> Result<InboundRoute, InvalidTargetReason> {
        // Push payloads take precedence — a push tap is an explicit
        // user action on a specific notification, whereas a URL may be
        // tapped from anywhere.
        if let pushData = payload.pushData, !pushData.isEmpty {
            return parsePushPayload(pushData)
        }

        if let urlString = payload.url, !urlString.isEmpty {
            return parseURL(urlString)
        }

        return .failure(.emptyPayload)
    }

    // MARK: - Private: URL parsing

    private static func parseURL(
        _ urlString: String
    ) -> Result<InboundRoute, InvalidTargetReason> {
        guard let components = URLComponents(string: urlString) else {
            return .failure(.unsupportedScheme)
        }

        // Custom scheme (buyerv2://...) — host/path encode the destination
        if let scheme = components.scheme,
           acceptedSchemes.contains(scheme.lowercased()) {
            return parseCustomSchemeURL(components)
        }

        // HTTPS universal link — host must be in acceptedHosts
        if let scheme = components.scheme?.lowercased(),
           scheme == "https" || scheme == "http",
           let host = components.host?.lowercased(),
           acceptedHosts.contains(host) {
            return parseHTTPSPath(components.path)
        }

        return .failure(.unsupportedScheme)
    }

    /// Parse `buyerv2://deal-room/<id>` style URLs.
    /// The host segment is the route kind, the first path segment is the ID.
    private static func parseCustomSchemeURL(
        _ components: URLComponents
    ) -> Result<InboundRoute, InvalidTargetReason> {
        guard let host = components.host?.lowercased() else {
            return .failure(.unsupportedScheme)
        }

        let pathSegments = components.path
            .split(separator: "/")
            .map(String.init)
        let firstSegment = pathSegments.first

        switch host {
        case "deal-room", "dealroom":
            return resolveDealRoomRoute(
                dealRoomId: firstSegment,
                tab: pathSegments.dropFirst().first
            )
        case "task":
            guard let dealRoomId = firstSegment,
                  !dealRoomId.isEmpty else {
                return .failure(.missingField(name: "dealRoomId"))
            }
            let taskId = pathSegments.dropFirst().first
            return .success(.task(dealRoomId: dealRoomId, taskId: taskId))
        case "timeline":
            guard let dealRoomId = firstSegment, !dealRoomId.isEmpty else {
                return .failure(.missingField(name: "dealRoomId"))
            }
            return .success(.timeline(dealRoomId: dealRoomId))
        case "property":
            guard let propertyId = firstSegment, !propertyId.isEmpty else {
                return .failure(.missingField(name: "propertyId"))
            }
            return .success(.property(propertyId: propertyId))
        case "home", "":
            return .success(.home)
        default:
            return .failure(.unsupportedScheme)
        }
    }

    /// Parse `https://buyerv2.com/deal-room/<id>` style paths.
    /// Path is split by `/` and processed identically to the custom scheme.
    private static func parseHTTPSPath(
        _ path: String
    ) -> Result<InboundRoute, InvalidTargetReason> {
        let segments = path
            .split(separator: "/")
            .map(String.init)

        guard let first = segments.first else {
            return .success(.home)
        }

        switch first.lowercased() {
        case "deal-room", "dealroom":
            return resolveDealRoomRoute(
                dealRoomId: segments.dropFirst().first,
                tab: segments.dropFirst(2).first
            )
        case "task":
            guard let dealRoomId = segments.dropFirst().first,
                  !dealRoomId.isEmpty else {
                return .failure(.missingField(name: "dealRoomId"))
            }
            let taskId = segments.dropFirst(2).first
            return .success(.task(dealRoomId: dealRoomId, taskId: taskId))
        case "timeline":
            guard let dealRoomId = segments.dropFirst().first,
                  !dealRoomId.isEmpty else {
                return .failure(.missingField(name: "dealRoomId"))
            }
            return .success(.timeline(dealRoomId: dealRoomId))
        case "property":
            guard let propertyId = segments.dropFirst().first,
                  !propertyId.isEmpty else {
                return .failure(.missingField(name: "propertyId"))
            }
            return .success(.property(propertyId: propertyId))
        case "home":
            return .success(.home)
        default:
            return .failure(.unsupportedScheme)
        }
    }

    private static func resolveDealRoomRoute(
        dealRoomId: String?,
        tab: String?
    ) -> Result<InboundRoute, InvalidTargetReason> {
        guard let dealRoomId, !dealRoomId.isEmpty else {
            return .failure(.missingField(name: "dealRoomId"))
        }
        // Optional tab focus
        switch tab?.lowercased() {
        case "tasks":
            return .success(.task(dealRoomId: dealRoomId, taskId: nil))
        case "timeline":
            return .success(.timeline(dealRoomId: dealRoomId))
        case nil, "", "status":
            return .success(.dealRoom(dealRoomId: dealRoomId))
        default:
            return .failure(.invalidIdentifier(field: "tab", value: tab ?? ""))
        }
    }

    // MARK: - Private: Push payload parsing

    /// Expected push payload keys:
    ///   - `route`: one of "deal_room" | "task" | "timeline" | "property" | "home"
    ///   - `dealRoomId`: string (required for deal_room/task/timeline)
    ///   - `taskId`: string (optional for task)
    ///   - `propertyId`: string (required for property)
    private static func parsePushPayload(
        _ data: [String: String]
    ) -> Result<InboundRoute, InvalidTargetReason> {
        guard let routeKind = data["route"]?.lowercased() else {
            return .failure(.missingField(name: "route"))
        }

        switch routeKind {
        case "deal_room", "dealroom":
            guard let dealRoomId = data["dealRoomId"], !dealRoomId.isEmpty else {
                return .failure(.missingField(name: "dealRoomId"))
            }
            return .success(.dealRoom(dealRoomId: dealRoomId))
        case "task":
            guard let dealRoomId = data["dealRoomId"], !dealRoomId.isEmpty else {
                return .failure(.missingField(name: "dealRoomId"))
            }
            let taskId = data["taskId"]
            return .success(.task(dealRoomId: dealRoomId, taskId: taskId))
        case "timeline":
            guard let dealRoomId = data["dealRoomId"], !dealRoomId.isEmpty else {
                return .failure(.missingField(name: "dealRoomId"))
            }
            return .success(.timeline(dealRoomId: dealRoomId))
        case "property":
            guard let propertyId = data["propertyId"], !propertyId.isEmpty else {
                return .failure(.missingField(name: "propertyId"))
            }
            return .success(.property(propertyId: propertyId))
        case "home":
            return .success(.home)
        default:
            return .failure(
                .invalidIdentifier(field: "route", value: routeKind)
            )
        }
    }
}
