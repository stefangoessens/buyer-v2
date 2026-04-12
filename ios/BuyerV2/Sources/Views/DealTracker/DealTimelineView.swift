import SwiftUI

/// Timeline tab for an active deal. Renders a chronological feed of
/// MilestoneEvents grouped by day, newest-first, with a leading rail
/// of colored dots matching the event kind.
///
/// Explicit states mirror DealTasksView: loading / signed-out /
/// no-active-deal / no-events / loaded / stale / error.
struct DealTimelineView: View {

    @Environment(DealTimelineService.self) private var timelineService

    var body: some View {
        Group {
            switch timelineService.state {
            case .idle, .loading:
                loadingView
            case .signedOut:
                placeholder(
                    icon: "person.crop.circle.badge.xmark",
                    title: "Signed Out",
                    subtitle: "Sign in to see your deal timeline."
                )
            case .noActiveDeal:
                placeholder(
                    icon: "tray",
                    title: "No Active Deal",
                    subtitle: "Your deal milestones will appear here once a deal starts."
                )
            case .noEvents:
                placeholder(
                    icon: "clock.arrow.circlepath",
                    title: "No Events Yet",
                    subtitle: "The timeline fills in as your deal progresses."
                )
            case .loaded(let events):
                timelineList(events: events, isStale: false)
            case .stale(let previous):
                timelineList(events: previous, isStale: true)
            case .error(let message):
                errorView(message: message)
            }
        }
        .navigationTitle("Timeline")
        .navigationBarTitleDisplayMode(.large)
        .background(Color(.systemGroupedBackground))
        .refreshable { await timelineService.refresh() }
    }

    // MARK: - Timeline list

    @ViewBuilder
    private func timelineList(events: [MilestoneEvent], isStale: Bool) -> some View {
        let groups = groupEventsByDay(events)
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                if isStale {
                    HStack(spacing: 8) {
                        ProgressView().controlSize(.small)
                        Text("Refreshing…")
                            .font(.system(size: 13))
                            .foregroundStyle(.secondary)
                    }
                    .padding(.horizontal, 20)
                }
                ForEach(groups, id: \.0) { (dayKey, bucket) in
                    VStack(alignment: .leading, spacing: 12) {
                        Text(displayDayLabel(dayKey))
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(.secondary)
                            .textCase(.uppercase)
                            .padding(.horizontal, 20)

                        VStack(alignment: .leading, spacing: 0) {
                            ForEach(Array(bucket.enumerated()), id: \.element.id) { index, event in
                                timelineRow(
                                    event: event,
                                    isFirst: index == 0,
                                    isLast: index == bucket.count - 1
                                )
                            }
                        }
                        .padding(.horizontal, 20)
                    }
                }
            }
            .padding(.vertical, 20)
        }
    }

    // MARK: - Row

    private func timelineRow(
        event: MilestoneEvent,
        isFirst: Bool,
        isLast: Bool
    ) -> some View {
        HStack(alignment: .top, spacing: 14) {
            // Rail + indicator
            VStack(spacing: 0) {
                if !isFirst {
                    Rectangle()
                        .fill(Color(hex: 0x1B2B65).opacity(0.15))
                        .frame(width: 2, height: 12)
                } else {
                    Color.clear.frame(width: 2, height: 12)
                }
                Image(systemName: event.kind.iconName)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 32, height: 32)
                    .background(indicatorColor(for: event.kind))
                    .clipShape(Circle())
                if !isLast {
                    Rectangle()
                        .fill(Color(hex: 0x1B2B65).opacity(0.15))
                        .frame(width: 2)
                        .frame(maxHeight: .infinity)
                } else {
                    Color.clear.frame(width: 2, height: 12)
                }
            }

            // Content card
            VStack(alignment: .leading, spacing: 6) {
                Text(event.title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Color(hex: 0x1B2B65))

                if let description = event.description, !description.isEmpty {
                    Text(description)
                        .font(.system(size: 13))
                        .foregroundStyle(.secondary)
                }

                HStack(spacing: 8) {
                    Text(event.kind.displayName)
                        .font(.system(size: 11, weight: .medium))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(indicatorColor(for: event.kind).opacity(0.12))
                        .foregroundStyle(indicatorColor(for: event.kind))
                        .clipShape(Capsule())

                    if let actor = event.actorLabel, !actor.isEmpty {
                        Text(actor)
                            .font(.system(size: 11))
                            .foregroundStyle(.secondary)
                    }

                    Spacer()

                    Text(formatTime(event.occurredAt))
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(.secondary)
                }
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(.systemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .shadow(color: .black.opacity(0.06), radius: 4, x: 0, y: 2)
            .padding(.bottom, isLast ? 0 : 12)
        }
    }

    // MARK: - State placeholders

    private var loadingView: some View {
        VStack(spacing: 16) {
            ProgressView().controlSize(.large).tint(Color(hex: 0x1B2B65))
            Text("Loading timeline…")
                .font(.system(size: 14))
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func placeholder(icon: String, title: String, subtitle: String) -> some View {
        VStack(spacing: 20) {
            Spacer()
            Image(systemName: icon)
                .font(.system(size: 64))
                .foregroundStyle(Color(hex: 0x1B2B65).opacity(0.7))
            VStack(spacing: 8) {
                Text(title)
                    .font(.system(size: 22, weight: .bold))
                    .foregroundStyle(Color(hex: 0x1B2B65))
                Text(subtitle)
                    .font(.system(size: 14))
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 40)
            }
            Spacer()
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func errorView(message: String) -> some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 48))
                .foregroundStyle(Color(hex: 0xFF6B4A))
            Text("Couldn't Load Timeline")
                .font(.system(size: 20, weight: .bold))
                .foregroundStyle(Color(hex: 0x1B2B65))
            Text(message)
                .font(.system(size: 13))
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
            Button {
                Task { await timelineService.refresh() }
            } label: {
                Text("Try Again")
                    .fontWeight(.semibold)
                    .padding(.horizontal, 32)
                    .padding(.vertical, 12)
            }
            .buttonStyle(.borderedProminent)
            .tint(Color(hex: 0xFF6B4A))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Helpers

    private func indicatorColor(for kind: MilestoneEventKind) -> Color {
        if kind.isPositive { return Color(hex: 0x0FA573) }
        switch kind {
        case .offerRejected, .withdrawn: return Color(hex: 0xE85535)
        case .tourScheduled, .tourCompleted, .offerSent, .offerDrafted: return Color(hex: 0xFF6B4A)
        default: return Color(hex: 0x1B2B65)
        }
    }

    private func displayDayLabel(_ key: String) -> String {
        // key is YYYY-MM-DD
        if key.isEmpty { return "Unknown date" }
        return key
    }

    private func formatTime(_ iso: String) -> String {
        // Extract HH:mm from ISO-8601 if present
        if let tIndex = iso.firstIndex(of: "T"),
           iso.distance(from: tIndex, to: iso.endIndex) >= 6 {
            let start = iso.index(tIndex, offsetBy: 1)
            let end = iso.index(start, offsetBy: 5)
            return String(iso[start..<end])
        }
        return ""
    }
}
