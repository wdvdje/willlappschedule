import SwiftUI
import AppKit
import Combine

    struct CalendarLandingView: View {
        let showsSummaryCard: Bool
        let showsWeekPreview: Bool
        @State private var visibleMonth: Date = Calendar.current.date(from: Calendar.current.dateComponents([.year, .month], from: Date())) ?? Date()

        private var monthTitle: String {
            let formatter = DateFormatter()
            formatter.calendar = Calendar.current
            formatter.dateFormat = "LLLL yyyy"
            return formatter.string(from: visibleMonth)
        }

        private func moveMonth(by value: Int) {
            guard let nextMonth = Calendar.current.date(byAdding: .month, value: value, to: visibleMonth) else { return }
            visibleMonth = Calendar.current.date(from: Calendar.current.dateComponents([.year, .month], from: nextMonth)) ?? nextMonth
        }

        private func jumpToMonth(month: Int, year: Int) {
            var components = DateComponents()
            components.year = year
            components.month = month
            components.day = 1
            if let date = Calendar.current.date(from: components) {
                visibleMonth = date
            }
        }

        var body: some View {
            VStack(alignment: .leading, spacing: 16) {
                SectionHeader(title: "Calendar", eyebrow: "Time in context")

                if showsSummaryCard {
                    CalendarSummaryCard(
                        visibleMonth: visibleMonth,
                        monthTitle: monthTitle,
                        onPreviousMonth: { moveMonth(by: -1) },
                        onNextMonth: { moveMonth(by: 1) },
                        onJumpToMonth: jumpToMonth
                    )
                }

                if showsWeekPreview {
                    WeekPreviewCard()
                }

                MonthCalendarView(visibleMonth: $visibleMonth)
            }
        }
    }

    struct WeekPlanningView: View {
        let usesCompactRows: Bool
        let showsSummaryCard: Bool
        let showsWorkWeekOnly: Bool

        @EnvironmentObject private var store: PlannerStore
        @State private var visibleWeekStart: Date = WeekPlanningView.startOfWeek(for: Date())

        private static func startOfWeek(for date: Date) -> Date {
            let calendar = Calendar.current
            let components = calendar.dateComponents([.yearForWeekOfYear, .weekOfYear], from: date)
            return calendar.date(from: components) ?? date
        }

        private var weekRangeTitle: String {
            let calendar = Calendar.current
            let formatter = DateFormatter()
            formatter.calendar = calendar
            formatter.dateFormat = "MMM d"

            let daysToShow = showsWorkWeekOnly ? 5 : 7
            let endOffset = max(daysToShow - 1, 0)
            let endDate = calendar.date(byAdding: .day, value: endOffset, to: visibleWeekStart) ?? visibleWeekStart
            return "\(formatter.string(from: visibleWeekStart)) - \(formatter.string(from: endDate))"
        }

        private func moveWeek(by value: Int) {
            guard let shifted = Calendar.current.date(byAdding: .weekOfYear, value: value, to: visibleWeekStart) else { return }
            visibleWeekStart = Self.startOfWeek(for: shifted)
        }

        var body: some View {
            VStack(alignment: .leading, spacing: 16) {
                SectionHeader(title: "This Week", eyebrow: "Weekly schedule")

                if showsSummaryCard {
                    WeekScheduleControlsCard(
                        weekRangeTitle: weekRangeTitle,
                        onPreviousWeek: { moveWeek(by: -1) },
                        onNextWeek: { moveWeek(by: 1) }
                    )
                }

                ThisWeekScheduleView(
                    items: store.items,
                    compactMode: usesCompactRows,
                    showsWorkWeekOnly: showsWorkWeekOnly,
                    referenceWeekStart: visibleWeekStart
                )
            }
        }
    }

    struct ThisWeekScheduleView: View {
        private struct GridHourSlot: Equatable {
            let dayIndex: Int
            let hourOffset: Int
        }

        private struct AllDayScheduledItem: Identifiable {
            let occurrenceID: String
            let item: PlanningItem
            let occurrenceDate: Date?
            let dayIndex: Int
            let spanDays: Int

            var id: String { occurrenceID }
        }

        let items: [PlanningItem]
        let compactMode: Bool
        let showsWorkWeekOnly: Bool
        let referenceWeekStart: Date

        @EnvironmentObject private var store: PlannerStore
        @State private var selectedItemID: UUID?
        @State private var isShowingQuickCreateSheet = false
        @State private var quickCreatePrefill: WeekItemPrefill?
        @State private var editingWeekItem: PlanningItem?
        @State private var hoveredGridSlot: GridHourSlot?

        private let calendar = Calendar.current
        private let today = Date()
        private let startHour = 7
        private let endHour = 22
        private let timeColumnWidth: CGFloat = 72
        private let minimumDayWidth: CGFloat = 72
        private let snapIntervalMinutes = 30
        private let minimumEventDurationMinutes = 30
        private let allDayChipHeight: CGFloat = 24
        private let allDayRowSpacing: CGFloat = 4
        private let allDayBandTopPadding: CGFloat = 4
        private let allDayBandBottomPadding: CGFloat = 6
        private let allDayVisibleRowLimit = 2

        private var rowHeight: CGFloat {
            compactMode ? 44 : 58
        }

        private var totalHours: Int {
            endHour - startHour
        }

        private var gridHeight: CGFloat {
            CGFloat(totalHours) * rowHeight
        }

        private var startOfWeek: Date {
            let components = calendar.dateComponents([.yearForWeekOfYear, .weekOfYear], from: referenceWeekStart)
            return calendar.date(from: components) ?? referenceWeekStart
        }

        private var weekDates: [Date] {
            (0..<7).compactMap { offset in
                calendar.date(byAdding: .day, value: offset, to: startOfWeek)
            }
        }

        private var displayedWeekDates: [Date] {
            if !showsWorkWeekOnly {
                return weekDates
            }

            let weekdays = weekDates.filter { !calendar.isDateInWeekend($0) }
            return weekdays.isEmpty ? weekDates : weekdays
        }

        private var displayedDayCount: Int {
            max(displayedWeekDates.count, 1)
        }

        private var weekRangeTitle: String {
            let formatter = DateFormatter()
            formatter.calendar = calendar
            formatter.dateFormat = "MMM d"

            guard let start = displayedWeekDates.first,
                  let end = displayedWeekDates.last
            else {
                return "This week"
            }
            return "\(formatter.string(from: start)) - \(formatter.string(from: end))"
        }

        private var scheduledItems: [ScheduledPlanningItem] {
            guard let firstDisplayedDate = displayedWeekDates.first,
                  let lastDisplayedDate = displayedWeekDates.last else {
                return []
            }

            let rangeStart = calendar.startOfDay(for: firstDisplayedDate)
            let rangeEnd = calendar.startOfDay(for: lastDisplayedDate)

            var result: [ScheduledPlanningItem] = []
            var unscheduled: [PlanningItem] = []

            for item in items {
                // All-day items and timeless reminders are rendered in the dedicated all-day band.
                if item.isAllDay || (item.kind == .reminder && item.reminderTime == nil) {
                    continue
                }

                let occurrences = store.occurrenceDates(for: item, from: rangeStart, to: rangeEnd)
                if occurrences.isEmpty {
                    if resolvedStartDate(for: item) == nil {
                        unscheduled.append(item)
                    }
                    continue
                }

                for occurrenceDate in occurrences {
                    guard let dayIndex = dayIndexInDisplayedWeek(for: occurrenceDate) else { continue }
                    let resolvedStart = store.occurrenceStartDate(for: item, on: occurrenceDate) ?? occurrenceDate
                    let components = calendar.dateComponents([.hour, .minute], from: resolvedStart)
                    let rawHour = components.hour ?? baseHour(for: item.kind)
                    let clampedHour = min(max(rawHour, startHour), endHour - 1)
                    let startMinute = components.minute ?? 0

                    result.append(
                        ScheduledPlanningItem(
                            occurrenceID: "\(item.id.uuidString)-\(occurrenceDate.timeIntervalSince1970)",
                            item: item,
                            occurrenceDate: occurrenceDate,
                            dayIndex: dayIndex,
                            startHour: clampedHour,
                            startMinute: startMinute,
                            durationMinutes: resolvedDurationMinutes(for: item)
                        )
                    )
                }
            }

            for (index, item) in unscheduled.enumerated() {
                let dayIndex = index % displayedDayCount
                let cycle = (index / displayedDayCount) % 4
                let start = min(baseHour(for: item.kind) + (cycle * 2), endHour - 2)
                result.append(
                    ScheduledPlanningItem(
                        occurrenceID: "\(item.id.uuidString)-floating-\(index)",
                        item: item,
                        occurrenceDate: nil,
                        dayIndex: dayIndex,
                        startHour: start,
                        startMinute: 0,
                        durationMinutes: durationHours(for: item.kind) * 60
                    )
                )
            }

            return result
        }

        private var allDayItems: [AllDayScheduledItem] {
            guard let firstDisplayedDate = displayedWeekDates.first,
                  let lastDisplayedDate = displayedWeekDates.last else {
                return []
            }

            let rangeStart = calendar.startOfDay(for: firstDisplayedDate)
            let rangeEnd = calendar.startOfDay(for: lastDisplayedDate)

            var result: [AllDayScheduledItem] = []

            for item in items where item.isAllDay || (item.kind == .reminder && item.reminderTime == nil) {
                let occurrences = store.occurrenceDates(for: item, from: rangeStart, to: rangeEnd)
                guard !occurrences.isEmpty else { continue }

                for occurrenceDate in occurrences {
                    guard let dayIndex = dayIndexInDisplayedWeek(for: occurrenceDate) else { continue }
                    let spanDays = allDaySpanDays(for: item, occurrenceDate: occurrenceDate, startIndex: dayIndex)
                    result.append(
                        AllDayScheduledItem(
                            occurrenceID: "\(item.id.uuidString)-allDay-\(occurrenceDate.timeIntervalSince1970)",
                            item: item,
                            occurrenceDate: occurrenceDate,
                            dayIndex: dayIndex,
                            spanDays: spanDays
                        )
                    )
                }
            }

            return result
        }

        private var allDayRows: [[AllDayScheduledItem]] {
            guard !allDayItems.isEmpty else { return [] }

            var rows: [[AllDayScheduledItem]] = []
            var rowEndColumns: [Int] = []

            for item in allDayItems.sorted(by: allDayPlacementSort) {
                let startColumn = item.dayIndex
                let endColumn = item.dayIndex + max(item.spanDays, 1)

                if let rowIndex = rowEndColumns.firstIndex(where: { startColumn >= $0 }) {
                    rows[rowIndex].append(item)
                    rowEndColumns[rowIndex] = endColumn
                } else {
                    rows.append([item])
                    rowEndColumns.append(endColumn)
                }
            }

            return rows
        }

        private var visibleAllDayRows: [[AllDayScheduledItem]] {
            Array(allDayRows.prefix(allDayVisibleRowLimit))
        }

        private var hiddenAllDayItemCount: Int {
            guard allDayRows.count > allDayVisibleRowLimit else { return 0 }
            return allDayRows.dropFirst(allDayVisibleRowLimit).reduce(0) { total, row in
                total + row.count
            }
        }

        private var allDayBandHeight: CGFloat {
            guard !visibleAllDayRows.isEmpty else { return 0 }

            let rowCount = CGFloat(visibleAllDayRows.count)
            let rowsHeight = rowCount * allDayChipHeight + max(rowCount - 1, 0) * allDayRowSpacing
            let overflowHeight: CGFloat = hiddenAllDayItemCount > 0 ? 18 : 0
            return rowsHeight + allDayBandTopPadding + allDayBandBottomPadding + overflowHeight
        }

        private func allDayPlacementSort(_ lhs: AllDayScheduledItem, _ rhs: AllDayScheduledItem) -> Bool {
            if lhs.dayIndex != rhs.dayIndex {
                return lhs.dayIndex < rhs.dayIndex
            }
            if lhs.spanDays != rhs.spanDays {
                return lhs.spanDays > rhs.spanDays
            }
            return lhs.item.title.localizedCaseInsensitiveCompare(rhs.item.title) == .orderedAscending
        }

        private func allDaySpanDays(for item: PlanningItem, occurrenceDate: Date, startIndex: Int) -> Int {
            guard item.kind == .event, let endDate = item.endDate else { return 1 }

            let startOfOccurrence = calendar.startOfDay(for: occurrenceDate)
            let resolvedEnd = calendar.startOfDay(for: endDate)
            guard resolvedEnd >= startOfOccurrence else { return 1 }

            let rawSpan = (calendar.dateComponents([.day], from: startOfOccurrence, to: resolvedEnd).day ?? 0) + 1
            return min(max(rawSpan, 1), max(displayedDayCount - startIndex, 1))
        }

        private var kindSummary: String {
            let events = items.filter { $0.kind == .event }.count
            let tasks = items.filter { $0.kind == .task }.count
            let reminders = items.filter { $0.kind == .reminder }.count
            return "\(events) events  •  \(tasks) tasks  •  \(reminders) reminders"
        }

        var body: some View {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("This week")
                            .font(.headline)
                        Text(weekRangeTitle)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    Spacer()

                    Text(kindSummary)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                }

                GeometryReader { proxy in
                    let availableWidth = max(proxy.size.width, (minimumDayWidth * CGFloat(displayedDayCount)) + timeColumnWidth)
                    let dayWidth = max((availableWidth - timeColumnWidth) / CGFloat(displayedDayCount), minimumDayWidth)

                    VStack(alignment: .leading, spacing: 0) {
                        HStack(spacing: 0) {
                            Color.clear
                                .frame(width: timeColumnWidth, height: 42)

                            ForEach(displayedWeekDates, id: \.self) { date in
                                WeekDayHeader(date: date, isToday: calendar.isDateInToday(date))
                                    .frame(width: dayWidth, height: 42)
                            }
                        }

                        if allDayBandHeight > 0 {
                            HStack(alignment: .top, spacing: 0) {
                                Text("All day")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(.secondary)
                                    .frame(width: timeColumnWidth, alignment: .topTrailing)
                                    .padding(.top, allDayBandTopPadding)

                                ZStack(alignment: .topLeading) {
                                    Rectangle()
                                        .fill(Color(nsColor: .windowBackgroundColor).opacity(0.28))

                                    ForEach(Array(visibleAllDayRows.enumerated()), id: \.offset) { rowIndex, rowItems in
                                        ForEach(rowItems) { scheduled in
                                            if let bucket = store.bucket(for: scheduled.item.bucketID) {
                                                WeekAllDayBlock(
                                                    item: scheduled.item,
                                                    bucket: bucket,
                                                    isSelected: selectedItemID == scheduled.item.id,
                                                    onSelect: { selectedItemID = scheduled.item.id }
                                                )
                                                .frame(
                                                    width: max((CGFloat(max(scheduled.spanDays, 1)) * dayWidth) - 8, 0),
                                                    height: allDayChipHeight,
                                                    alignment: .leading
                                                )
                                                .position(
                                                    x: (CGFloat(scheduled.dayIndex) * dayWidth) + ((CGFloat(max(scheduled.spanDays, 1)) * dayWidth) / 2),
                                                    y: allDayBandTopPadding + (CGFloat(rowIndex) * (allDayChipHeight + allDayRowSpacing)) + (allDayChipHeight / 2)
                                                )
                                            }
                                        }
                                    }
                                }
                                .frame(width: dayWidth * CGFloat(displayedDayCount), height: allDayBandHeight, alignment: .topLeading)
                                .overlay(alignment: .bottomTrailing) {
                                    if hiddenAllDayItemCount > 0 {
                                        Text("+\(hiddenAllDayItemCount) more all-day items")
                                            .font(.caption2.weight(.semibold))
                                            .foregroundStyle(.secondary)
                                            .padding(.horizontal, 8)
                                            .padding(.vertical, 4)
                                            .background(
                                                Capsule(style: .continuous)
                                                    .fill(Color(nsColor: .windowBackgroundColor).opacity(0.34))
                                            )
                                            .overlay(
                                                Capsule(style: .continuous)
                                                    .stroke(Color(nsColor: .separatorColor).opacity(0.35), lineWidth: 1)
                                            )
                                            .padding(.trailing, 8)
                                            .padding(.bottom, 2)
                                    }
                                }
                            }
                            .padding(.bottom, 6)
                        }

                        HStack(alignment: .top, spacing: 0) {
                            VStack(spacing: 0) {
                                ForEach(startHour..<endHour, id: \.self) { hour in
                                    Text(hourLabel(hour))
                                        .font(.caption.weight(.semibold))
                                        .foregroundStyle(.secondary)
                                        .frame(width: timeColumnWidth, height: rowHeight, alignment: .topTrailing)
                                        .padding(.top, 6)
                                }
                            }

                            ZStack(alignment: .topLeading) {
                                Rectangle()
                                    .fill(Color(nsColor: .windowBackgroundColor).opacity(0.45))

                                if let hoveredGridSlot {
                                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                                        .fill(Color.accentColor.opacity(0.14))
                                        .overlay(
                                            RoundedRectangle(cornerRadius: 8, style: .continuous)
                                                .stroke(Color.accentColor.opacity(0.35), lineWidth: 1)
                                        )
                                        .frame(width: dayWidth - 4, height: rowHeight - 4)
                                        .position(
                                            x: (CGFloat(hoveredGridSlot.dayIndex) * dayWidth) + (dayWidth / 2),
                                            y: (CGFloat(hoveredGridSlot.hourOffset) * rowHeight) + (rowHeight / 2)
                                        )
                                }

                                Path { path in
                                    for index in 0...totalHours {
                                        let y = CGFloat(index) * rowHeight
                                        path.move(to: CGPoint(x: 0, y: y))
                                        path.addLine(to: CGPoint(x: dayWidth * CGFloat(displayedDayCount), y: y))
                                    }
                                }
                                .stroke(Color(nsColor: .separatorColor).opacity(0.35), lineWidth: 1)

                                Path { path in
                                    for index in 0...displayedDayCount {
                                        let x = CGFloat(index) * dayWidth
                                        path.move(to: CGPoint(x: x, y: 0))
                                        path.addLine(to: CGPoint(x: x, y: gridHeight))
                                    }
                                }
                                .stroke(Color(nsColor: .separatorColor).opacity(0.4), lineWidth: 1)
                                .contentShape(Rectangle())
                                .gesture(
                                    SpatialTapGesture(count: 1)
                                        .onEnded { value in
                                            handleGridClick(at: value.location, dayWidth: dayWidth)
                                        }
                                )
                                .onContinuousHover(coordinateSpace: .local) { phase in
                                    switch phase {
                                    case .active(let location):
                                        if let slot = hourSlot(at: location, dayWidth: dayWidth),
                                           !isHourSlotOccupied(dayIndex: slot.dayIndex, hourOffset: slot.hourOffset) {
                                            hoveredGridSlot = slot
                                        } else {
                                            hoveredGridSlot = nil
                                        }
                                    case .ended:
                                        hoveredGridSlot = nil
                                    }
                                }

                                ForEach(scheduledItems) { scheduled in
                                    if let bucket = store.bucket(for: scheduled.item.bucketID) {
                                        WeekScheduledBlock(
                                            item: scheduled.item,
                                            occurrenceDate: scheduled.occurrenceDate,
                                            bucket: bucket,
                                            isSelected: selectedItemID == scheduled.item.id,
                                            onSelect: { selectedItemID = scheduled.item.id },
                                            onEdit: { editingWeekItem = scheduled.item },
                                            showsResizeHandles: scheduled.item.kind == .event,
                                            snapMinutes: snapIntervalMinutes,
                                            onResizeStart: { deltaY in
                                                resizeEvent(
                                                    scheduled,
                                                    edge: .start,
                                                    deltaY: deltaY
                                                )
                                            },
                                            onResizeEnd: { deltaY in
                                                resizeEvent(
                                                    scheduled,
                                                    edge: .end,
                                                    deltaY: deltaY
                                                )
                                            }
                                        )
                                            .frame(
                                                width: dayWidth - 14,
                                                height: blockHeight(for: scheduled),
                                                alignment: .topLeading
                                            )
                                            .position(
                                                x: (CGFloat(scheduled.dayIndex) * dayWidth) + (dayWidth / 2),
                                                y: yPosition(for: scheduled)
                                            )
                                            .gesture(
                                                DragGesture(minimumDistance: 6)
                                                    .onEnded { value in
                                                        moveScheduledItem(
                                                            scheduled,
                                                            translation: value.translation,
                                                            dayWidth: dayWidth
                                                        )
                                                    }
                                            )
                                    }
                                }
                            }
                            .frame(width: dayWidth * CGFloat(displayedDayCount), height: gridHeight, alignment: .topLeading)
                        }
                    }
                }
                .frame(minHeight: gridHeight + 42 + allDayBandHeight)
                .padding(14)
                .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            }
            .sheet(isPresented: $isShowingQuickCreateSheet) {
                if let quickCreatePrefill {
                    NewPlanningItemSheet(destination: .events, prefill: quickCreatePrefill) { draft in
                        store.createItem(from: draft)
                    }
                } else {
                    EmptyView()
                }
            }
            .sheet(item: $editingWeekItem) { item in
                PlanningItemEditorSheet(item: item) { draft in
                    store.updateItem(itemID: item.id, from: draft)
                }
            }
        }

        private func baseHour(for kind: PlanningKind) -> Int {
            switch kind {
            case .event:
                return 9
            case .task:
                return 11
            case .reminder:
                return 16
            }
        }

        private func durationHours(for kind: PlanningKind) -> Int {
            switch kind {
            case .event:
                return 2
            case .task:
                return 1
            case .reminder:
                return 1
            }
        }

        private func blockHeight(for scheduled: ScheduledPlanningItem) -> CGFloat {
            max((CGFloat(scheduled.durationMinutes) / 60 * rowHeight) - 10, 34)
        }

        private func yPosition(for scheduled: ScheduledPlanningItem) -> CGFloat {
            let fractionalOffset = CGFloat(scheduled.startMinute) / 60
            let baseY = (CGFloat(scheduled.startHour - startHour) + fractionalOffset) * rowHeight
            return baseY + (blockHeight(for: scheduled) / 2) + 5
        }

        private func resolvedStartDate(for item: PlanningItem) -> Date? {
            switch item.kind {
            case .event:
                return mergeDateAndTime(date: item.startDate, time: item.startTime)
            case .task:
                return mergeDateAndTime(date: item.dueDate, time: item.dueTime)
            case .reminder:
                return mergeDateAndTime(date: item.reminderDate, time: item.reminderTime)
            }
        }

        private func resolvedDurationMinutes(for item: PlanningItem) -> Int {
            switch item.kind {
            case .event:
                guard let start = mergeDateAndTime(date: item.startDate, time: item.startTime) else {
                    return 120
                }

                let endBaseDate = item.endDate ?? item.startDate
                guard let end = mergeDateAndTime(date: endBaseDate, time: item.endTime) else {
                    return 120
                }

                return max(Int(end.timeIntervalSince(start) / 60), minimumEventDurationMinutes)

            case .task, .reminder:
                return 60
            }
        }

        private func mergeDateAndTime(date: Date?, time: Date?) -> Date? {
            guard let date else { return nil }
            var dateComponents = calendar.dateComponents([.year, .month, .day], from: date)

            if let time {
                let timeComponents = calendar.dateComponents([.hour, .minute], from: time)
                dateComponents.hour = timeComponents.hour ?? 0
                dateComponents.minute = timeComponents.minute ?? 0
            } else {
                dateComponents.hour = baseHour(for: .event)
                dateComponents.minute = 0
            }

            return calendar.date(from: dateComponents)
        }

        private func dayIndexInDisplayedWeek(for date: Date) -> Int? {
            for (index, weekDate) in displayedWeekDates.enumerated() {
                if calendar.isDate(date, inSameDayAs: weekDate) {
                    return index
                }
            }
            return nil
        }

        private func snappedMinutes(_ value: Int) -> Int {
            let ratio = Double(value) / Double(snapIntervalMinutes)
            return Int(ratio.rounded()) * snapIntervalMinutes
        }

        private func startDate(for scheduled: ScheduledPlanningItem) -> Date {
            let day = displayedWeekDates[scheduled.dayIndex]
            var components = calendar.dateComponents([.year, .month, .day], from: day)
            components.hour = scheduled.startHour
            components.minute = scheduled.startMinute
            return calendar.date(from: components) ?? day
        }

        private func moveScheduledItem(_ scheduled: ScheduledPlanningItem, translation: CGSize, dayWidth: CGFloat) {
            let dayShift = Int((translation.width / dayWidth).rounded())
            let minuteShift = snappedMinutes(Int(((translation.height / rowHeight) * 60).rounded()))

            guard dayShift != 0 || minuteShift != 0 else { return }

            guard let shiftedByDay = calendar.date(byAdding: .day, value: dayShift, to: startDate(for: scheduled)),
                  let shiftedByTime = calendar.date(byAdding: .minute, value: minuteShift, to: shiftedByDay)
            else {
                return
            }

            store.moveItem(
                itemID: scheduled.item.id,
                to: shiftedByTime,
                durationMinutes: scheduled.item.kind == .event ? scheduled.durationMinutes : nil
            )
        }

        private enum EventResizeEdge {
            case start
            case end
        }

        private func resizeEvent(_ scheduled: ScheduledPlanningItem, edge: EventResizeEdge, deltaY: CGFloat) {
            guard scheduled.item.kind == .event else { return }

            let snappedDelta = snappedMinutes(Int(((deltaY / rowHeight) * 60).rounded()))
            guard snappedDelta != 0 else { return }

            let initialStart = startDate(for: scheduled)
            var updatedStart = initialStart
            var updatedDuration = scheduled.durationMinutes

            switch edge {
            case .start:
                updatedStart = calendar.date(byAdding: .minute, value: snappedDelta, to: initialStart) ?? initialStart
                updatedDuration = max(scheduled.durationMinutes - snappedDelta, minimumEventDurationMinutes)

            case .end:
                updatedDuration = max(scheduled.durationMinutes + snappedDelta, minimumEventDurationMinutes)
            }

            store.resizeEvent(
                itemID: scheduled.item.id,
                toStart: updatedStart,
                durationMinutes: updatedDuration
            )
        }

        private func hourSlot(at location: CGPoint, dayWidth: CGFloat) -> GridHourSlot? {
            guard location.x >= 0, location.y >= 0 else { return nil }

            let rawDayIndex = Int((location.x / dayWidth).rounded(.down))
            let dayIndex = min(max(rawDayIndex, 0), displayedDayCount - 1)

            let rawHourOffset = Int((location.y / rowHeight).rounded(.down))
            let hourOffset = min(max(rawHourOffset, 0), totalHours - 1)

            return GridHourSlot(dayIndex: dayIndex, hourOffset: hourOffset)
        }

        private func handleGridClick(at location: CGPoint, dayWidth: CGFloat) {
            guard let slot = hourSlot(at: location, dayWidth: dayWidth) else { return }
            guard !isHourSlotOccupied(dayIndex: slot.dayIndex, hourOffset: slot.hourOffset) else { return }

            let slotDay = displayedWeekDates[slot.dayIndex]

            var components = calendar.dateComponents([.year, .month, .day], from: slotDay)
            components.hour = startHour + slot.hourOffset
            components.minute = 0

            guard let start = calendar.date(from: components),
                  let end = calendar.date(byAdding: .minute, value: 60, to: start)
            else {
                return
            }

            quickCreatePrefill = WeekItemPrefill(
                kind: .event,
                domain: .personal,
                start: start,
                end: end,
                isAllDay: false
            )
            isShowingQuickCreateSheet = true
        }

        private func isHourSlotOccupied(dayIndex: Int, hourOffset: Int) -> Bool {
            let slotStartMinutes = hourOffset * 60
            let slotEndMinutes = slotStartMinutes + 60

            return scheduledItems.contains { scheduled in
                guard scheduled.dayIndex == dayIndex else { return false }

                let itemStartMinutes = ((scheduled.startHour - startHour) * 60) + scheduled.startMinute
                let itemEndMinutes = itemStartMinutes + scheduled.durationMinutes

                return max(slotStartMinutes, itemStartMinutes) < min(slotEndMinutes, itemEndMinutes)
            }
        }

        private func hourLabel(_ hour: Int) -> String {
            var components = DateComponents()
            components.hour = hour
            let date = calendar.date(from: components) ?? today

            let formatter = DateFormatter()
            formatter.dateFormat = "h a"
            return formatter.string(from: date)
        }
    }

    struct WeekAllDayBlock: View {
        let item: PlanningItem
        let bucket: PlannerBucket
        let isSelected: Bool
        let onSelect: () -> Void

        @State private var isHovering = false

        private var borderColor: Color {
            if isSelected {
                return Color.accentColor.opacity(0.92)
            }
            if isHovering {
                return Color(hex: bucket.colorHex).opacity(0.7)
            }
            return Color(hex: bucket.colorHex).opacity(0.38)
        }

        private var fillColor: Color {
            if isSelected {
                return Color(hex: bucket.colorHex).opacity(0.34)
            }
            if isHovering {
                return Color(hex: bucket.colorHex).opacity(0.24)
            }
            return Color(hex: bucket.colorHex).opacity(0.18)
        }

        var body: some View {
            HStack(spacing: 6) {
                Image(systemName: bucket.icon)
                    .font(.caption2)
                Text(item.title)
                    .font(.caption.weight(.semibold))
                    .lineLimit(1)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 8)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 9, style: .continuous)
                    .fill(fillColor)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 9, style: .continuous)
                    .stroke(borderColor, lineWidth: isSelected ? 1.4 : 1)
            )
            .contentShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
            .onTapGesture {
                onSelect()
            }
            .onHover { hovering in
                isHovering = hovering
            }
        }
    }

    struct WeekDayHeader: View {
        let date: Date
        let isToday: Bool

        private let calendar = Calendar.current

        var body: some View {
            VStack(spacing: 2) {
                Text(shortDay)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                Text("\(calendar.component(.day, from: date))")
                    .font(.headline.weight(isToday ? .semibold : .regular))
                    .foregroundStyle(isToday ? .primary : .secondary)
            }
            .frame(height: 42)
        }

        private var shortDay: String {
            let formatter = DateFormatter()
            formatter.dateFormat = "EEE"
            return formatter.string(from: date).uppercased()
        }
    }

    struct WeekScheduledBlock: View {
        let item: PlanningItem
        let occurrenceDate: Date?
        let bucket: PlannerBucket

        let isSelected: Bool
        let onSelect: () -> Void
        let onEdit: () -> Void
        let showsResizeHandles: Bool
        let snapMinutes: Int
        let onResizeStart: ((CGFloat) -> Void)?
        let onResizeEnd: ((CGFloat) -> Void)?

        @EnvironmentObject private var store: PlannerStore
        @State private var isHovering = false

        private var borderColor: Color {
            if isSelected {
                return Color.accentColor.opacity(0.9)
            }
            if isHovering {
                return Color(hex: bucket.colorHex).opacity(0.6)
            }
            return Color(hex: bucket.colorHex).opacity(0.32)
        }

        private var fillColor: Color {
            if isSelected {
                return Color(hex: bucket.colorHex).opacity(0.32)
            }
            if isHovering {
                return Color(hex: bucket.colorHex).opacity(0.26)
            }
            return Color(hex: bucket.colorHex).opacity(0.2)
        }

        var body: some View {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Image(systemName: bucket.icon)
                        .font(.caption)
                    Text(item.title)
                        .font(.caption.weight(.semibold))
                        .lineLimit(2)
                }

                Text(item.kind.rawValue.capitalized)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 7)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background(
                RoundedRectangle(cornerRadius: 11, style: .continuous)
                    .fill(fillColor)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 11, style: .continuous)
                    .stroke(borderColor, lineWidth: isSelected ? 1.4 : 1)
            )
            .overlay(alignment: .top) {
                if showsResizeHandles {
                    Capsule(style: .continuous)
                        .fill(Color.primary.opacity(isHovering ? 0.34 : 0.22))
                        .frame(width: 34, height: 5)
                        .padding(.top, 4)
                        .contentShape(Rectangle())
                        .gesture(
                            DragGesture(minimumDistance: 3)
                                .onEnded { value in
                                    onResizeStart?(value.translation.height)
                                }
                        )
                        .help("Drag to resize start (\(snapMinutes)-minute snap)")
                }
            }
            .overlay(alignment: .bottom) {
                if showsResizeHandles {
                    Capsule(style: .continuous)
                        .fill(Color.primary.opacity(isHovering ? 0.34 : 0.22))
                        .frame(width: 34, height: 5)
                        .padding(.bottom, 4)
                        .contentShape(Rectangle())
                        .gesture(
                            DragGesture(minimumDistance: 3)
                                .onEnded { value in
                                    onResizeEnd?(value.translation.height)
                                }
                        )
                        .help("Drag to resize end (\(snapMinutes)-minute snap)")
                }
            }
            .contentShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
            .onTapGesture {
                onSelect()
            }
            .onHover { hovering in
                isHovering = hovering
            }
            .contextMenu {
                Button {
                    onEdit()
                } label: {
                    Label("Edit", systemImage: "pencil")
                }

                Button {
                    store.duplicateItem(itemID: item.id)
                } label: {
                    Label("Duplicate", systemImage: "plus.square.on.square")
                }

                if item.kind == .task {
                    Button {
                        store.toggleTaskCompletion(itemID: item.id)
                    } label: {
                        Label(
                            item.isCompleted ? "Mark Incomplete" : "Mark Complete",
                            systemImage: item.isCompleted ? "circle" : "checkmark.circle"
                        )
                    }
                }

                if item.kind == .reminder {
                    Button {
                        store.setReminderRead(itemID: item.id, isRead: !item.isRead)
                    } label: {
                        Label(
                            item.isRead ? "Mark Unread" : "Mark Read",
                            systemImage: item.isRead ? "envelope.badge" : "checkmark.message"
                        )
                    }
                }

                Divider()

                Button(role: .destructive) {
                    store.deleteItem(itemID: item.id)
                } label: {
                    Label("Delete", systemImage: "trash")
                }
            }
            .help("Right-click for quick actions")
        }
    }

    struct ScheduledPlanningItem: Identifiable {
        let occurrenceID: String
        let item: PlanningItem
        let occurrenceDate: Date?
        let dayIndex: Int
        let startHour: Int
        let startMinute: Int
        let durationMinutes: Int

        var id: String { occurrenceID }
    }

    struct MonthCalendarView: View {
        private let calendar = Calendar.current
        private let weekdaySymbols = Calendar.current.shortWeekdaySymbols
        private let columns = Array(repeating: GridItem(.flexible(), spacing: 10), count: 7)
        @EnvironmentObject private var store: PlannerStore
        @Binding var visibleMonth: Date
        @State private var selectedDate: Date? = nil
        @State private var isShowingCreateItemSheet = false
        @State private var createItemPrefill: WeekItemPrefill?
        @State private var editingDayItem: PlanningItem?

        private var leadingEmptyCells: Int {
            let start = startOfMonth
            let weekdayIndex = calendar.component(.weekday, from: start) - calendar.firstWeekday
            return (weekdayIndex + 7) % 7
        }

        private var daysInMonth: Int {
            calendar.range(of: .day, in: .month, for: visibleMonth)?.count ?? 30
        }

        private var startOfMonth: Date {
            let components = calendar.dateComponents([.year, .month], from: visibleMonth)
            return calendar.date(from: components) ?? visibleMonth
        }

        private var monthCells: [MonthCell] {
            var cells: [MonthCell] = []

            if leadingEmptyCells > 0 {
                cells.append(contentsOf: Array(repeating: MonthCell.empty, count: leadingEmptyCells))
            }

            for day in 1...daysInMonth {
                guard let date = calendar.date(byAdding: .day, value: day - 1, to: startOfMonth) else { continue }
                cells.append(MonthCell(date: date, dayNumber: day, isToday: calendar.isDateInToday(date)))
            }

            while cells.count % 7 != 0 {
                cells.append(.empty)
            }

            return cells
        }

        var body: some View {
            VStack(alignment: .leading, spacing: 12) {
                LazyVGrid(columns: columns, spacing: 10) {
                    ForEach(weekdaySymbols, id: \.self) { symbol in
                        Text(symbol.uppercased())
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity)
                    }

                    ForEach(monthCells) { cell in
                        if let date = cell.date {
                            MonthCellView(
                                cell: cell,
                                isSelected: isSelectedDate(date),
                                onTap: {
                                    selectedDate = date
                                }
                            )
                            .popover(
                                isPresented: dayPopoverBinding(for: date),
                                attachmentAnchor: .rect(.bounds),
                                arrowEdge: .bottom
                            ) {
                                dayPopoverContent(for: date)
                            }
                        } else {
                            MonthCellView(cell: cell, isSelected: false, onTap: {})
                        }
                    }
                }
                .padding(14)
                .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            }
            .sheet(isPresented: $isShowingCreateItemSheet) {
                if let createItemPrefill {
                    NewPlanningItemSheet(destination: .events, prefill: createItemPrefill) { draft in
                        store.createItem(from: draft)
                    }
                }
            }
            .sheet(item: $editingDayItem) { item in
                PlanningItemEditorSheet(item: item) { draft in
                    store.updateItem(itemID: item.id, from: draft)
                }
            }
        }

        private func items(for date: Date) -> [PlanningItem] {
            store.items
                .filter { item in
                    store.occurs(item, on: date)
                }
                .sorted { lhs, rhs in
                    let lhsDate = store.occurrenceStartDate(for: lhs, on: date) ?? .distantFuture
                    let rhsDate = store.occurrenceStartDate(for: rhs, on: date) ?? .distantFuture
                    return lhsDate < rhsDate
                }
        }

        private func isSelectedDate(_ date: Date) -> Bool {
            guard let selectedDate else { return false }
            return calendar.isDate(selectedDate, inSameDayAs: date)
        }

        private func dayPopoverBinding(for date: Date) -> Binding<Bool> {
            Binding(
                get: { isSelectedDate(date) },
                set: { isPresented in
                    if isPresented {
                        selectedDate = date
                    } else if isSelectedDate(date) {
                        selectedDate = nil
                    }
                }
            )
        }

        @ViewBuilder
        private func dayPopoverContent(for date: Date) -> some View {
            let dayItems = items(for: date)

            VStack(alignment: .leading, spacing: 10) {
                Text(date.formatted(date: .abbreviated, time: .omitted))
                    .font(.headline)

                if dayItems.isEmpty {
                    Text("No items scheduled for this day.")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(dayItems.prefix(6)) { item in
                        HStack(spacing: 8) {
                            Image(systemName: item.icon)
                                .font(.caption)
                                .foregroundStyle(.secondary)

                            VStack(alignment: .leading, spacing: 2) {
                                Text(item.title)
                                    .font(.callout)
                                Text(item.kind.rawValue.capitalized)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }

                            Spacer()

                            if item.repeatRule == .alternateWorkdays {
                                Button("Skip") {
                                    store.skipOccurrence(itemID: item.id, date: date)
                                }
                                .buttonStyle(.bordered)
                                .controlSize(.small)
                            }

                            Button("Edit") {
                                selectedDate = nil
                                editingDayItem = item
                            }
                            .buttonStyle(.bordered)
                            .controlSize(.small)
                        }
                    }

                    if dayItems.count > 6 {
                        Text("+\(dayItems.count - 6) more")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                Divider()

                Button {
                    selectedDate = nil
                    createItemPrefill = prefill(for: date)
                    isShowingCreateItemSheet = true
                } label: {
                    Label("New Item", systemImage: "plus")
                }
                .buttonStyle(.borderedProminent)
            }
            .padding(14)
            .frame(width: 320, alignment: .leading)
        }

        private func prefill(for date: Date) -> WeekItemPrefill {
            let dayStart = calendar.startOfDay(for: date)
            let start = calendar.date(byAdding: .hour, value: 9, to: dayStart) ?? date
            let end = calendar.date(byAdding: .hour, value: 1, to: start) ?? start

            return WeekItemPrefill(
                kind: .event,
                domain: .personal,
                start: start,
                end: end,
                isAllDay: false
            )
        }

        private func dateForItem(_ item: PlanningItem) -> Date? {
            switch item.kind {
            case .event:
                return item.startDate ?? item.endDate
            case .task:
                return item.dueDate
            case .reminder:
                return item.reminderDate
            }
        }
    }

    struct WeekPreviewCard: View {
        private let calendar = Calendar.current
        private let columns = Array(repeating: GridItem(.flexible(), spacing: 10), count: 7)
        private let today = Date()

        private var weekDates: [Date] {
            let start = startOfWeek
            return (0..<7).compactMap { offset in
                calendar.date(byAdding: .day, value: offset, to: start)
            }
        }

        private var startOfWeek: Date {
            let components = calendar.dateComponents([.yearForWeekOfYear, .weekOfYear], from: today)
            return calendar.date(from: components) ?? today
        }

        private var weekRangeTitle: String {
            let formatter = DateFormatter()
            formatter.calendar = calendar
            formatter.dateFormat = "MMM d"

            guard let end = weekDates.last else { return "This week" }
            return "\(formatter.string(from: startOfWeek)) - \(formatter.string(from: end))"
        }

        private var weekCells: [MonthCell] {
            weekDates.map { date in
                MonthCell(date: date, dayNumber: calendar.component(.day, from: date), isToday: calendar.isDateInToday(date))
            }
        }

        var body: some View {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Week preview")
                            .font(.headline)
                        Text(weekRangeTitle)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    Spacer()
                }

                LazyVGrid(columns: columns, spacing: 10) {
                    ForEach(calendar.shortWeekdaySymbols, id: \.self) { symbol in
                        Text(symbol.uppercased())
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity)
                    }

                    ForEach(weekCells) { cell in
                        MonthCellView(cell: cell, isSelected: false, onTap: {})
                    }
                }
                .padding(14)
                .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            }
        }
    }

    struct MonthCell: Identifiable {
        let id = UUID()
        let date: Date?
        let dayNumber: Int?
        let isToday: Bool

        static let empty = MonthCell(date: nil, dayNumber: nil, isToday: false)
    }

    struct MonthCellView: View {
        let cell: MonthCell
        let isSelected: Bool
        let onTap: () -> Void

        var body: some View {
            Group {
                if let dayNumber = cell.dayNumber {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("\(dayNumber)")
                            .font(.subheadline.weight(cell.isToday ? .semibold : .regular))
                            .foregroundStyle(cell.isToday ? .primary : .secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)

                        Spacer()

                        RoundedRectangle(cornerRadius: 999, style: .continuous)
                            .fill(cell.isToday ? Color.accentColor.opacity(0.95) : Color.accentColor.opacity(0.12))
                            .frame(width: cell.isToday ? 22 : 14, height: cell.isToday ? 22 : 14)
                            .overlay(
                                Text(cell.isToday ? "•" : "")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(.white)
                            )
                    }
                    .padding(10)
                    .frame(height: 86, alignment: .topLeading)
                    .background(
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .fill(cell.isToday ? Color.accentColor.opacity(0.14) : Color(nsColor: .windowBackgroundColor))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .stroke(
                                isSelected ? Color.accentColor.opacity(0.7) : (cell.isToday ? Color.accentColor.opacity(0.3) : Color(nsColor: .separatorColor).opacity(0.5)),
                                lineWidth: isSelected ? 2 : 1
                            )
                    )
                    .contentShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .onTapGesture(perform: onTap)
                } else {
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .fill(Color.clear)
                        .frame(height: 86)
                }
            }
        }
    }

    struct CalendarSummaryCard: View {
        private struct MonthMenuItem: Identifiable {
            let id: Int
            let monthNumber: Int
            let title: String
        }

        let visibleMonth: Date?
        let monthTitle: String?
        let onPreviousMonth: (() -> Void)?
        let onNextMonth: (() -> Void)?
        let onJumpToMonth: ((Int, Int) -> Void)?

        private var monthSymbols: [String] {
            Calendar.current.monthSymbols
        }

        private var selectableYears: [Int] {
            let currentYear = Calendar.current.component(.year, from: Date())
            return Array(Array((currentYear - 10)...(currentYear + 10)).reversed())
        }

        private var selectedYear: Int? {
            guard let visibleMonth else { return nil }
            return Calendar.current.component(.year, from: visibleMonth)
        }

        private var selectedMonth: Int? {
            guard let visibleMonth else { return nil }
            return Calendar.current.component(.month, from: visibleMonth)
        }

        private var monthMenuItems: [MonthMenuItem] {
            monthSymbols.enumerated().map { index, symbol in
                MonthMenuItem(id: index, monthNumber: index + 1, title: symbol)
            }
        }

        init(
            visibleMonth: Date? = nil,
            monthTitle: String? = nil,
            onPreviousMonth: (() -> Void)? = nil,
            onNextMonth: (() -> Void)? = nil,
            onJumpToMonth: ((Int, Int) -> Void)? = nil
        ) {
            self.visibleMonth = visibleMonth
            self.monthTitle = monthTitle
            self.onPreviousMonth = onPreviousMonth
            self.onNextMonth = onNextMonth
            self.onJumpToMonth = onJumpToMonth
        }

        var body: some View {
            HStack(spacing: 18) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Month view")
                        .font(.headline)

                    if let monthTitle,
                       let onJumpToMonth {
                        Menu {
                            ForEach(selectableYears, id: \.self) { year in
                                Menu("\(year)") {
                                    monthMenuContent(year: year, onJumpToMonth: onJumpToMonth)
                                }
                            }
                        } label: {
                            HStack(spacing: 6) {
                                Text(monthTitle)
                                Image(systemName: "chevron.down")
                                    .font(.caption.weight(.semibold))
                            }
                        }
                        .menuIndicator(.hidden)
                        .menuStyle(.borderlessButton)

                        Text("Browse your month")
                            .foregroundStyle(.secondary)
                    } else {
                        Text("This view will hold the month grid, day detail, and drag-friendly scheduling tools.")
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }

                Spacer()

                if let onPreviousMonth,
                   let onNextMonth,
                   visibleMonth != nil {
                    HStack(spacing: 10) {
                        Button("Previous") {
                            onPreviousMonth()
                        }
                        .buttonStyle(.bordered)

                        Button("Next") {
                            onNextMonth()
                        }
                        .buttonStyle(.borderedProminent)
                    }
                } else {
                    VStack(alignment: .trailing, spacing: 8) {
                        Text("Calendar workspace")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                        Text("Ready for month/day expansion")
                            .multilineTextAlignment(.trailing)
                            .frame(width: 180)
                    }
                }
            }
            .padding(20)
            .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        }

        @ViewBuilder
        private func monthMenuContent(year: Int, onJumpToMonth: @escaping (Int, Int) -> Void) -> some View {
            ForEach(monthMenuItems) { item in
                Button {
                    onJumpToMonth(item.monthNumber, year)
                } label: {
                    HStack {
                        Text(item.title)
                        Spacer()
                        if isCurrentSelection(year: year, month: item.monthNumber) {
                            Image(systemName: "checkmark")
                                .foregroundStyle(Color.accentColor)
                        }
                    }
                }
            }
        }

        private func isCurrentSelection(year: Int, month: Int) -> Bool {
            selectedYear == year && selectedMonth == month
        }
    }

    struct WeekScheduleControlsCard: View {
        let weekRangeTitle: String
        let onPreviousWeek: () -> Void
        let onNextWeek: () -> Void

        var body: some View {
            HStack(spacing: 18) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Week schedule")
                        .font(.headline)

                    Text(weekRangeTitle)
                        .foregroundStyle(.secondary)

                    Text("Schedule grid")
                        .foregroundStyle(.secondary)
                }

                Spacer()

                HStack(spacing: 10) {
                    Button("Previous") {
                        onPreviousWeek()
                    }
                    .buttonStyle(.bordered)

                    Button("Next") {
                        onNextWeek()
                    }
                    .buttonStyle(.borderedProminent)
                }
            }
            .padding(20)
            .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        }
    }

