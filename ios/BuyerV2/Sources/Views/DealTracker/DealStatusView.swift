import SwiftUI

/// Primary deal status tab. Shows property hero, status badge,
/// list price, and key metrics for the active deal.
struct DealStatusView: View {

    let deal: DealSummary

    @Environment(DealService.self) private var dealService

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                propertyHero
                statusBadge
                listPriceSection
                metricsRow
            }
            .padding(20)
        }
        .background(Color(.systemGroupedBackground))
        .refreshable {
            await dealService.refresh()
        }
        .navigationTitle("Your Deal")
        .navigationBarTitleDisplayMode(.large)
    }

    // MARK: - Property Hero

    private var propertyHero: some View {
        VStack(alignment: .leading, spacing: 0) {
            ZStack {
                LinearGradient(
                    colors: [
                        Color(hex: 0x1B2B65).opacity(0.92),
                        Color(hex: 0x2A3F8F).opacity(0.85)
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )

                Image(systemName: "house.fill")
                    .font(.system(size: 64, weight: .regular))
                    .foregroundStyle(.white.opacity(0.88))
            }
            .frame(height: 200)
            .clipShape(
                UnevenRoundedRectangle(
                    topLeadingRadius: 12,
                    bottomLeadingRadius: 0,
                    bottomTrailingRadius: 0,
                    topTrailingRadius: 12
                )
            )

            VStack(alignment: .leading, spacing: 6) {
                Text(deal.property.address)
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(Color(hex: 0x1B2B65))
                    .lineLimit(2)

                Text(locationLine)
                    .font(.system(size: 14))
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(Color(.systemBackground))
            .clipShape(
                UnevenRoundedRectangle(
                    topLeadingRadius: 0,
                    bottomLeadingRadius: 12,
                    bottomTrailingRadius: 12,
                    topTrailingRadius: 0
                )
            )
        }
        .shadow(color: .black.opacity(0.1), radius: 6, x: 0, y: 4)
        .shadow(color: .black.opacity(0.1), radius: 4, x: 0, y: 2)
    }

    // MARK: - Status Badge

    private var statusBadge: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(statusColor)
                .frame(width: 8, height: 8)

            Text(deal.status.displayName)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(statusColor)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(statusColor.opacity(0.12))
        .clipShape(Capsule())
    }

    // MARK: - List Price

    private var listPriceSection: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("List Price")
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(.secondary)
                .textCase(.uppercase)

            Text(formattedListPrice)
                .font(.system(size: 32, weight: .bold))
                .foregroundStyle(Color(hex: 0x1B2B65))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.1), radius: 6, x: 0, y: 4)
        .shadow(color: .black.opacity(0.1), radius: 4, x: 0, y: 2)
    }

    // MARK: - Metrics Row

    private var metricsRow: some View {
        HStack(spacing: 12) {
            metricTile(
                icon: "bed.double.fill",
                value: deal.property.beds.map(String.init) ?? "—",
                label: "Beds"
            )
            metricTile(
                icon: "drop.fill",
                value: bathsString,
                label: "Baths"
            )
            metricTile(
                icon: "building.2.fill",
                value: deal.property.propertyType ?? "—",
                label: "Type"
            )
        }
    }

    private func metricTile(icon: String, value: String, label: String) -> some View {
        VStack(spacing: 8) {
            Image(systemName: icon)
                .font(.system(size: 18, weight: .medium))
                .foregroundStyle(Color(hex: 0xFF6B4A))

            Text(value)
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(Color(hex: 0x1B2B65))
                .lineLimit(1)
                .minimumScaleFactor(0.7)

            Text(label)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 16)
        .padding(.horizontal, 8)
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .shadow(color: .black.opacity(0.1), radius: 6, x: 0, y: 4)
        .shadow(color: .black.opacity(0.1), radius: 4, x: 0, y: 2)
    }

    // MARK: - Derived

    private var locationLine: String {
        "\(deal.property.city), \(deal.property.state) \(deal.property.zip)"
    }

    private var formattedListPrice: String {
        guard let price = deal.property.listPrice else { return "Price TBD" }
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.maximumFractionDigits = 0
        formatter.currencyCode = "USD"
        return formatter.string(from: NSNumber(value: price)) ?? "Price TBD"
    }

    private var bathsString: String {
        let full = deal.property.bathsFull ?? 0
        let half = deal.property.bathsHalf ?? 0
        if full == 0 && half == 0 { return "—" }
        if half == 0 { return "\(full)" }
        return "\(full).\(half)"
    }

    private var statusColor: Color {
        switch deal.status {
        case .intake, .analysis:
            return Color(hex: 0x1B2B65)
        case .tourScheduled, .offerPrep, .offerSent:
            return Color(hex: 0xFF6B4A)
        case .underContract, .closing:
            return Color(hex: 0x0FA573)
        case .closed:
            return Color(hex: 0x0B7D57)
        case .withdrawn:
            return .gray
        }
    }
}
