import Foundation

/// Thin authenticated HTTP adapter for the buyer preference center.
///
/// KIN-1095 moves the transport from legacy channel/category patches to a
/// full matrix + quiet-hours snapshot so optimistic UI can coalesce rapid
/// edits without depending on backend-side patch ordering.
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

    func fetch() async throws -> MessagePreferencesSnapshot {
        let data = try await post(path: "/preferences/get", body: EmptyBody())

        if let decoded = try? JSONDecoder().decode(PreferencesEnvelope.self, from: data) {
            return MessagePreferencesSnapshot(
                preferences: decoded.preferences.normalizedForMandatoryRules(),
                hasStored: decoded.hasStoredPreferences
            )
        }

        if let legacy = try? JSONDecoder().decode(LegacyFetchResponse.self, from: data) {
            return MessagePreferencesSnapshot(
                preferences: MessagePreferences
                    .migratingLegacy(legacy.preferences)
                    .normalizedForMandatoryRules(),
                hasStored: legacy.hasStoredPreferences
            )
        }

        throw MessagePreferencesError.invalidResponse
    }

    func upsert(_ preferences: MessagePreferences) async throws -> MessagePreferences {
        let data = try await post(
            path: "/preferences/upsert",
            body: UpsertBody(
                preferences: preferences.normalizedForMandatoryRules(),
                source: "preference_center"
            )
        )

        if let decoded = try? JSONDecoder().decode(PreferencesEnvelope.self, from: data) {
            return decoded.preferences.normalizedForMandatoryRules()
        }

        if let preferences = try? JSONDecoder().decode(MessagePreferences.self, from: data) {
            return preferences.normalizedForMandatoryRules()
        }

        throw MessagePreferencesError.invalidResponse
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
    let preferences: MessagePreferences
    let source: String
}

private struct PreferencesEnvelope: Decodable {
    let hasStoredPreferences: Bool
    let preferences: MessagePreferences
}

private struct LegacyFetchResponse: Decodable {
    let hasStoredPreferences: Bool
    let channels: LegacyChannelEnablement
    let categories: LegacyCategoryEnablement

    var preferences: LegacyMessagePreferences {
        LegacyMessagePreferences(
            channels: channels,
            categories: categories
        )
    }
}
