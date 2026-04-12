import SwiftUI

/// Stub tab content for deal tasks.
/// Full implementation lands in KIN-796.
struct DealTasksView: View {

    var body: some View {
        VStack(spacing: 24) {
            Spacer()

            Image(systemName: "checklist")
                .font(.system(size: 72, weight: .regular))
                .foregroundStyle(Color(hex: 0x1B2B65))

            VStack(spacing: 10) {
                Text("Tasks Coming Soon")
                    .font(.system(size: 24, weight: .bold))
                    .foregroundStyle(Color(hex: 0x1B2B65))

                Text("Your deal checklist will live here.")
                    .font(.system(size: 15))
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 40)
            }

            Spacer()
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemGroupedBackground))
    }
}

#Preview {
    DealTasksView()
}
