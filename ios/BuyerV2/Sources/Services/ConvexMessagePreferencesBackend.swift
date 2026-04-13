import Foundation

/// HTTP adapter that speaks to the shared Convex delivery-preference
/// state defined in `convex/messagePreferences.ts`. Kept deliberately
/// thin so the `MessagePreferencesService` can stay transport-agnostic.
///
/// The token provider is async because production wiring reads from the
/// live `AuthService` session boundary before every request. Tests can
/// still pass a trivial closure like `{ "stub" }` — Swift auto-converts
/// sync returns into the async signature.
final class ConvexMessagePreferencesBackend: MessagePreferencesBackend, @unchecked Sendable {

    private let baseURL: URL
    private let tokenProvider: @Sendable () async -> String?
    private let session: URLSession

    init(
        baseURL: URL = URL(string: "https://api.buyerv2.com")!,
        tokenProvider: @escaping @Sendable () async -> String? = { nil },
        session: URLSession = .shared
    ) {
        self.baseURL = baseURL
        self.tokenProvider = tokenProvider
        self.session = session
    }

    // MARK: - MessagePreferencesBackend

    func fetch() async throws -> (preferences: MessagePreferences, hasStored: Bool) {
        let data = try await post(path: "/preferences/get", body: EmptyBody())
        let decoded = try JSONDecoder().decode(PreferencesFetchResponse.self, from: data)
        return (decoded.preferences, decoded.hasStoredPreferences)
    }

    func upsert(_ patch: MessagePreferencesPatch) async throws -> MessagePreferences {
        let body = UpsertBody(
            channels: UpsertBody.Channels(
                email: patch.emailEnabled,
                sms: patch.smsEnabled,
                push: patch.pushEnabled,
                inApp: patch.inAppEnabled
            ),
            categories: UpsertBody.Categories(
                transactional: patch.transactionalEnabled,
                tours: patch.toursEnabled,
                offers: patch.offersEnabled,
                updates: patch.updatesEnabled,
                marketing: patch.marketingEnabled
            )
        )
        let data = try await post(path: "/preferences/upsert", body: body)
        return try JSONDecoder().decode(MessagePreferences.self, from: data)
    }

    func optOutAll() async throws -> MessagePreferences {
        let data = try await post(path: "/preferences/optOutAll", body: EmptyBody())
        return try JSONDecoder().decode(MessagePreferences.self, from: data)
    }

    func resetToDefaults() async throws -> MessagePreferences {
        let data = try await post(path: "/preferences/reset", body: EmptyBody())
        return try JSONDecoder().decode(MessagePreferences.self, from: data)
    }

    // MARK: - Private

    private func post<T: Encodable>(path: String, body: T) async throws -> Data {
        guard let token = await tokenProvider(), !token.isEmpty else {
            throw MessagePreferencesError.notAuthenticated
        }

        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw MessagePreferencesError.invalidResponse
        }
        if http.statusCode == 401 || http.statusCode == 403 {
            throw MessagePreferencesError.notAuthenticated
        }
        guard (200...299).contains(http.statusCode) else {
            throw MessagePreferencesError.httpError(statusCode: http.statusCode)
        }
        return data
    }
}

// MARK: - Wire shapes

private struct EmptyBody: Encodable {}

private struct UpsertBody: Encodable {
    struct Channels: Encodable {
        let email: Bool?
        let sms: Bool?
        let push: Bool?
        let inApp: Bool?
    }
    struct Categories: Encodable {
        let transactional: Bool?
        let tours: Bool?
        let offers: Bool?
        let updates: Bool?
        let marketing: Bool?
    }
    let channels: Channels?
    let categories: Categories?
}

private struct PreferencesFetchResponse: Decodable {
    let hasStoredPreferences: Bool
    let channels: ChannelEnablement
    let categories: CategoryEnablement

    var preferences: MessagePreferences {
        MessagePreferences(channels: channels, categories: categories)
    }
}
