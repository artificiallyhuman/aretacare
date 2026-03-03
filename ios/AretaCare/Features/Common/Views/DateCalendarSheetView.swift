import SwiftUI

struct DateCalendarSheetView: View {
    let sortedDates: [JournalDateInfo]
    let selectedDate: String?
    let title: String
    let countLabel: (Int) -> String
    let onSelect: (JournalDateInfo) -> Void
    let onDismiss: () -> Void

    var body: some View {
        NavigationStack {
            List {
                ForEach(groupedByMonth, id: \.month) { group in
                    Section(group.month) {
                        ForEach(group.dates) { dateInfo in
                            Button {
                                onSelect(dateInfo)
                            } label: {
                                dateRow(dateInfo)
                            }
                            .listRowBackground(
                                dateInfo.date == selectedDate
                                    ? Color.accentColor.opacity(0.1)
                                    : Color.clear
                            )
                        }
                    }
                }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { onDismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func dateRow(_ dateInfo: JournalDateInfo) -> some View {
        HStack {
            if let date = Date.fromAPIDateString(dateInfo.date) {
                VStack(alignment: .leading, spacing: 2) {
                    if date.isToday {
                        Text("Today")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Color.accentColor)
                    } else {
                        Text(date.weekdayDateString)
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(.primary)
                    }
                }
            }

            Spacer()

            Text(countLabel(dateInfo.entryCount))
                .font(.caption)
                .foregroundStyle(.secondary)

            if dateInfo.date == selectedDate {
                Image(systemName: "checkmark")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(Color.accentColor)
            }
        }
    }

    private struct MonthGroup {
        let month: String
        let dates: [JournalDateInfo]
    }

    private var groupedByMonth: [MonthGroup] {
        let formatter = DateFormatter()
        formatter.dateFormat = "MMMM yyyy"

        var groups: [String: [JournalDateInfo]] = [:]
        var order: [String] = []

        for dateInfo in sortedDates {
            if let date = Date.fromAPIDateString(dateInfo.date) {
                let key = formatter.string(from: date)
                if groups[key] == nil {
                    order.append(key)
                }
                groups[key, default: []].append(dateInfo)
            }
        }

        return order.map { MonthGroup(month: $0, dates: groups[$0] ?? []) }
    }
}
