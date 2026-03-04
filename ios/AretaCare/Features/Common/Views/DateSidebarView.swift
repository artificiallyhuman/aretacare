import SwiftUI

/// A persistent date sidebar for iPad. Shows dates grouped by month,
/// matching the style of DateCalendarSheetView but displayed inline.
struct DateSidebarView: View {
    let sortedDates: [JournalDateInfo]
    let selectedDate: String?
    let countLabel: (Int) -> String
    let onSelect: (JournalDateInfo) -> Void
    var onShowAll: (() -> Void)? = nil

    var body: some View {
        List {
            if let onShowAll {
                Button {
                    onShowAll()
                } label: {
                    HStack {
                        Text("All Dates")
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(.primary)
                        Spacer()
                        if selectedDate == nil {
                            Image(systemName: "checkmark")
                                .font(.caption.weight(.bold))
                                .foregroundStyle(Color.accentColor)
                        }
                    }
                }
                .listRowBackground(selectedDate == nil ? Color.accentColor.opacity(0.1) : Color.clear)
            }

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
        .listStyle(.sidebar)
    }

    private func dateRow(_ dateInfo: JournalDateInfo) -> some View {
        HStack {
            if let date = Date.fromAPIDateString(dateInfo.date) {
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

    // MARK: - Grouping

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
