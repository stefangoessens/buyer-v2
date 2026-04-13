import SwiftUI

/// Tasks tab for an active deal. Renders a sectioned list of tasks
/// grouped by urgency (High → Medium → Low → None), with open tasks
/// ordered before completed within each bucket.
///
/// Explicit states: loading, signed-out, no-active-deal, no-tasks,
/// loaded, stale (refreshing with prior data visible), error.
struct DealTasksView: View {

    @Environment(DealTasksService.self) private var tasksService

    var body: some View {
        Group {
            switch tasksService.state {
            case .idle, .loading:
                loadingView
            case .signedOut:
                placeholder(
                    icon: "person.crop.circle.badge.xmark",
                    title: "Signed Out",
                    subtitle: "Sign in to see your tasks."
                )
            case .noActiveDeal:
                placeholder(
                    icon: "tray",
                    title: "No Active Deal",
                    subtitle: "Paste a property link on the web to start a deal."
                )
            case .noTasks:
                placeholder(
                    icon: "checkmark.seal",
                    title: "No Tasks Yet",
                    subtitle: "Your agent will add deal tasks here as they come up."
                )
            case .loaded(let tasks):
                tasksList(tasks: tasks, isStale: false)
            case .stale(let previous):
                tasksList(tasks: previous, isStale: true)
            case .error(let message):
                errorView(message: message)
            }
        }
        .navigationTitle("Tasks")
        .navigationBarTitleDisplayMode(.large)
        .background(Color(.systemGroupedBackground))
        .refreshable { await tasksService.refresh() }
    }

    // MARK: - Loaded list

    @ViewBuilder
    private func tasksList(tasks: [DealTask], isStale: Bool) -> some View {
        let groups = groupTasksByUrgency(tasks)
        List {
            if isStale {
                Section {
                    HStack(spacing: 8) {
                        ProgressView().controlSize(.small)
                        Text("Refreshing…")
                            .font(.system(size: 13))
                            .foregroundStyle(.secondary)
                    }
                }
                .listRowBackground(Color.clear)
            }
            ForEach(groups, id: \.0) { urgency, bucket in
                Section {
                    ForEach(bucket) { task in
                        taskRow(task: task)
                    }
                } header: {
                    Text(urgency.displayName)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(urgencyColor(urgency))
                        .textCase(nil)
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    // MARK: - Task row

    private func taskRow(task: DealTask) -> some View {
        HStack(alignment: .top, spacing: 12) {
            // Status indicator
            Image(systemName: task.status == .completed
                  ? "checkmark.circle.fill"
                  : (task.status == .blocked ? "exclamationmark.octagon.fill" : "circle"))
                .font(.system(size: 20))
                .foregroundStyle(statusColor(task.status))
                .padding(.top, 2)

            VStack(alignment: .leading, spacing: 6) {
                Text(task.title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(
                        task.status == .completed
                        ? Color.secondary
                        : Color(hex: 0x1B2B65)
                    )
                    .strikethrough(task.status == .completed)
                    .lineLimit(2)

                if let description = task.description, !description.isEmpty {
                    Text(description)
                        .font(.system(size: 13))
                        .foregroundStyle(.secondary)
                        .lineLimit(3)
                }

                HStack(spacing: 8) {
                    // Workstream tag
                    Text(task.workstream.displayName)
                        .font(.system(size: 11, weight: .medium))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(Color(hex: 0x1B2B65).opacity(0.08))
                        .foregroundStyle(Color(hex: 0x1B2B65))
                        .clipShape(Capsule())

                    // Status tag if not pending
                    if task.status != .pending {
                        Text(task.status.displayName)
                            .font(.system(size: 11, weight: .medium))
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(statusColor(task.status).opacity(0.12))
                            .foregroundStyle(statusColor(task.status))
                            .clipShape(Capsule())
                    }

                    Spacer()

                    // Due date
                    if let due = task.dueDate, !due.isEmpty {
                        Text(formatDueDate(due))
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
        .padding(.vertical, 4)
    }

    // MARK: - State placeholders

    private var loadingView: some View {
        VStack(spacing: 16) {
            ProgressView().controlSize(.large).tint(Color(hex: 0x1B2B65))
            Text("Loading tasks…")
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
            Text("Couldn't Load Tasks")
                .font(.system(size: 20, weight: .bold))
                .foregroundStyle(Color(hex: 0x1B2B65))
            Text(message)
                .font(.system(size: 13))
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
            Button {
                Task { await tasksService.refresh() }
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

    // MARK: - Color helpers

    private func urgencyColor(_ urgency: TaskUrgency) -> Color {
        switch urgency {
        case .high: Color(hex: 0xE85535)
        case .medium: Color(hex: 0xFF8A70)
        case .low: Color(hex: 0x1B2B65)
        case .none: .secondary
        }
    }

    private func statusColor(_ status: TaskStatus) -> Color {
        switch status {
        case .completed: Color(hex: 0x0FA573)
        case .inProgress: Color(hex: 0x1B2B65)
        case .blocked: Color(hex: 0xE85535)
        case .pending: .secondary
        }
    }

    private func formatDueDate(_ iso: String) -> String {
        // Trim to date portion if full ISO timestamp
        if iso.count >= 10 { return String(iso.prefix(10)) }
        return iso
    }
}
