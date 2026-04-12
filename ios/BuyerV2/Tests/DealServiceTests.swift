import Foundation
import Testing

@testable import BuyerV2

// MARK: - MockDealProvider

final class MockDealProvider: DealProvider, @unchecked Sendable {

    // Configurable response
    var fetchResult: Result<[DealSummary], Error> = .success([])

    // Call tracking
    var fetchCallCount = 0
    var lastUserId: String?

    func fetchDeals(for userId: String) async throws -> [DealSummary] {
        fetchCallCount += 1
        lastUserId = userId
        return try fetchResult.get()
    }
}

// MARK: - Test Fixtures

private func makeProperty(
    id: String = "prop-1",
    address: String = "123 Ocean Dr",
    city: String = "Miami Beach",
    state: String = "FL",
    zip: String = "33139",
    listPrice: Double? = 1_250_000,
    beds: Int? = 3,
    bathsFull: Int? = 2,
    bathsHalf: Int? = 1,
    propertyType: String? = "Condo",
    imageUrl: String? = "https://example.com/img.jpg"
) -> PropertySummary {
    PropertySummary(
        id: id,
        address: address,
        city: city,
        state: state,
        zip: zip,
        listPrice: listPrice,
        beds: beds,
        bathsFull: bathsFull,
        bathsHalf: bathsHalf,
        propertyType: propertyType,
        imageUrl: imageUrl
    )
}

private func makeDeal(
    id: String = "deal-1",
    property: PropertySummary? = nil,
    status: DealStatus = .analysis,
    accessLevel: String = "registered",
    createdAt: String = "2026-04-01T00:00:00Z",
    updatedAt: String = "2026-04-10T00:00:00Z"
) -> DealSummary {
    DealSummary(
        id: id,
        property: property ?? makeProperty(),
        status: status,
        accessLevel: accessLevel,
        createdAt: createdAt,
        updatedAt: updatedAt
    )
}

private struct MockDealError: Error, Equatable {
    let message: String
}

// MARK: - DealService Tests

@Suite("DealService state transitions", .serialized)
@MainActor
struct DealServiceTests {

    // MARK: - Initial State

    @Test("Initial state is .loading")
    func testInitialState() {
        let provider = MockDealProvider()
        let service = DealService(provider: provider)

        guard case .loading = service.state else {
            Issue.record("Expected .loading, got \(service.state)")
            return
        }
        #expect(service.deals.isEmpty)
        #expect(service.activeDeal == nil)
    }

    // MARK: - Load Deals: Active Deal

    @Test("loadDeals transitions to .activeDeal when an active deal is returned")
    func testLoadDealsWithActiveDeal() async {
        let provider = MockDealProvider()
        let activeDeal = makeDeal(id: "deal-active", status: .underContract)
        provider.fetchResult = .success([activeDeal])

        let service = DealService(provider: provider)
        await service.loadDeals(for: "user-123")

        guard case .activeDeal(let deal) = service.state else {
            Issue.record("Expected .activeDeal, got \(service.state)")
            return
        }
        #expect(deal == activeDeal)
        #expect(deal.id == "deal-active")
        #expect(service.deals.count == 1)
        #expect(provider.fetchCallCount == 1)
        #expect(provider.lastUserId == "user-123")
    }

    @Test("loadDeals picks first active deal when multiple deals returned")
    func testLoadDealsPicksFirstActiveWhenMixed() async {
        let provider = MockDealProvider()
        let closedDeal = makeDeal(id: "deal-closed", status: .closed)
        let activeDeal = makeDeal(id: "deal-active", status: .offerSent)
        let withdrawnDeal = makeDeal(id: "deal-withdrawn", status: .withdrawn)
        provider.fetchResult = .success([closedDeal, activeDeal, withdrawnDeal])

        let service = DealService(provider: provider)
        await service.loadDeals(for: "user-123")

        guard case .activeDeal(let deal) = service.state else {
            Issue.record("Expected .activeDeal, got \(service.state)")
            return
        }
        #expect(deal.id == "deal-active")
        #expect(service.deals.count == 3)
    }

    // MARK: - Load Deals: No Deal

    @Test("loadDeals transitions to .noDeal when empty array returned")
    func testLoadDealsWithNoDeal() async {
        let provider = MockDealProvider()
        provider.fetchResult = .success([])

        let service = DealService(provider: provider)
        await service.loadDeals(for: "user-123")

        guard case .noDeal = service.state else {
            Issue.record("Expected .noDeal, got \(service.state)")
            return
        }
        #expect(service.deals.isEmpty)
        #expect(service.activeDeal == nil)
        #expect(provider.fetchCallCount == 1)
    }

    @Test("loadDeals transitions to .noDeal when all deals are closed or withdrawn")
    func testLoadDealsWithOnlyClosedDeals() async {
        let provider = MockDealProvider()
        let closedDeal = makeDeal(id: "deal-1", status: .closed)
        let withdrawnDeal = makeDeal(id: "deal-2", status: .withdrawn)
        provider.fetchResult = .success([closedDeal, withdrawnDeal])

        let service = DealService(provider: provider)
        await service.loadDeals(for: "user-123")

        guard case .noDeal = service.state else {
            Issue.record("Expected .noDeal, got \(service.state)")
            return
        }
        // Deals are still loaded — state just reflects "no active deal"
        #expect(service.deals.count == 2)
        #expect(service.activeDeal == nil)
    }

    // MARK: - Load Deals: Error

    @Test("loadDeals transitions to .error when provider throws")
    func testLoadDealsError() async {
        let provider = MockDealProvider()
        provider.fetchResult = .failure(MockDealError(message: "network down"))

        let service = DealService(provider: provider)
        await service.loadDeals(for: "user-123")

        guard case .error(let message) = service.state else {
            Issue.record("Expected .error, got \(service.state)")
            return
        }
        #expect(!message.isEmpty)
        #expect(provider.fetchCallCount == 1)
    }

    // MARK: - activeDeal Computed Property

    @Test("activeDeal returns first deal with isActive status")
    func testActiveDealComputed() async {
        let provider = MockDealProvider()
        let closedDeal = makeDeal(id: "deal-closed", status: .closed)
        let intakeDeal = makeDeal(id: "deal-intake", status: .intake)
        let tourDeal = makeDeal(id: "deal-tour", status: .tourScheduled)
        provider.fetchResult = .success([closedDeal, intakeDeal, tourDeal])

        let service = DealService(provider: provider)
        await service.loadDeals(for: "user-123")

        // First active deal in the list is the intake deal
        #expect(service.activeDeal?.id == "deal-intake")
    }

    @Test("activeDeal is nil when no deals loaded")
    func testActiveDealNilWhenEmpty() {
        let provider = MockDealProvider()
        let service = DealService(provider: provider)

        #expect(service.activeDeal == nil)
    }

    @Test("activeDeal is nil when all deals are inactive")
    func testActiveDealNilWhenAllInactive() async {
        let provider = MockDealProvider()
        let closedDeal = makeDeal(id: "deal-1", status: .closed)
        let withdrawnDeal = makeDeal(id: "deal-2", status: .withdrawn)
        provider.fetchResult = .success([closedDeal, withdrawnDeal])

        let service = DealService(provider: provider)
        await service.loadDeals(for: "user-123")

        #expect(service.activeDeal == nil)
    }

    // MARK: - Refresh

    @Test("refresh re-fetches deals and updates state")
    func testRefreshReloads() async {
        let provider = MockDealProvider()
        let initialDeal = makeDeal(id: "deal-1", status: .analysis)
        provider.fetchResult = .success([initialDeal])

        let service = DealService(provider: provider)
        await service.loadDeals(for: "user-123")

        #expect(provider.fetchCallCount == 1)
        guard case .activeDeal(let deal) = service.state, deal.id == "deal-1" else {
            Issue.record("Pre-condition failed: expected .activeDeal for deal-1")
            return
        }

        // Swap provider response to a different active deal
        let updatedDeal = makeDeal(id: "deal-2", status: .offerSent)
        provider.fetchResult = .success([updatedDeal])

        await service.refresh()

        #expect(provider.fetchCallCount == 2)
        #expect(provider.lastUserId == "user-123")
        guard case .activeDeal(let newDeal) = service.state else {
            Issue.record("Expected .activeDeal after refresh, got \(service.state)")
            return
        }
        #expect(newDeal.id == "deal-2")
    }

    @Test("refresh transitions to .error when no user ID has been set")
    func testRefreshWithoutUserId() async {
        let provider = MockDealProvider()
        let service = DealService(provider: provider)

        await service.refresh()

        guard case .error = service.state else {
            Issue.record("Expected .error when refreshing without prior loadDeals, got \(service.state)")
            return
        }
        #expect(provider.fetchCallCount == 0)
    }

    @Test("refresh transitions from active to noDeal when deals disappear")
    func testRefreshFromActiveToNoDeal() async {
        let provider = MockDealProvider()
        provider.fetchResult = .success([makeDeal(status: .analysis)])

        let service = DealService(provider: provider)
        await service.loadDeals(for: "user-123")
        guard case .activeDeal = service.state else {
            Issue.record("Pre-condition failed: expected .activeDeal")
            return
        }

        provider.fetchResult = .success([])
        await service.refresh()

        guard case .noDeal = service.state else {
            Issue.record("Expected .noDeal after refresh, got \(service.state)")
            return
        }
    }

    // MARK: - DealStatus.displayName

    @Test("DealStatus displayName returns correct label for every case")
    func testDealStatusDisplayName() {
        #expect(DealStatus.intake.displayName == "Intake")
        #expect(DealStatus.analysis.displayName == "Analysis")
        #expect(DealStatus.tourScheduled.displayName == "Tour Scheduled")
        #expect(DealStatus.offerPrep.displayName == "Offer Prep")
        #expect(DealStatus.offerSent.displayName == "Offer Sent")
        #expect(DealStatus.underContract.displayName == "Under Contract")
        #expect(DealStatus.closing.displayName == "Closing")
        #expect(DealStatus.closed.displayName == "Closed")
        #expect(DealStatus.withdrawn.displayName == "Withdrawn")

        // Exhaustiveness guard: every case must have a non-empty display name
        for status in DealStatus.allCases {
            #expect(!status.displayName.isEmpty, "displayName missing for \(status)")
        }
    }

    // MARK: - DealStatus.isActive

    @Test("DealStatus isActive returns correct flag for every case")
    func testDealStatusIsActive() {
        // Active statuses — deal is still in flight
        #expect(DealStatus.intake.isActive)
        #expect(DealStatus.analysis.isActive)
        #expect(DealStatus.tourScheduled.isActive)
        #expect(DealStatus.offerPrep.isActive)
        #expect(DealStatus.offerSent.isActive)
        #expect(DealStatus.underContract.isActive)
        #expect(DealStatus.closing.isActive)

        // Terminal statuses — deal is finished
        #expect(!DealStatus.closed.isActive)
        #expect(!DealStatus.withdrawn.isActive)
    }

    // MARK: - DealStatus Raw Value Round-trip

    @Test("DealStatus raw values match expected snake_case wire format")
    func testDealStatusRawValues() {
        #expect(DealStatus.intake.rawValue == "intake")
        #expect(DealStatus.analysis.rawValue == "analysis")
        #expect(DealStatus.tourScheduled.rawValue == "tour_scheduled")
        #expect(DealStatus.offerPrep.rawValue == "offer_prep")
        #expect(DealStatus.offerSent.rawValue == "offer_sent")
        #expect(DealStatus.underContract.rawValue == "under_contract")
        #expect(DealStatus.closing.rawValue == "closing")
        #expect(DealStatus.closed.rawValue == "closed")
        #expect(DealStatus.withdrawn.rawValue == "withdrawn")
    }
}
