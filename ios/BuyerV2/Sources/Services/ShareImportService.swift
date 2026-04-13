import Foundation
import Observation

// MARK: - ShareImportPortal

/// Which listing portal a shared URL came from. Used for analytics
/// tagging and to pick the right URL normalization rules in the
/// backend intake pipeline.
enum ShareImportPortal: String, Sendable, Codable, CaseIterable {
    case zillow
    case redfin
    case realtor
    case unknown
}

// MARK: - Validation

/// Pure helpers that classify an incoming share payload. Exposed at
/// the module level so tests can exercise the URL parser directly
/// without constructing a service instance.
enum ShareImportValidator {

    /// Known listing-portal hosts. Subdomains are matched too
    /// (e.g. `m.zillow.com` matches `zillow.com`).
    static let supportedHosts: [String: ShareImportPortal] = [
        "zillow.com": .zillow,
        "www.zillow.com": .zillow,
        "m.zillow.com": .zillow,
        "redfin.com": .redfin,
        "www.redfin.com": .redfin,
        "realtor.com": .realtor,
        "www.realtor.com": .realtor,
    ]

    /// Detect the portal for a given URL string. Returns nil if the
    /// URL is malformed or the host isn't in the supported list.
    static func detectPortal(for urlString: String) -> ShareImportPortal? {
        guard let url = URL(string: urlString.trimmingCharacters(in: .whitespacesAndNewlines)),
              let scheme = url.scheme?.lowercased(),
              scheme == "https" || scheme == "http",
              let host = url.host?.lowercased()
        else {
            return nil
        }
        return supportedHosts[host]
    }

    /// Validate a share payload before we fire any backend call.
    /// Returns a result that callers can exhaustively switch on.
    static func validate(urlString: String) -> ShareValidationResult {
        let trimmed = urlString.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            return .invalid(reason: .emptyInput)
        }
        guard let url = URL(string: trimmed),
              let scheme = url.scheme?.lowercased()
        else {
            return .invalid(reason: .malformedURL)
        }
        if scheme != "https" && scheme != "http" {
            return .invalid(reason: .unsupportedScheme)
        }
        guard let host = url.host?.lowercased() else {
            return .invalid(reason: .malformedURL)
        }
        guard let portal = supportedHosts[host] else {
            return .invalid(reason: .unsupportedPortal)
        }
        return .valid(portal: portal, normalizedUrl: trimmed)
    }
}

enum ShareValidationResult: Sendable, Equatable {
    case valid(portal: ShareImportPortal, normalizedUrl: String)
    case invalid(reason: ShareInvalidReason)
}

enum ShareInvalidReason: Sendable, Equatable {
    case emptyInput
    case malformedURL
    case unsupportedScheme
    case unsupportedPortal

    var displayMessage: String {
        switch self {
        case .emptyInput:
            return "No link was shared."
        case .malformedURL:
            return "That doesn't look like a valid URL."
        case .unsupportedScheme:
            return "Only https:// links are supported."
        case .unsupportedPortal:
            return "We only support Zillow, Redfin, and Realtor.com listings right now."
        }
    }
}

// MARK: - Import outcome

/// The typed outcome of a successful intake pipeline call. The
/// backend either returned an existing deal room id (duplicate case)
/// or created a fresh intake job.
enum ShareImportOutcome: Sendable, Equatable {
    case existingDealRoom(dealRoomId: String)
    case newIntakeJob(intakeJobId: String)
}

// MARK: - Backend response shape

struct ShareImportBackendResponse: Sendable, Codable, Equatable {
    enum Kind: String, Sendable, Codable {
        case existing
        case created
    }
    let kind: Kind
    let dealRoomId: String?
    let intakeJobId: String?
}

// MARK: - Service state

/// Explicit UI states for the share import flow. The caller's
/// SwiftUI view switches on this to render the right screen —
/// loading, error, success, pending-auth, etc.
enum ShareImportState: Sendable, Equatable {
    case idle
    case validating
    case signInRequired(pendingUrl: String)
    case sessionExpired(pendingUrl: String)
    case submitting
    case imported(ShareImportOutcome)
    case invalid(reason: ShareInvalidReason)
    case error(message: String)
}

// MARK: - Backend protocol

protocol ShareImportBackend: Sendable {
    /// POST a normalized listing URL to the intake pipeline. Returns
    /// the typed response from the backend — either an existing
    /// deal room or a new intake job.
    func submitImport(
        url: String,
        portal: ShareImportPortal
    ) async throws -> ShareImportBackendResponse
}

enum ShareImportError: Error {
    case notAuthenticated
    case invalidResponse
    case httpError(statusCode: Int)
}

// MARK: - ConvexShareImportBackend

final class ConvexShareImportBackend: ShareImportBackend, Sendable {
    private let baseURL: URL
    private let tokenProvider: AccessTokenProvider

    init(
        baseURL: URL = URL(string: "https://api.buyerv2.com")!,
        tokenProvider: @escaping AccessTokenProvider = { nil }
    ) {
        self.baseURL = baseURL
        self.tokenProvider = tokenProvider
    }

    func submitImport(
        url: String,
        portal: ShareImportPortal
    ) async throws -> ShareImportBackendResponse {
        guard let accessToken = await tokenProvider() else {
            throw ShareImportError.notAuthenticated
        }

        let endpoint = baseURL.appendingPathComponent("/share-import")
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")

        let body: [String: String] = [
            "url": url,
            "portal": portal.rawValue,
        ]
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw ShareImportError.invalidResponse
        }
        guard (200...299).contains(http.statusCode) else {
            if http.statusCode == 401 {
                throw ShareImportError.notAuthenticated
            }
            throw ShareImportError.httpError(statusCode: http.statusCode)
        }
        return try JSONDecoder().decode(ShareImportBackendResponse.self, from: data)
    }
}

// MARK: - ShareImportService

/// Main entry point for the iOS share-import flow.
///
/// Lifecycle:
///   1. Share extension / universal link handler passes a URL string
///      to `handleSharedURL(_:)`.
///   2. Service validates the URL. Invalid → `.invalid`.
///   3. Checks auth state. Not signed in → `.signInRequired(pendingUrl)`
///      and the caller stashes the URL to re-try post-sign-in.
///   4. Expired session → `.sessionExpired(pendingUrl)` so the caller
///      can drive the session recovery flow.
///   5. Signed in → POST to backend, transition to `.submitting`,
///      then `.imported(outcome)` or `.error(message)`.
///
/// On sign-in completion, the caller invokes `resumePendingImport()`
/// to pick up where the sharer left off.
@MainActor
@Observable
final class ShareImportService {

    private(set) var state: ShareImportState = .idle

    private let backend: ShareImportBackend
    private let authService: AuthService
    private var pendingUrl: String?

    init(
        backend: ShareImportBackend,
        authService: AuthService
    ) {
        self.backend = backend
        self.authService = authService
    }

    /// Entry point for an incoming share URL.
    func handleSharedURL(_ urlString: String) async {
        state = .validating
        let validation = ShareImportValidator.validate(urlString: urlString)
        switch validation {
        case .invalid(let reason):
            pendingUrl = nil
            state = .invalid(reason: reason)
            return
        case .valid(let portal, let normalized):
            await attemptImport(url: normalized, portal: portal)
        }
    }

    /// Called by the app shell after sign-in completes. If there's a
    /// pending URL from a pre-auth share attempt, re-run the import.
    func resumePendingImport() async {
        guard let url = pendingUrl else { return }
        await handleSharedURL(url)
    }

    /// Reset state to idle, clearing any pending URL. Called when
    /// the user dismisses the share-import sheet without completing.
    func dismiss() {
        pendingUrl = nil
        state = .idle
    }

    // MARK: - Private

    private func attemptImport(url: String, portal: ShareImportPortal) async {
        switch authService.state {
        case .signedOut, .restoring:
            pendingUrl = url
            state = .signInRequired(pendingUrl: url)
            return
        case .expired:
            pendingUrl = url
            state = .sessionExpired(pendingUrl: url)
            return
        case .authUnavailable:
            pendingUrl = url
            state = .error(
                message: "Authentication is temporarily unavailable. Please try again."
            )
            return
        case .signedIn:
            break
        }

        state = .submitting
        do {
            let response = try await backend.submitImport(url: url, portal: portal)
            let outcome = try decodeOutcome(from: response)
            pendingUrl = nil
            state = .imported(outcome)
        } catch let ShareImportError.notAuthenticated {
            // Backend rejected our token — treat as session expired
            pendingUrl = url
            await authService.handleTokenExpired()
            state = .sessionExpired(pendingUrl: url)
        } catch ShareImportError.invalidResponse {
            // Backend returned a malformed success payload (e.g.
            // kind: existing without dealRoomId). Surface explicitly
            // rather than fabricating an empty identifier that would
            // send downstream navigation into an impossible path.
            pendingUrl = url
            state = .error(
                message:
                    "The backend returned an incomplete response. Please try again."
            )
        } catch {
            pendingUrl = url
            state = .error(message: error.localizedDescription)
        }
    }

    /// Decode a backend response into a typed outcome. Throws
    /// `ShareImportError.invalidResponse` when the backend's contract
    /// is violated — e.g. `kind: "existing"` without `dealRoomId` or
    /// `kind: "created"` without `intakeJobId`. Never substitutes an
    /// empty identifier.
    private func decodeOutcome(
        from response: ShareImportBackendResponse
    ) throws -> ShareImportOutcome {
        switch response.kind {
        case .existing:
            guard let dealRoomId = response.dealRoomId,
                  !dealRoomId.isEmpty
            else {
                throw ShareImportError.invalidResponse
            }
            return .existingDealRoom(dealRoomId: dealRoomId)
        case .created:
            guard let intakeJobId = response.intakeJobId,
                  !intakeJobId.isEmpty
            else {
                throw ShareImportError.invalidResponse
            }
            return .newIntakeJob(intakeJobId: intakeJobId)
        }
    }
}
