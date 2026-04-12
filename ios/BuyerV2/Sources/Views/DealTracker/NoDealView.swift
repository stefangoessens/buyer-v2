import SwiftUI

/// Empty state shown when the authenticated buyer has no active deals.
/// Guides the user toward pasting a property link on the web to start a deal.
struct NoDealView: View {

    var body: some View {
        VStack(spacing: 28) {
            Spacer()

            Image(systemName: "house.circle.fill")
                .font(.system(size: 88, weight: .regular))
                .foregroundStyle(Color(hex: 0x1B2B65))
                .padding(.bottom, 4)

            VStack(spacing: 12) {
                Text("No Active Deals")
                    .font(.system(size: 28, weight: .bold))
                    .foregroundStyle(Color(hex: 0x1B2B65))
                    .multilineTextAlignment(.center)

                Text("Paste a property link on the web to start your first deal.")
                    .font(.system(size: 16, weight: .regular))
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 40)
                    .lineSpacing(2)
            }

            Spacer()
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemBackground))
    }
}

#Preview {
    NoDealView()
}
