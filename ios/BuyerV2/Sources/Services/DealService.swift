import Foundation
import Observation

// MARK: - DealTrackerState

enum DealTrackerState: Sendable, Equatable {
    case loading
    case noDeal
    case activeDeal(DealSummary)
    case error(String)
}

// MARK: - DealProvider Protocol

protocol DealProvider: Sendable {
    func fetchDeals(for userId: String) async throws -> [DealSummary]
}

// MARK: - ConvexDealProvider

final class ConvexDealProvider: DealProvider, Sendable {

    private let baseURL: URL

    init(baseURL: URL = URL(string: "https://api.buyerv2.com")!) {
        self.baseURL = baseURL
    }

    func fetchDeals(for userId: String) async throws -> [DealSummary] {
        let url = baseURL.appendingPathComponent("/deals/list")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: String] = ["userId": userId]
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await URLSession.shared.data(for: request)
        try validateHTTPResponse(response)
        return try JSONDecoder().decode([DealSummary].self, from: data)
    }

    // MARK: - Private

    private func validateHTTPResponse(_ response: URLResponse) throws {
        guard let http = response as? HTTPURLResponse else {
            throw DealServiceError.invalidResponse
        }
        guard (200...299).contains(http.statusCode) else {
            throw DealServiceError.httpError(statusCode: http.statusCode)
        }
    }
}

// MARK: - DealServiceError

enum DealServiceError: Error {
    case invalidResponse
    case httpError(statusCode: Int)
    case noUserId
}

// MARK: - DealService

@MainActor
@Observable
final class DealService {

    private(set) var state: DealTrackerState = .loading
    private(set) var deals: [DealSummary] = []

    var activeDeal: DealSummary? {
        deals.first { $0.status.isActive }
    }

    private let provider: DealProvider
    private var currentUserId: String?

    init(provider: DealProvider = ConvexDealProvider()) {
        self.provider = provider
    }

    // MARK: - Public

    func loadDeals(for userId: String) async {
        currentUserId = userId
        state = .loading

        do {
            let fetched = try await provider.fetchDeals(for: userId)
            deals = fetched

            if let active = fetched.first(where: { $0.status.isActive }) {
                state = .activeDeal(active)
            } else {
                state = .noDeal
            }
        } catch {
            state = .error(error.localizedDescription)
        }
    }

    func refresh() async {
        guard let userId = currentUserId else {
            state = .error("No user ID available")
            return
        }
        await loadDeals(for: userId)
    }
}
