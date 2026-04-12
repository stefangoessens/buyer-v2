import Foundation

// MARK: - DealStatus

enum DealStatus: String, Sendable, Codable, CaseIterable, Equatable {
    case intake
    case analysis
    case tourScheduled = "tour_scheduled"
    case offerPrep = "offer_prep"
    case offerSent = "offer_sent"
    case underContract = "under_contract"
    case closing
    case closed
    case withdrawn

    var displayName: String {
        switch self {
        case .intake: "Intake"
        case .analysis: "Analysis"
        case .tourScheduled: "Tour Scheduled"
        case .offerPrep: "Offer Prep"
        case .offerSent: "Offer Sent"
        case .underContract: "Under Contract"
        case .closing: "Closing"
        case .closed: "Closed"
        case .withdrawn: "Withdrawn"
        }
    }

    var isActive: Bool {
        switch self {
        case .closed, .withdrawn:
            return false
        default:
            return true
        }
    }
}

// MARK: - PropertySummary

struct PropertySummary: Sendable, Codable, Equatable {
    let id: String
    let address: String
    let city: String
    let state: String
    let zip: String
    let listPrice: Double?
    let beds: Int?
    let bathsFull: Int?
    let bathsHalf: Int?
    let propertyType: String?
    let imageUrl: String?
}

// MARK: - DealSummary

struct DealSummary: Sendable, Codable, Equatable, Identifiable {
    let id: String
    let property: PropertySummary
    let status: DealStatus
    let accessLevel: String
    let createdAt: String
    let updatedAt: String
}
