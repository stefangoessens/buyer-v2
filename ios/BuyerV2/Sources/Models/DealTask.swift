import Foundation

// MARK: - TaskUrgency

/// Ordered by severity — rawValue order matches the UI grouping order
/// used by `DealTasksView` (High → Medium → Low → None).
enum TaskUrgency: String, Sendable, Codable, CaseIterable, Comparable {
    case high
    case medium
    case low
    case none

    var displayName: String {
        switch self {
        case .high: "High"
        case .medium: "Medium"
        case .low: "Low"
        case .none: "No Priority"
        }
    }

    /// Stable ordering so tasks render highest-urgency first.
    static func < (lhs: TaskUrgency, rhs: TaskUrgency) -> Bool {
        lhs.sortIndex < rhs.sortIndex
    }

    private var sortIndex: Int {
        switch self {
        case .high: 0
        case .medium: 1
        case .low: 2
        case .none: 3
        }
    }
}

// MARK: - TaskWorkstream

/// Logical bucket a task belongs to. Maps to the deal-room stage graph
/// — the same values used by `DealStatus` in DealSummary.swift so the
/// mobile UI can filter tasks by the current stage of the deal.
enum TaskWorkstream: String, Sendable, Codable, CaseIterable {
    case intake
    case tour
    case offer
    case contract
    case closing
    case general

    var displayName: String {
        switch self {
        case .intake: "Intake"
        case .tour: "Tours"
        case .offer: "Offers"
        case .contract: "Contract"
        case .closing: "Closing"
        case .general: "General"
        }
    }
}

// MARK: - TaskStatus

enum TaskStatus: String, Sendable, Codable, CaseIterable {
    case pending
    case inProgress = "in_progress"
    case completed
    case blocked

    var displayName: String {
        switch self {
        case .pending: "Pending"
        case .inProgress: "In Progress"
        case .completed: "Completed"
        case .blocked: "Blocked"
        }
    }

    var isOpen: Bool {
        switch self {
        case .pending, .inProgress, .blocked: true
        case .completed: false
        }
    }
}

// MARK: - DealTask

/// Buyer-facing read model of a deal task. All fields are safe to
/// render directly — internal-only fields (broker notes, routing,
/// compensation splits) are filtered out at the Convex query layer
/// before they reach this struct.
struct DealTask: Sendable, Codable, Equatable, Identifiable {
    let id: String
    let dealRoomId: String
    let title: String
    let description: String?
    let urgency: TaskUrgency
    let workstream: TaskWorkstream
    let status: TaskStatus
    let dueDate: String?       // ISO-8601 or nil
    let assignee: String?      // "buyer" | "agent" | "broker" — display label only
    let completedAt: String?   // ISO-8601 or nil
    let createdAt: String
    let updatedAt: String
}

// MARK: - MilestoneEventKind

/// A discriminator for the timeline's chronological record of what has
/// happened in the deal. Each kind has a canonical display name + icon
/// in the view layer.
enum MilestoneEventKind: String, Sendable, Codable, CaseIterable {
    case dealCreated = "deal_created"
    case statusChanged = "status_changed"
    case tourScheduled = "tour_scheduled"
    case tourCompleted = "tour_completed"
    case offerDrafted = "offer_drafted"
    case offerSent = "offer_sent"
    case offerAccepted = "offer_accepted"
    case offerRejected = "offer_rejected"
    case contractSigned = "contract_signed"
    case closingScheduled = "closing_scheduled"
    case closed
    case withdrawn
    case note  // buyer-visible note from broker / system

    var displayName: String {
        switch self {
        case .dealCreated: "Deal Created"
        case .statusChanged: "Status Updated"
        case .tourScheduled: "Tour Scheduled"
        case .tourCompleted: "Tour Completed"
        case .offerDrafted: "Offer Drafted"
        case .offerSent: "Offer Sent"
        case .offerAccepted: "Offer Accepted"
        case .offerRejected: "Offer Rejected"
        case .contractSigned: "Contract Signed"
        case .closingScheduled: "Closing Scheduled"
        case .closed: "Deal Closed"
        case .withdrawn: "Deal Withdrawn"
        case .note: "Note"
        }
    }

    /// SF Symbol name for the event indicator.
    var iconName: String {
        switch self {
        case .dealCreated: "sparkles"
        case .statusChanged: "arrow.right.circle"
        case .tourScheduled, .tourCompleted: "house.fill"
        case .offerDrafted, .offerSent: "doc.text"
        case .offerAccepted: "checkmark.seal.fill"
        case .offerRejected: "xmark.seal"
        case .contractSigned: "signature"
        case .closingScheduled: "calendar"
        case .closed: "flag.checkered"
        case .withdrawn: "arrow.uturn.backward"
        case .note: "note.text"
        }
    }

    /// Whether this event represents a positive outcome (for color coding).
    var isPositive: Bool {
        switch self {
        case .offerAccepted, .contractSigned, .closed: true
        default: false
        }
    }
}

// MARK: - MilestoneEvent

/// Buyer-facing timeline event. Internal-only fields (actor user IDs,
/// internal routing info, broker compensation changes) are stripped
/// at the Convex query layer — only the display-safe title, description,
/// and kind reach this struct.
struct MilestoneEvent: Sendable, Codable, Equatable, Identifiable {
    let id: String
    let dealRoomId: String
    let kind: MilestoneEventKind
    let title: String
    let description: String?
    let occurredAt: String     // ISO-8601
    let actorLabel: String?    // display name ("Your agent", "System") — never a PII user ID
}
