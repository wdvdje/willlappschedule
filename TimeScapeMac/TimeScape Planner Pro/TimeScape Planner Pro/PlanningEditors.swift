import SwiftUI
import AppKit
import UniformTypeIdentifiers

    struct ItemIconChoice: Identifiable {
        let symbolName: String
        let label: String

        var id: String { symbolName }
    }

    struct ItemIconCategory: Identifiable {
        let title: String
        let choices: [ItemIconChoice]

        var id: String { title }
    }

    private let planningItemIconCategories: [ItemIconCategory] = [
        ItemIconCategory(title: "Quick Picks", choices: [
            ItemIconChoice(symbolName: "calendar", label: "Calendar"),
            ItemIconChoice(symbolName: "checkmark.circle", label: "Task"),
            ItemIconChoice(symbolName: "bell", label: "Reminder"),
            ItemIconChoice(symbolName: "star", label: "Star"),
            ItemIconChoice(symbolName: "flag", label: "Flag"),
            ItemIconChoice(symbolName: "clock", label: "Clock")
        ]),
        ItemIconCategory(title: "Planning", choices: [
            ItemIconChoice(symbolName: "calendar", label: "Calendar"),
            ItemIconChoice(symbolName: "calendar.badge.plus", label: "Calendar Add"),
            ItemIconChoice(symbolName: "bell", label: "Reminder"),
            ItemIconChoice(symbolName: "alarm", label: "Alarm"),
            ItemIconChoice(symbolName: "timer", label: "Timer"),
            ItemIconChoice(symbolName: "bookmark", label: "Bookmark"),
            ItemIconChoice(symbolName: "checklist", label: "Checklist"),
            ItemIconChoice(symbolName: "list.bullet", label: "List")
        ]),
        ItemIconCategory(title: "Work", choices: [
            ItemIconChoice(symbolName: "briefcase", label: "Work"),
            ItemIconChoice(symbolName: "building.2", label: "Office"),
            ItemIconChoice(symbolName: "laptopcomputer", label: "Computer"),
            ItemIconChoice(symbolName: "doc.text", label: "Document"),
            ItemIconChoice(symbolName: "folder", label: "Folder"),
            ItemIconChoice(symbolName: "chart.bar", label: "Analytics"),
            ItemIconChoice(symbolName: "chart.line.uptrend.xyaxis", label: "Growth")
        ]),
        ItemIconCategory(title: "Home & Life", choices: [
            ItemIconChoice(symbolName: "house", label: "Home"),
            ItemIconChoice(symbolName: "cart", label: "Shopping"),
            ItemIconChoice(symbolName: "bag", label: "Bag"),
            ItemIconChoice(symbolName: "fork.knife", label: "Meals"),
            ItemIconChoice(symbolName: "gift", label: "Gift"),
            ItemIconChoice(symbolName: "bed.double", label: "Sleep")
        ]),
        ItemIconCategory(title: "Health", choices: [
            ItemIconChoice(symbolName: "heart", label: "Health"),
            ItemIconChoice(symbolName: "cross.case", label: "Medical"),
            ItemIconChoice(symbolName: "dumbbell", label: "Fitness"),
            ItemIconChoice(symbolName: "figure.walk", label: "Walk")
        ]),
        ItemIconCategory(title: "Travel", choices: [
            ItemIconChoice(symbolName: "car", label: "Travel"),
            ItemIconChoice(symbolName: "airplane", label: "Flight"),
            ItemIconChoice(symbolName: "map", label: "Map"),
            ItemIconChoice(symbolName: "location", label: "Location")
        ]),
        ItemIconCategory(title: "Finance", choices: [
            ItemIconChoice(symbolName: "dollarsign.circle", label: "Finance"),
            ItemIconChoice(symbolName: "creditcard", label: "Credit Card"),
            ItemIconChoice(symbolName: "banknote", label: "Cash"),
            ItemIconChoice(symbolName: "wallet.pass", label: "Wallet")
        ]),
        ItemIconCategory(title: "Study & Media", choices: [
            ItemIconChoice(symbolName: "book", label: "Book"),
            ItemIconChoice(symbolName: "graduationcap", label: "Study"),
            ItemIconChoice(symbolName: "camera", label: "Camera"),
            ItemIconChoice(symbolName: "music.note", label: "Music"),
            ItemIconChoice(symbolName: "gamecontroller", label: "Gaming"),
            ItemIconChoice(symbolName: "paintpalette", label: "Creative")
        ])
    ]

    private func availableItemIconCategories(currentIcon: String) -> [ItemIconCategory] {
        let clean = currentIcon.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return planningItemIconCategories }
        if planningItemIconCategories.flatMap(\.choices).contains(where: { $0.symbolName == clean }) {
            return planningItemIconCategories
        }
        let currentCategory = ItemIconCategory(
            title: "Current",
            choices: [ItemIconChoice(symbolName: clean, label: "Current")]
        )
        return [currentCategory] + planningItemIconCategories
    }

    private let activeSubItemKinds: [PlanningSubItemKind] = [
        .task,
        .reminder,
        .event,
        .journalEntry,
        .url,
        .favoriteLocation,
        .savedRoute,
        .pdfFile
    ]

    private let futureSubItemKinds: [PlanningSubItemKind] = [
        .mapTrip,
        .outfit,
        .weatherReport
    ]

    struct PlanningItemEditorSheet: View {
        let item: PlanningItem
        let onSave: (PlanningItemDraft) -> Void

        @EnvironmentObject private var store: PlannerStore
        @Environment(\.dismiss) private var dismiss

        @State private var kind: PlanningKind
        @State private var title: String
        @State private var icon: String
        @State private var hasCustomIconSelection: Bool = false
        @State private var domain: BucketDomain
        @State private var selectedBucketID: UUID?
        @State private var notes: String
        @State private var subItems: [PlanningSubItem]
        @State private var selectedSubItemKind: PlanningSubItemKind = .task
        @State private var subItemURLInput: String = ""
        @State private var selectedPDFFileURL: URL? = nil
        @State private var selectedPDFBookmarkData: Data? = nil
        @State private var selectedJournalEntryID: UUID?
        @State private var selectedMapFavoriteID: UUID?
        @State private var selectedMapSavedRouteID: UUID?
        @State private var isShowingAddSubItemPopover = false
        @State private var subItemPopoverTitle: String = ""
        @State private var priority: PriorityLevel
        @State private var repeatRule: RepeatRule
        @State private var alternateStartingPattern: ABPattern = .a
        @State private var alternateRespectsHolidayExclusions: Bool = true
        @State private var alternateUntilDate: Date = Date()
        @State private var alternateSkippedOccurrenceDateISOs: [String] = []
        @State private var alternateForcedIncludeDateISOs: [String] = []

        @State private var eventStartDate: Date
        @State private var eventEndDate: Date
        @State private var isAllDayEvent: Bool
        @State private var eventStartTime: Date
        @State private var eventEndTime: Date
        @State private var eventLocation: String

        @State private var taskDueDate: Date
        @State private var taskHasDueTime: Bool
        @State private var taskDueTime: Date
        @State private var taskEstimatedMinutes: Int

        @State private var reminderDate: Date
        @State private var reminderHasTime: Bool
        @State private var reminderTime: Date
        @State private var reminderLeadTime: ReminderLeadTime

        init(item: PlanningItem, onSave: @escaping (PlanningItemDraft) -> Void) {
            self.item = item
            self.onSave = onSave

            let calendar = Calendar.current
            let resolvedEventStart = item.startDate ?? Date()
            let resolvedEventEnd = item.endDate ?? (calendar.date(byAdding: .hour, value: 1, to: resolvedEventStart) ?? resolvedEventStart)

            _kind = State(initialValue: item.kind)
            _title = State(initialValue: item.title)
            _icon = State(initialValue: item.icon)
            _domain = State(initialValue: item.domain)
            _selectedBucketID = State(initialValue: item.bucketID)
            _notes = State(initialValue: item.notes)
            _subItems = State(initialValue: item.subItems)
            _priority = State(initialValue: item.priority)
            _repeatRule = State(initialValue: item.repeatRule)
            let primaryDate = item.startDate ?? item.dueDate ?? item.reminderDate ?? Date()
            let fallbackPattern = Self.inferPattern(for: primaryDate)
            _alternateStartingPattern = State(initialValue: item.alternateWorkdayConfig?.startingPattern ?? fallbackPattern)
            _alternateRespectsHolidayExclusions = State(initialValue: item.alternateWorkdayConfig?.respectsHolidayExclusions ?? true)
            let fallbackUntilDate = Calendar.current.date(byAdding: .month, value: 3, to: primaryDate) ?? primaryDate
            let existingUntilDate = item.alternateWorkdayConfig?.untilDateISO.flatMap(Self.dateFromISO)
            _alternateUntilDate = State(initialValue: existingUntilDate ?? fallbackUntilDate)
            _alternateSkippedOccurrenceDateISOs = State(initialValue: item.alternateWorkdayConfig?.skippedOccurrenceDateISOs ?? [])
            _alternateForcedIncludeDateISOs = State(initialValue: item.alternateWorkdayConfig?.forcedIncludeDateISOs ?? [])

            _eventStartDate = State(initialValue: resolvedEventStart)
            _eventEndDate = State(initialValue: resolvedEventEnd)
            _isAllDayEvent = State(initialValue: item.isAllDay)
            _eventStartTime = State(initialValue: item.startTime ?? resolvedEventStart)
            _eventEndTime = State(initialValue: item.endTime ?? resolvedEventEnd)
            _eventLocation = State(initialValue: item.location)

            _taskDueDate = State(initialValue: item.dueDate ?? Date())
            _taskHasDueTime = State(initialValue: item.dueTime != nil)
            _taskDueTime = State(initialValue: item.dueTime ?? Date())
            _taskEstimatedMinutes = State(initialValue: item.estimatedMinutes ?? 30)

            _reminderDate = State(initialValue: item.reminderDate ?? Date())
            _reminderHasTime = State(initialValue: item.reminderTime != nil)
            _reminderTime = State(initialValue: item.reminderTime ?? Date())
            _reminderLeadTime = State(initialValue: item.reminderLeadTime)
        }

        private var availableBuckets: [PlannerBucket] {
            store.bucketsForPicker(domain: domain)
        }

        private var attachableJournalEntries: [JournalEntry] {
            store.journalEntries.sorted { lhs, rhs in
                if lhs.createdAt != rhs.createdAt {
                    return lhs.createdAt > rhs.createdAt
                }
                return lhs.updatedAt > rhs.updatedAt
            }
        }

        private var attachableMapFavorites: [DynamicMapFavoriteLocation] {
            store.dynamicMapFavorites.sorted { lhs, rhs in
                lhs.title.localizedCaseInsensitiveCompare(rhs.title) == .orderedAscending
            }
        }

        private var attachableSavedRoutes: [DynamicMapSavedRoute] {
            store.dynamicMapSavedRoutes.sorted { lhs, rhs in
                lhs.updatedAt > rhs.updatedAt
            }
        }

        private var canSave: Bool {
            let hasTitle = !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            guard hasTitle else { return false }

            if kind == .event {
                return eventEndDate >= eventStartDate
            }

            return true
        }

        private var selectedBucket: PlannerBucket {
            if let selectedBucketID,
               let bucket = store.bucket(for: selectedBucketID),
               !bucket.isArchived {
                return bucket
            }
            return store.defaultBucket(for: domain)
        }

        private var supportsAlternateWorkdays: Bool {
            selectedBucket.domain == .professional && selectedBucket.isJob
        }

        private func prefillEventLocationFromSelectedJobSiteIfNeeded() {
            guard kind == .event else { return }
            guard eventLocation.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
            guard selectedBucket.domain == .professional, selectedBucket.isJob else { return }

            let jobSite = selectedBucket.jobSite.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !jobSite.isEmpty else { return }
            eventLocation = jobSite
        }

        private var availableRepeatRules: [RepeatRule] {
            if supportsAlternateWorkdays {
                return RepeatRule.allCases
            }
            return RepeatRule.allCases.filter { $0 != .alternateWorkdays }
        }

        private var selectedPrimaryDate: Date {
            switch kind {
            case .event:
                return eventStartDate
            case .task:
                return taskDueDate
            case .reminder:
                return reminderDate
            }
        }

        private var selectedPrimaryISODate: String {
            isoDateString(selectedPrimaryDate)
        }

        private var hasAnchorHolidayConflict: Bool {
            guard supportsAlternateWorkdays else { return false }
            return store.isHolidayDate(
                selectedPrimaryDate,
                patterns: selectedBucket.jobHolidayPatterns
            )
        }

        private var includeFirstOccurrenceDespiteHolidayBinding: Binding<Bool> {
            Binding(
                get: { alternateForcedIncludeDateISOs.contains(selectedPrimaryISODate) },
                set: { include in
                    if include {
                        if !alternateForcedIncludeDateISOs.contains(selectedPrimaryISODate) {
                            alternateForcedIncludeDateISOs.append(selectedPrimaryISODate)
                        }
                    } else {
                        alternateForcedIncludeDateISOs.removeAll { $0 == selectedPrimaryISODate }
                    }
                }
            )
        }

        private var iconSelectionBinding: Binding<String> {
            Binding(
                get: { icon },
                set: { newValue in
                    icon = newValue
                    hasCustomIconSelection = true
                }
            )
        }

        var body: some View {
            VStack(alignment: .leading, spacing: 14) {
                Text("Edit Item")
                    .font(.title2.weight(.semibold))

                Picker("Type", selection: $kind) {
                    ForEach(PlanningKind.allCases) { option in
                        Text(option.rawValue.capitalized).tag(option)
                    }
                }
                .pickerStyle(.segmented)

                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        GroupBox("Core") {
                            VStack(alignment: .leading, spacing: 10) {
                                TextField("Title", text: $title)
                                    .textFieldStyle(.roundedBorder)

                                HStack(spacing: 10) {
                                    Picker("Icon", selection: iconSelectionBinding) {
                                        ForEach(availableItemIconCategories(currentIcon: icon)) { category in
                                            Section(category.title) {
                                                ForEach(category.choices) { iconChoice in
                                                    Label(iconChoice.label, systemImage: iconChoice.symbolName)
                                                        .tag(iconChoice.symbolName)
                                                }
                                            }
                                        }
                                    }
                                    .labelsHidden()
                                    .pickerStyle(.menu)
                                    .frame(width: 190, alignment: .leading)

                                    Picker("Domain", selection: $domain) {
                                        ForEach(BucketDomain.allCases) { option in
                                            Label(option.title, systemImage: option.symbolName)
                                                .tag(option)
                                        }
                                    }
                                    .labelsHidden()
                                    .pickerStyle(.menu)
                                    .frame(maxWidth: .infinity, alignment: .leading)

                                    Picker("Bucket", selection: $selectedBucketID) {
                                        Text("General")
                                            .tag(Optional<UUID>.none)

                                        ForEach(availableBuckets) { bucket in
                                            Label(bucket.name, systemImage: bucket.icon)
                                                .tag(Optional(bucket.id))
                                        }
                                    }
                                    .labelsHidden()
                                    .pickerStyle(.menu)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                }
                            }
                            .padding(.top, 4)
                        }

                        kindSpecificInputs

                        GroupBox("Sub-Items") {
                            VStack(alignment: .leading, spacing: 10) {
                                TextEditor(text: $notes)
                                    .frame(minHeight: 86)

                                Divider()

                                HStack(spacing: 8) {
                                    Picker("Sub-item type", selection: $selectedSubItemKind) {
                                        ForEach(activeSubItemKinds) { kindOption in
                                            Label(kindOption.label, systemImage: kindOption.symbolName)
                                                .tag(kindOption)
                                        }
                                    }
                                    .pickerStyle(.menu)

                                    Button("Add") {
                                        subItemPopoverTitle = ""
                                        isShowingAddSubItemPopover = true
                                    }
                                    .popover(isPresented: $isShowingAddSubItemPopover, arrowEdge: .bottom) {
                                        AddSubItemPopover(
                                            kind: selectedSubItemKind,
                                            title: $subItemPopoverTitle,
                                            urlInput: $subItemURLInput,
                                            selectedPDFFileURL: $selectedPDFFileURL,
                                            selectedPDFBookmarkData: $selectedPDFBookmarkData,
                                            selectedJournalEntryID: $selectedJournalEntryID,
                                            selectedMapFavoriteID: $selectedMapFavoriteID,
                                            selectedMapSavedRouteID: $selectedMapSavedRouteID,
                                            attachableJournalEntries: attachableJournalEntries,
                                            attachableMapFavorites: attachableMapFavorites,
                                            attachableSavedRoutes: attachableSavedRoutes,
                                            onSelectPDF: { selectPDFFile() },
                                            onConfirm: {
                                                addSelectedSubItem()
                                                isShowingAddSubItemPopover = false
                                            },
                                            onCancel: {
                                                isShowingAddSubItemPopover = false
                                            }
                                        )
                                    }
                                }

                                Text("Future item types")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)

                                LazyVGrid(columns: [GridItem(.adaptive(minimum: 140), spacing: 8)], alignment: .leading, spacing: 8) {
                                    ForEach(futureSubItemKinds) { futureKind in
                                        Button {
                                        } label: {
                                            Label(futureKind.label, systemImage: futureKind.symbolName)
                                        }
                                        .buttonStyle(.bordered)
                                        .disabled(true)
                                    }
                                }

                                Divider()

                                if subItems.isEmpty {
                                    Text("No sub-items yet.")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                } else {
                                    ForEach($subItems) { $subItem in
                                        HStack(spacing: 8) {
                                            Button {
                                                subItem.isCompleted.toggle()
                                            } label: {
                                                Image(systemName: subItem.isCompleted ? "checkmark.circle.fill" : "circle")
                                                    .foregroundStyle(subItem.isCompleted ? .green : .secondary)
                                            }
                                            .buttonStyle(.plain)

                                            if subItem.kind.category == .companion {
                                                CompanionSubItemBadge(kind: subItem.kind)
                                            } else {
                                                Image(systemName: subItem.kind.symbolName)
                                                    .foregroundStyle(.secondary)
                                            }

                                            Text(subItem.kind.label)
                                                .font(.caption)
                                                .foregroundStyle(.secondary)

                                            TextField("Sub-item", text: $subItem.title)
                                                .strikethrough(subItem.isCompleted)
                                                .foregroundStyle(subItem.isCompleted ? .secondary : .primary)

                                            Button(role: .destructive) {
                                                removeSubItem(id: subItem.id)
                                            } label: {
                                                Image(systemName: "trash")
                                                    .foregroundStyle(.secondary)
                                            }
                                            .buttonStyle(.plain)
                                        }
                                    }
                                }
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                }

                HStack {
                    Spacer()
                    Button("Cancel") { dismiss() }
                    Button("Save") {
                        onSave(buildDraft())
                        dismiss()
                    }
                    .keyboardShortcut(.defaultAction)
                    .disabled(!canSave)
                }
            }
            .padding(20)
            .frame(minWidth: 520, minHeight: 560)
            .onAppear {
                prefillEventLocationFromSelectedJobSiteIfNeeded()
            }
            .onChange(of: domain) { _, _ in
                selectedBucketID = nil
                if repeatRule == .alternateWorkdays {
                    repeatRule = .none
                }
                prefillEventLocationFromSelectedJobSiteIfNeeded()
            }
            .onChange(of: kind) { oldKind, newKind in
                let oldDefault = PlanningItem.defaultIcon(for: oldKind)
                if !hasCustomIconSelection || icon == oldDefault {
                    icon = PlanningItem.defaultIcon(for: newKind)
                    hasCustomIconSelection = false
                }
                prefillEventLocationFromSelectedJobSiteIfNeeded()
            }
            .onChange(of: selectedBucketID) { _, _ in
                if repeatRule == .alternateWorkdays && !supportsAlternateWorkdays {
                    repeatRule = .none
                }
                prefillEventLocationFromSelectedJobSiteIfNeeded()
            }
            .onChange(of: eventStartDate) { _, newStart in
                if eventEndDate < newStart {
                    eventEndDate = newStart
                }
            }
            .onChange(of: eventStartTime) { _, newStartTime in
                if !isAllDayEvent && eventEndDate == eventStartDate && eventEndTime < newStartTime {
                    eventEndTime = newStartTime
                }
            }
        }

        @ViewBuilder
        private var kindSpecificInputs: some View {
            switch kind {
            case .event:
                GroupBox("Event Details") {
                    VStack(alignment: .leading, spacing: 10) {
                        HStack(spacing: 10) {
                            DatePicker("", selection: $eventStartDate, displayedComponents: [.date])
                                .labelsHidden()
                                .frame(maxWidth: .infinity, alignment: .leading)
                            DatePicker("", selection: $eventEndDate, in: eventStartDate..., displayedComponents: [.date])
                                .labelsHidden()
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        Toggle("All day", isOn: $isAllDayEvent)

                        if !isAllDayEvent {
                            HStack(spacing: 10) {
                                DatePicker("", selection: $eventStartTime, displayedComponents: [.hourAndMinute])
                                    .labelsHidden()
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                let endTimeRange = eventEndDate == eventStartDate ? eventStartTime... : (Date.distantPast...)
                                DatePicker("", selection: $eventEndTime, in: endTimeRange, displayedComponents: [.hourAndMinute])
                                    .labelsHidden()
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                        }

                        HStack(spacing: 10) {
                            Picker("Repeat", selection: $repeatRule) {
                                ForEach(availableRepeatRules) { option in
                                    Text(option.label).tag(option)
                                }
                            }
                            .labelsHidden()
                            .pickerStyle(.menu)
                            .frame(maxWidth: .infinity, alignment: .leading)

                            LocationAutocompleteField(text: $eventLocation)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }

                        if repeatRule == .alternateWorkdays {
                            alternateWorkdaySettings
                        }
                    }
                    .padding(.top, 4)
                }

            case .task:
                GroupBox("Task Details") {
                    VStack(alignment: .leading, spacing: 10) {
                        HStack(spacing: 10) {
                            DatePicker("", selection: $taskDueDate, displayedComponents: [.date])
                                .labelsHidden()
                                .frame(maxWidth: .infinity, alignment: .leading)
                            if taskHasDueTime {
                                DatePicker("", selection: $taskDueTime, displayedComponents: [.hourAndMinute])
                                    .labelsHidden()
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                        }

                        Toggle("Add due time", isOn: $taskHasDueTime)
                            .toggleStyle(.checkbox)

                        HStack(spacing: 10) {
                            Picker("Repeat", selection: $repeatRule) {
                                ForEach(availableRepeatRules) { option in
                                    Text(option.label).tag(option)
                                }
                            }
                            .labelsHidden()
                            .pickerStyle(.menu)
                            .frame(maxWidth: .infinity, alignment: .leading)

                            Picker("Priority", selection: $priority) {
                                ForEach(PriorityLevel.allCases) { level in
                                    Text(level.label).tag(level)
                                }
                            }
                            .labelsHidden()
                            .pickerStyle(.menu)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }

                        Stepper("Estimated duration: \(taskEstimatedMinutes) min", value: $taskEstimatedMinutes, in: 5...480, step: 5)

                        if repeatRule == .alternateWorkdays {
                            alternateWorkdaySettings
                        }
                    }
                    .padding(.top, 4)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

            case .reminder:
                GroupBox("Reminder Details") {
                    VStack(alignment: .leading, spacing: 10) {
                        Toggle("Set reminder time", isOn: $reminderHasTime)

                        HStack(spacing: 10) {
                            DatePicker("", selection: $reminderDate, displayedComponents: [.date])
                                .labelsHidden()
                                .frame(maxWidth: .infinity, alignment: .leading)
                            if reminderHasTime {
                                DatePicker("", selection: $reminderTime, displayedComponents: [.hourAndMinute])
                                    .labelsHidden()
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                        }

                        HStack(spacing: 10) {
                            Picker("Repeat", selection: $repeatRule) {
                                ForEach(availableRepeatRules) { option in
                                    Text(option.label).tag(option)
                                }
                            }
                            .labelsHidden()
                            .pickerStyle(.menu)
                            .frame(maxWidth: .infinity, alignment: .leading)

                            Picker("Alert", selection: $reminderLeadTime) {
                                ForEach(ReminderLeadTime.allCases) { lead in
                                    Text(lead.label).tag(lead)
                                }
                            }
                            .labelsHidden()
                            .pickerStyle(.menu)
                            .disabled(!reminderHasTime)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }

                        if !reminderHasTime {
                            Text("Enable reminder time to choose an alert offset.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }

                        if repeatRule == .alternateWorkdays {
                            alternateWorkdaySettings
                        }
                    }
                    .padding(.top, 4)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }

        private func buildDraft() -> PlanningItemDraft {
            let effectivePriority: PriorityLevel = (kind == .task) ? priority : .medium

            var draft = PlanningItemDraft(
                kind: kind,
                title: title,
                icon: icon,
                domain: domain,
                bucketID: selectedBucketID,
                notes: notes,
                subItems: normalizedSubItems(),
                priority: effectivePriority,
                repeatRule: repeatRule,
                alternateWorkdayConfig: repeatRule == .alternateWorkdays ? AlternateWorkdayConfig(
                    startingPattern: alternateStartingPattern,
                    respectsHolidayExclusions: alternateRespectsHolidayExclusions,
                    itemHolidayPatterns: [],
                    skippedOccurrenceDateISOs: alternateSkippedOccurrenceDateISOs,
                    forcedIncludeDateISOs: alternateForcedIncludeDateISOs,
                    untilDateISO: isoDateString(max(alternateUntilDate, selectedPrimaryDate))
                ) : nil,
                startDate: nil,
                endDate: nil,
                isAllDay: false,
                startTime: nil,
                endTime: nil,
                location: "",
                dueDate: nil,
                dueTime: nil,
                estimatedMinutes: nil,
                reminderDate: nil,
                reminderTime: nil,
                reminderLeadTime: reminderLeadTime
            )

            switch kind {
            case .event:
                draft.startDate = eventStartDate
                draft.endDate = eventEndDate
                draft.isAllDay = isAllDayEvent
                draft.startTime = isAllDayEvent ? nil : eventStartTime
                draft.endTime = isAllDayEvent ? nil : eventEndTime
                draft.location = eventLocation

            case .task:
                draft.dueDate = taskDueDate
                draft.dueTime = taskHasDueTime ? taskDueTime : nil
                draft.estimatedMinutes = taskEstimatedMinutes

            case .reminder:
                draft.reminderDate = reminderDate
                draft.reminderTime = reminderHasTime ? reminderTime : nil
                draft.reminderLeadTime = reminderHasTime ? reminderLeadTime : .atTime
            }

            return draft
        }

        private func normalizedSubItems() -> [PlanningSubItem] {
            subItems.compactMap { subItem in
                let cleanTitle = subItem.title.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !cleanTitle.isEmpty else { return nil }
                return PlanningSubItem(
                    id: subItem.id,
                    kind: subItem.kind,
                    title: cleanTitle,
                    isCompleted: subItem.isCompleted,
                    sourceApp: subItem.sourceApp,
                    sourceEntryID: subItem.sourceEntryID,
                    linkedItemID: subItem.linkedItemID,
                    urlString: subItem.urlString,
                    pdfBookmarkData: subItem.pdfBookmarkData
                )
            }
        }

        private func addSelectedSubItem() {
            switch selectedSubItemKind {
            case .task:
                let t = subItemPopoverTitle.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !t.isEmpty else { return }
                subItems.append(PlanningSubItem(id: UUID(), kind: .task, title: t, isCompleted: false))
                subItemPopoverTitle = ""
            case .reminder:
                let t = subItemPopoverTitle.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !t.isEmpty else { return }
                subItems.append(PlanningSubItem(id: UUID(), kind: .reminder, title: t, isCompleted: false))
                subItemPopoverTitle = ""
            case .event:
                let t = subItemPopoverTitle.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !t.isEmpty else { return }
                subItems.append(PlanningSubItem(id: UUID(), kind: .event, title: t, isCompleted: false))
                subItemPopoverTitle = ""
            case .journalEntry:
                attachSelectedJournalEntry()
            case .url:
                let cleanURL = subItemURLInput.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !cleanURL.isEmpty else { return }
                subItems.append(
                    PlanningSubItem(
                        id: UUID(),
                        kind: .url,
                        title: cleanURL,
                        isCompleted: false,
                        urlString: cleanURL
                    )
                )
                subItemURLInput = ""
            case .favoriteLocation:
                attachSelectedFavoriteLocation()
            case .savedRoute:
                attachSelectedSavedRoute()
            case .pdfFile:
                attachSelectedPDF()
            case .mapTrip, .outfit, .weatherReport:
                break
            }
        }

        private func attachSelectedJournalEntry() {
            guard let selectedJournalEntryID,
                  let entry = store.journalEntry(for: selectedJournalEntryID) else {
                return
            }

            let snapshot = entry.previewText
            guard !snapshot.isEmpty else { return }

            subItems.append(
                PlanningSubItem(
                    id: UUID(),
                    kind: .journalEntry,
                    title: snapshot,
                    isCompleted: false,
                    sourceApp: .journal,
                    sourceEntryID: entry.id
                )
            )
            self.selectedJournalEntryID = nil
        }

        private func attachSelectedFavoriteLocation() {
            guard let selectedMapFavoriteID,
                  let favorite = store.dynamicMapFavorite(for: selectedMapFavoriteID) else {
                return
            }

            subItems.append(
                PlanningSubItem(
                    id: UUID(),
                    kind: .favoriteLocation,
                    title: favorite.title,
                    isCompleted: false,
                    sourceApp: .dynamicMap,
                    sourceEntryID: favorite.id
                )
            )
            self.selectedMapFavoriteID = nil
        }

        private func attachSelectedSavedRoute() {
            guard let selectedMapSavedRouteID,
                  let route = store.dynamicMapSavedRoute(for: selectedMapSavedRouteID) else {
                return
            }

            subItems.append(
                PlanningSubItem(
                    id: UUID(),
                    kind: .savedRoute,
                    title: route.title,
                    isCompleted: false,
                    sourceApp: .dynamicMap,
                    sourceEntryID: route.id
                )
            )
            self.selectedMapSavedRouteID = nil
        }

        private func removeSubItem(id: UUID) {
            subItems.removeAll { $0.id == id }
        }


        private var alternateWorkdaySettings: some View {
            VStack(alignment: .leading, spacing: 8) {
                Text("Alternate workday settings")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)

                Picker("Starting Pattern", selection: $alternateStartingPattern) {
                    ForEach(ABPattern.allCases) { pattern in
                        Text(pattern.label).tag(pattern)
                    }
                }
                .pickerStyle(.menu)

                Toggle("Respect job days off", isOn: $alternateRespectsHolidayExclusions)
                    .toggleStyle(.checkbox)

                DatePicker("Repeat until", selection: $alternateUntilDate, displayedComponents: [.date])

                if alternateRespectsHolidayExclusions && hasAnchorHolidayConflict {
                    Toggle("Include first occurrence even though start date is a day off", isOn: includeFirstOccurrenceDespiteHolidayBinding)
                        .toggleStyle(.checkbox)
                }

                Text("Starting pattern is only shown while editing.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            .padding(10)
            .cardStyle(cornerRadius: 10, tint: .secondary, hasBorder: false)
        }

        private func selectPDFFile() {
            let panel = NSOpenPanel()
            panel.allowedContentTypes = [.pdf]
            panel.canChooseFiles = true
            panel.canChooseDirectories = false
            panel.allowsMultipleSelection = false
            
            if panel.runModal() == .OK, let url = panel.url {
                selectedPDFFileURL = url
                
                do {
                    selectedPDFBookmarkData = try url.bookmarkData(options: .withSecurityScope, includingResourceValuesForKeys: nil, relativeTo: nil)
                } catch {
                    selectedPDFBookmarkData = nil
                }
            }
        }

        private func attachSelectedPDF() {
            guard let fileURL = selectedPDFFileURL else { return }
            
            let filename = fileURL.lastPathComponent
            subItems.append(
                PlanningSubItem(
                    id: UUID(),
                    kind: .pdfFile,
                    title: filename,
                    isCompleted: false,
                    urlString: fileURL.absoluteString,
                    pdfBookmarkData: selectedPDFBookmarkData
                )
            )
            selectedPDFFileURL = nil
            selectedPDFBookmarkData = nil
        }

        private func isoDateString(_ date: Date) -> String {
            let formatter = DateFormatter()
            formatter.calendar = Calendar(identifier: .gregorian)
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.timeZone = TimeZone(secondsFromGMT: 0)
            formatter.dateFormat = "yyyy-MM-dd"
            return formatter.string(from: date)
        }

        private static func inferPattern(for date: Date) -> ABPattern {
            _ = date
            return .a
        }

        private nonisolated static func dateFromISO(_ isoDate: String) -> Date? {
            let formatter = DateFormatter()
            formatter.calendar = Calendar(identifier: .gregorian)
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.timeZone = TimeZone(secondsFromGMT: 0)
            formatter.dateFormat = "yyyy-MM-dd"
            return formatter.date(from: isoDate)
        }
    }

    struct NewPlanningItemSheet: View {
        let destination: AppDestination
        let prefill: WeekItemPrefill?
        let onCreate: (PlanningItemDraft) -> Void

        @EnvironmentObject private var store: PlannerStore
        @Environment(\.dismiss) private var dismiss

        @State private var kind: PlanningKind
        @State private var title: String = ""
        @State private var icon: String
        @State private var hasCustomIconSelection: Bool = false
        @State private var domain: BucketDomain
        @State private var selectedBucketID: UUID?
        @State private var notes: String = ""
        @State private var subItems: [PlanningSubItem] = []
        @State private var selectedSubItemKind: PlanningSubItemKind = .task
        @State private var subItemURLInput: String = ""
        @State private var selectedPDFFileURL: URL? = nil
        @State private var selectedPDFBookmarkData: Data? = nil
        @State private var selectedJournalEntryID: UUID?
        @State private var selectedMapFavoriteID: UUID?
        @State private var selectedMapSavedRouteID: UUID?
        @State private var isShowingAddSubItemPopover = false
        @State private var subItemPopoverTitle: String = ""
        @State private var priority: PriorityLevel = .medium
        @State private var repeatRule: RepeatRule = .none
        @State private var alternateStartingPattern: ABPattern = .a
        @State private var alternateRespectsHolidayExclusions: Bool = true
        @State private var alternateUntilDate: Date = Date()
        @State private var alternateSkippedOccurrenceDateISOs: [String] = []
        @State private var alternateForcedIncludeDateISOs: [String] = []

        @State private var eventStartDate: Date = Date()
        @State private var eventEndDate: Date = Date()
        @State private var isAllDayEvent: Bool = true
        @State private var eventStartTime: Date = Date()
        @State private var eventEndTime: Date = Calendar.current.date(byAdding: .hour, value: 1, to: Date()) ?? Date()
        @State private var eventLocation: String = ""

        @State private var taskDueDate: Date = Date()
        @State private var taskHasDueTime: Bool = false
        @State private var taskDueTime: Date = Date()
        @State private var taskEstimatedMinutes: Int = 30

        @State private var reminderDate: Date = Date()
        @State private var reminderHasTime: Bool = true
        @State private var reminderTime: Date = Date()
        @State private var reminderLeadTime: ReminderLeadTime = .atTime

        init(destination: AppDestination, prefill: WeekItemPrefill? = nil, onCreate: @escaping (PlanningItemDraft) -> Void) {
            self.destination = destination
            self.prefill = prefill
            self.onCreate = onCreate

            let calendar = Calendar.current
            let resolvedStart = prefill?.start ?? Date()
            let resolvedEnd = prefill?.end ?? (calendar.date(byAdding: .hour, value: 1, to: resolvedStart) ?? resolvedStart)

            _kind = State(initialValue: prefill?.kind ?? Self.defaultKind(for: destination))
            _icon = State(initialValue: PlanningItem.defaultIcon(for: prefill?.kind ?? Self.defaultKind(for: destination)))
            _domain = State(initialValue: prefill?.domain ?? destination.asDomain ?? .personal)
            _selectedBucketID = State(initialValue: prefill?.bucketID)
            _eventStartDate = State(initialValue: resolvedStart)
            _eventEndDate = State(initialValue: resolvedEnd)
            _isAllDayEvent = State(initialValue: prefill?.isAllDay ?? true)
            _eventStartTime = State(initialValue: resolvedStart)
            _eventEndTime = State(initialValue: resolvedEnd)
            _taskDueDate = State(initialValue: resolvedStart)
            _taskDueTime = State(initialValue: resolvedStart)
            _reminderDate = State(initialValue: resolvedStart)
            _reminderTime = State(initialValue: resolvedStart)
            _alternateStartingPattern = State(initialValue: Self.inferPattern(for: resolvedStart))
            _alternateUntilDate = State(initialValue: calendar.date(byAdding: .month, value: 3, to: resolvedStart) ?? resolvedStart)
        }

        private var availableBuckets: [PlannerBucket] {
            store.bucketsForPicker(domain: domain)
        }

        private var attachableJournalEntries: [JournalEntry] {
            store.journalEntries.sorted { lhs, rhs in
                if lhs.createdAt != rhs.createdAt {
                    return lhs.createdAt > rhs.createdAt
                }
                return lhs.updatedAt > rhs.updatedAt
            }
        }

        private var attachableMapFavorites: [DynamicMapFavoriteLocation] {
            store.dynamicMapFavorites.sorted { lhs, rhs in
                lhs.title.localizedCaseInsensitiveCompare(rhs.title) == .orderedAscending
            }
        }

        private var attachableSavedRoutes: [DynamicMapSavedRoute] {
            store.dynamicMapSavedRoutes.sorted { lhs, rhs in
                lhs.updatedAt > rhs.updatedAt
            }
        }

        private var canCreate: Bool {
            let hasTitle = !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            guard hasTitle else { return false }
            if kind == .event {
                if eventEndDate > eventStartDate {
                    return true
                }
                if eventEndDate < eventStartDate {
                    return false
                }
                // Same date - check time ordering if not all-day
                if isAllDayEvent {
                    return true
                }
                return eventEndTime >= eventStartTime
            }
            return true
        }

        private var selectedBucket: PlannerBucket {
            if let selectedBucketID,
               let bucket = store.bucket(for: selectedBucketID),
               !bucket.isArchived {
                return bucket
            }
            return store.defaultBucket(for: domain)
        }

        private var supportsAlternateWorkdays: Bool {
            selectedBucket.domain == .professional && selectedBucket.isJob
        }

        private func prefillEventLocationFromSelectedJobSiteIfNeeded() {
            guard kind == .event else { return }
            guard eventLocation.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
            guard selectedBucket.domain == .professional, selectedBucket.isJob else { return }

            let jobSite = selectedBucket.jobSite.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !jobSite.isEmpty else { return }
            eventLocation = jobSite
        }

        private var availableRepeatRules: [RepeatRule] {
            if supportsAlternateWorkdays {
                return RepeatRule.allCases
            }
            return RepeatRule.allCases.filter { $0 != .alternateWorkdays }
        }

        private var selectedPrimaryDate: Date {
            switch kind {
            case .event:
                return eventStartDate
            case .task:
                return taskDueDate
            case .reminder:
                return reminderDate
            }
        }

        private var selectedPrimaryISODate: String {
            isoDateString(selectedPrimaryDate)
        }

        private var hasAnchorHolidayConflict: Bool {
            guard supportsAlternateWorkdays else { return false }
            return store.isHolidayDate(
                selectedPrimaryDate,
                patterns: selectedBucket.jobHolidayPatterns
            )
        }

        private var includeFirstOccurrenceDespiteHolidayBinding: Binding<Bool> {
            Binding(
                get: { alternateForcedIncludeDateISOs.contains(selectedPrimaryISODate) },
                set: { include in
                    if include {
                        if !alternateForcedIncludeDateISOs.contains(selectedPrimaryISODate) {
                            alternateForcedIncludeDateISOs.append(selectedPrimaryISODate)
                        }
                    } else {
                        alternateForcedIncludeDateISOs.removeAll { $0 == selectedPrimaryISODate }
                    }
                }
            )
        }

        private var iconSelectionBinding: Binding<String> {
            Binding(
                get: { icon },
                set: { newValue in
                    icon = newValue
                    hasCustomIconSelection = true
                }
            )
        }

        var body: some View {
            VStack(alignment: .leading, spacing: 14) {
                Text("New Item")
                    .font(.title2.weight(.semibold))

                Picker("Type", selection: $kind) {
                    ForEach(PlanningKind.allCases) { option in
                        Text(option.rawValue.capitalized).tag(option)
                    }
                }
                .pickerStyle(.segmented)

                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        GroupBox("Core") {
                            VStack(alignment: .leading, spacing: 10) {
                                TextField("Title", text: $title)
                                    .textFieldStyle(.roundedBorder)

                                HStack(spacing: 10) {
                                    Picker("Icon", selection: iconSelectionBinding) {
                                        ForEach(availableItemIconCategories(currentIcon: icon)) { category in
                                            Section(category.title) {
                                                ForEach(category.choices) { iconChoice in
                                                    Label(iconChoice.label, systemImage: iconChoice.symbolName)
                                                        .tag(iconChoice.symbolName)
                                                }
                                            }
                                        }
                                    }
                                    .labelsHidden()
                                    .pickerStyle(.menu)
                                    .frame(width: 190, alignment: .leading)

                                    Picker("Domain", selection: $domain) {
                                        ForEach(BucketDomain.allCases) { option in
                                            Label(option.title, systemImage: option.symbolName)
                                                .tag(option)
                                        }
                                    }
                                    .labelsHidden()
                                    .pickerStyle(.menu)
                                    .frame(maxWidth: .infinity, alignment: .leading)

                                    Picker("Bucket", selection: $selectedBucketID) {
                                        Text("General")
                                            .tag(Optional<UUID>.none)

                                        ForEach(availableBuckets) { bucket in
                                            Label(bucket.name, systemImage: bucket.icon)
                                                .tag(Optional(bucket.id))
                                        }
                                    }
                                    .labelsHidden()
                                    .pickerStyle(.menu)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                }
                            }
                            .padding(.top, 4)
                        }

                        kindSpecificInputs

                        GroupBox("Sub-Items") {
                            VStack(alignment: .leading, spacing: 10) {
                                TextEditor(text: $notes)
                                    .frame(minHeight: 86)

                                Divider()

                                HStack(spacing: 8) {
                                    Picker("Sub-item type", selection: $selectedSubItemKind) {
                                        ForEach(activeSubItemKinds) { kindOption in
                                            Label(kindOption.label, systemImage: kindOption.symbolName)
                                                .tag(kindOption)
                                        }
                                    }
                                    .pickerStyle(.menu)

                                    Button("Add") {
                                        subItemPopoverTitle = ""
                                        isShowingAddSubItemPopover = true
                                    }
                                    .popover(isPresented: $isShowingAddSubItemPopover, arrowEdge: .bottom) {
                                        AddSubItemPopover(
                                            kind: selectedSubItemKind,
                                            title: $subItemPopoverTitle,
                                            urlInput: $subItemURLInput,
                                            selectedPDFFileURL: $selectedPDFFileURL,
                                            selectedPDFBookmarkData: $selectedPDFBookmarkData,
                                            selectedJournalEntryID: $selectedJournalEntryID,
                                            selectedMapFavoriteID: $selectedMapFavoriteID,
                                            selectedMapSavedRouteID: $selectedMapSavedRouteID,
                                            attachableJournalEntries: attachableJournalEntries,
                                            attachableMapFavorites: attachableMapFavorites,
                                            attachableSavedRoutes: attachableSavedRoutes,
                                            onSelectPDF: { selectPDFFile() },
                                            onConfirm: {
                                                addSelectedSubItem()
                                                isShowingAddSubItemPopover = false
                                            },
                                            onCancel: {
                                                isShowingAddSubItemPopover = false
                                            }
                                        )
                                    }
                                }

                                Text("Future shells")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)

                                LazyVGrid(columns: [GridItem(.adaptive(minimum: 140), spacing: 8)], alignment: .leading, spacing: 8) {
                                    ForEach(futureSubItemKinds) { futureKind in
                                        Button {
                                        } label: {
                                            Label(futureKind.label, systemImage: futureKind.symbolName)
                                        }
                                        .buttonStyle(.bordered)
                                        .disabled(true)
                                    }
                                }

                                Divider()

                                if subItems.isEmpty {
                                    Text("No sub-items yet.")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                } else {
                                    ForEach($subItems) { $subItem in
                                        HStack(spacing: 8) {
                                            Button {
                                                subItem.isCompleted.toggle()
                                            } label: {
                                                Image(systemName: subItem.isCompleted ? "checkmark.circle.fill" : "circle")
                                                    .foregroundStyle(subItem.isCompleted ? .green : .secondary)
                                            }
                                            .buttonStyle(.plain)

                                            Image(systemName: subItem.kind.symbolName)
                                                .foregroundStyle(.secondary)

                                            Text(subItem.kind.label)
                                                .font(.caption)
                                                .foregroundStyle(.secondary)

                                            TextField("Sub-item", text: $subItem.title)
                                                .strikethrough(subItem.isCompleted)
                                                .foregroundStyle(subItem.isCompleted ? .secondary : .primary)

                                            Button(role: .destructive) {
                                                removeSubItem(id: subItem.id)
                                            } label: {
                                                Image(systemName: "trash")
                                                    .foregroundStyle(.secondary)
                                            }
                                            .buttonStyle(.plain)
                                        }
                                    }
                                }
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                }

                HStack {
                    Spacer()
                    Button("Cancel") { dismiss() }
                    Button("Create") {
                        onCreate(buildDraft())
                        dismiss()
                    }
                    .keyboardShortcut(.defaultAction)
                    .disabled(!canCreate)
                }
            }
            .padding(20)
            .frame(minWidth: 520, minHeight: 560)
            .onAppear {
                prefillEventLocationFromSelectedJobSiteIfNeeded()
            }
        }

        private func selectPDFFile() {
            let panel = NSOpenPanel()
            panel.allowedContentTypes = [.pdf]
            panel.canChooseFiles = true
            panel.canChooseDirectories = false
            panel.allowsMultipleSelection = false
            
            if panel.runModal() == .OK, let url = panel.url {
                selectedPDFFileURL = url
                
                do {
                    selectedPDFBookmarkData = try url.bookmarkData(options: .withSecurityScope, includingResourceValuesForKeys: nil, relativeTo: nil)
                } catch {
                    selectedPDFBookmarkData = nil
                }
            }
        }

        private func attachSelectedPDF() {
            guard let fileURL = selectedPDFFileURL else { return }
            
            let filename = fileURL.lastPathComponent
            subItems.append(
                PlanningSubItem(
                    id: UUID(),
                    kind: .pdfFile,
                    title: filename,
                    isCompleted: false,
                    urlString: fileURL.absoluteString,
                    pdfBookmarkData: selectedPDFBookmarkData
                )
            )
            selectedPDFFileURL = nil
            selectedPDFBookmarkData = nil
        }

        private func removeSubItem(id: UUID) {
            subItems.removeAll { $0.id == id }
        }


        @ViewBuilder
        private var kindSpecificInputs: some View {
            switch kind {
            case .event:
                GroupBox("Event Details") {
                    VStack(alignment: .leading, spacing: 10) {
                        HStack(spacing: 10) {
                            DatePicker("", selection: $eventStartDate, displayedComponents: [.date])
                                .labelsHidden()
                                .frame(maxWidth: .infinity, alignment: .leading)
                            DatePicker("", selection: $eventEndDate, in: eventStartDate..., displayedComponents: [.date])
                                .labelsHidden()
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        Toggle("All day", isOn: $isAllDayEvent)

                        if !isAllDayEvent {
                            HStack(spacing: 10) {
                                DatePicker("", selection: $eventStartTime, displayedComponents: [.hourAndMinute])
                                    .labelsHidden()
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                let endTimeRange = eventEndDate == eventStartDate ? eventStartTime... : (Date.distantPast...)
                                DatePicker("", selection: $eventEndTime, in: endTimeRange, displayedComponents: [.hourAndMinute])
                                    .labelsHidden()
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                        }

                        HStack(spacing: 10) {
                            Picker("Repeat", selection: $repeatRule) {
                                ForEach(availableRepeatRules) { option in
                                    Text(option.label).tag(option)
                                }
                            }
                            .labelsHidden()
                            .pickerStyle(.menu)
                            .frame(maxWidth: .infinity, alignment: .leading)

                            LocationAutocompleteField(text: $eventLocation)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }

                        if repeatRule == .alternateWorkdays {
                            alternateWorkdaySettings
                        }
                    }
                    .padding(.top, 4)
                }

            case .task:
                GroupBox("Task Details") {
                    VStack(alignment: .leading, spacing: 10) {
                        HStack(spacing: 10) {
                            DatePicker("", selection: $taskDueDate, displayedComponents: [.date])
                                .labelsHidden()
                                .frame(maxWidth: .infinity, alignment: .leading)
                            if taskHasDueTime {
                                DatePicker("", selection: $taskDueTime, displayedComponents: [.hourAndMinute])
                                    .labelsHidden()
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                        }

                        Toggle("Add due time", isOn: $taskHasDueTime)
                            .toggleStyle(.checkbox)

                        HStack(spacing: 10) {
                            Picker("Repeat", selection: $repeatRule) {
                                ForEach(availableRepeatRules) { option in
                                    Text(option.label).tag(option)
                                }
                            }
                            .labelsHidden()
                            .pickerStyle(.menu)
                            .frame(maxWidth: .infinity, alignment: .leading)

                            Picker("Priority", selection: $priority) {
                                ForEach(PriorityLevel.allCases) { level in
                                    Text(level.label).tag(level)
                                }
                            }
                            .labelsHidden()
                            .pickerStyle(.menu)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }

                        Stepper("Estimated duration: \(taskEstimatedMinutes) min", value: $taskEstimatedMinutes, in: 5...480, step: 5)

                        if repeatRule == .alternateWorkdays {
                            alternateWorkdaySettings
                        }
                    }
                    .padding(.top, 4)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

            case .reminder:
                GroupBox("Reminder Details") {
                    VStack(alignment: .leading, spacing: 10) {
                        Toggle("Set reminder time", isOn: $reminderHasTime)

                        HStack(spacing: 10) {
                            DatePicker("", selection: $reminderDate, displayedComponents: [.date])
                                .labelsHidden()
                                .frame(maxWidth: .infinity, alignment: .leading)
                            if reminderHasTime {
                                DatePicker("", selection: $reminderTime, displayedComponents: [.hourAndMinute])
                                    .labelsHidden()
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                        }

                        HStack(spacing: 10) {
                            Picker("Repeat", selection: $repeatRule) {
                                ForEach(availableRepeatRules) { option in
                                    Text(option.label).tag(option)
                                }
                            }
                            .labelsHidden()
                            .pickerStyle(.menu)
                            .frame(maxWidth: .infinity, alignment: .leading)

                            Picker("Alert", selection: $reminderLeadTime) {
                                ForEach(ReminderLeadTime.allCases) { lead in
                                    Text(lead.label).tag(lead)
                                }
                            }
                            .labelsHidden()
                            .pickerStyle(.menu)
                            .disabled(!reminderHasTime)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }

                        if !reminderHasTime {
                            Text("Enable reminder time to choose an alert offset.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }

                        if repeatRule == .alternateWorkdays {
                            alternateWorkdaySettings
                        }
                    }
                    .padding(.top, 4)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }

        private func buildDraft() -> PlanningItemDraft {
            let effectivePriority: PriorityLevel = (kind == .task) ? priority : .medium

            var draft = PlanningItemDraft(
                kind: kind,
                title: title,
                icon: icon,
                domain: domain,
                bucketID: selectedBucketID,
                notes: notes,
                subItems: normalizedSubItems(),
                priority: effectivePriority,
                repeatRule: repeatRule,
                alternateWorkdayConfig: repeatRule == .alternateWorkdays ? AlternateWorkdayConfig(
                    startingPattern: alternateStartingPattern,
                    respectsHolidayExclusions: alternateRespectsHolidayExclusions,
                    itemHolidayPatterns: [],
                    skippedOccurrenceDateISOs: alternateSkippedOccurrenceDateISOs,
                    forcedIncludeDateISOs: alternateForcedIncludeDateISOs,
                    untilDateISO: isoDateString(max(alternateUntilDate, selectedPrimaryDate))
                ) : nil,
                startDate: nil,
                endDate: nil,
                isAllDay: false,
                startTime: nil,
                endTime: nil,
                location: "",
                dueDate: nil,
                dueTime: nil,
                estimatedMinutes: nil,
                reminderDate: nil,
                reminderTime: nil,
                reminderLeadTime: reminderLeadTime
            )

            switch kind {
            case .event:
                draft.startDate = eventStartDate
                draft.endDate = eventEndDate
                draft.isAllDay = isAllDayEvent
                draft.startTime = isAllDayEvent ? nil : eventStartTime
                draft.endTime = isAllDayEvent ? nil : eventEndTime
                draft.location = eventLocation

            case .task:
                draft.dueDate = taskDueDate
                draft.dueTime = taskHasDueTime ? taskDueTime : nil
                draft.estimatedMinutes = taskEstimatedMinutes

            case .reminder:
                draft.reminderDate = reminderDate
                draft.reminderTime = reminderHasTime ? reminderTime : nil
                draft.reminderLeadTime = reminderHasTime ? reminderLeadTime : .atTime
            }

            return draft
        }

        private func normalizedSubItems() -> [PlanningSubItem] {
            subItems.compactMap { subItem in
                let cleanTitle = subItem.title.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !cleanTitle.isEmpty else { return nil }
                return PlanningSubItem(
                    id: subItem.id,
                    kind: subItem.kind,
                    title: cleanTitle,
                    isCompleted: subItem.isCompleted,
                    sourceApp: subItem.sourceApp,
                    sourceEntryID: subItem.sourceEntryID,
                    linkedItemID: subItem.linkedItemID,
                    urlString: subItem.urlString,
                    pdfBookmarkData: subItem.pdfBookmarkData
                )
            }
        }

        private func addSelectedSubItem() {
            switch selectedSubItemKind {
            case .task:
                let t = subItemPopoverTitle.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !t.isEmpty else { return }
                subItems.append(PlanningSubItem(id: UUID(), kind: .task, title: t, isCompleted: false))
                subItemPopoverTitle = ""
            case .reminder:
                let t = subItemPopoverTitle.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !t.isEmpty else { return }
                subItems.append(PlanningSubItem(id: UUID(), kind: .reminder, title: t, isCompleted: false))
                subItemPopoverTitle = ""
            case .event:
                let t = subItemPopoverTitle.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !t.isEmpty else { return }
                subItems.append(PlanningSubItem(id: UUID(), kind: .event, title: t, isCompleted: false))
                subItemPopoverTitle = ""
            case .journalEntry:
                attachSelectedJournalEntry()
            case .url:
                let cleanURL = subItemURLInput.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !cleanURL.isEmpty else { return }
                subItems.append(
                    PlanningSubItem(
                        id: UUID(),
                        kind: .url,
                        title: cleanURL,
                        isCompleted: false,
                        urlString: cleanURL
                    )
                )
                subItemURLInput = ""
            case .favoriteLocation:
                attachSelectedFavoriteLocation()
            case .savedRoute:
                attachSelectedSavedRoute()
            case .pdfFile:
                attachSelectedPDF()
            case .mapTrip, .outfit, .weatherReport:
                break
            }
        }

        private func attachSelectedJournalEntry() {
            guard let selectedJournalEntryID,
                  let entry = store.journalEntry(for: selectedJournalEntryID) else {
                return
            }

            let snapshot = entry.previewText
            guard !snapshot.isEmpty else { return }

            subItems.append(
                PlanningSubItem(
                    id: UUID(),
                    kind: .journalEntry,
                    title: snapshot,
                    isCompleted: false,
                    sourceApp: .journal,
                    sourceEntryID: entry.id
                )
            )
            self.selectedJournalEntryID = nil
        }

        private func attachSelectedFavoriteLocation() {
            guard let selectedMapFavoriteID,
                  let favorite = store.dynamicMapFavorite(for: selectedMapFavoriteID) else {
                return
            }

            subItems.append(
                PlanningSubItem(
                    id: UUID(),
                    kind: .favoriteLocation,
                    title: favorite.title,
                    isCompleted: false,
                    sourceApp: .dynamicMap,
                    sourceEntryID: favorite.id
                )
            )
            self.selectedMapFavoriteID = nil
        }

        private func attachSelectedSavedRoute() {
            guard let selectedMapSavedRouteID,
                  let route = store.dynamicMapSavedRoute(for: selectedMapSavedRouteID) else {
                return
            }

            subItems.append(
                PlanningSubItem(
                    id: UUID(),
                    kind: .savedRoute,
                    title: route.title,
                    isCompleted: false,
                    sourceApp: .dynamicMap,
                    sourceEntryID: route.id
                )
            )
            self.selectedMapSavedRouteID = nil
        }


        private var alternateWorkdaySettings: some View {
            VStack(alignment: .leading, spacing: 8) {
                Text("Alternate workday settings")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)

                Picker("Starting Pattern", selection: $alternateStartingPattern) {
                    ForEach(ABPattern.allCases) { pattern in
                        Text(pattern.label).tag(pattern)
                    }
                }
                .pickerStyle(.menu)

                Toggle("Respect job days off", isOn: $alternateRespectsHolidayExclusions)
                    .toggleStyle(.checkbox)

                DatePicker("Repeat until", selection: $alternateUntilDate, displayedComponents: [.date])

                if alternateRespectsHolidayExclusions && hasAnchorHolidayConflict {
                    Toggle("Include first occurrence even though start date is a day off", isOn: includeFirstOccurrenceDespiteHolidayBinding)
                        .toggleStyle(.checkbox)
                }

                Text("Starting pattern is only shown while editing.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            .padding(10)
            .cardStyle(cornerRadius: 10, tint: .secondary, hasBorder: false)
        }

        private func isoDateString(_ date: Date) -> String {
            let formatter = DateFormatter()
            formatter.calendar = Calendar(identifier: .gregorian)
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.timeZone = TimeZone(secondsFromGMT: 0)
            formatter.dateFormat = "yyyy-MM-dd"
            return formatter.string(from: date)
        }

        private static func inferPattern(for date: Date) -> ABPattern {
            _ = date
            return .a
        }

        private static func defaultKind(for destination: AppDestination) -> PlanningKind {
            switch destination {
            case .events:
                return .event
            case .reminders:
                return .reminder
            default:
                return .task
            }
        }
    }

private struct AddSubItemPopover: View {
    let kind: PlanningSubItemKind
    @Binding var title: String
    @Binding var urlInput: String
    @Binding var selectedPDFFileURL: URL?
    @Binding var selectedPDFBookmarkData: Data?
    @Binding var selectedJournalEntryID: UUID?
    @Binding var selectedMapFavoriteID: UUID?
    @Binding var selectedMapSavedRouteID: UUID?
    let attachableJournalEntries: [JournalEntry]
    let attachableMapFavorites: [DynamicMapFavoriteLocation]
    let attachableSavedRoutes: [DynamicMapSavedRoute]
    let onSelectPDF: () -> Void
    let onConfirm: () -> Void
    let onCancel: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Add \(kind.label)")
                .font(.headline)

            switch kind {
            case .task, .reminder, .event:
                TextField("Title", text: $title)
                    .textFieldStyle(.roundedBorder)
                    .frame(minWidth: 260)
                    .onSubmit { if canConfirm { onConfirm() } }

            case .url:
                TextField("https://example.com", text: $urlInput)
                    .textFieldStyle(.roundedBorder)
                    .frame(minWidth: 260)
                    .onSubmit { if canConfirm { onConfirm() } }

            case .pdfFile:
                HStack {
                    if let url = selectedPDFFileURL {
                        Text(url.lastPathComponent)
                            .font(.caption)
                            .lineLimit(1)
                            .truncationMode(.middle)
                    } else {
                        Text("No file selected")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Button("Browse") { onSelectPDF() }
                        .buttonStyle(.bordered)
                }
                .frame(minWidth: 260)

            case .journalEntry:
                if attachableJournalEntries.isEmpty {
                    Text("Create a journal entry in the Journal app to attach it here.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .frame(minWidth: 260)
                } else {
                    Picker("Journal entry", selection: $selectedJournalEntryID) {
                        Text("Select entry").tag(Optional<UUID>.none)
                        ForEach(attachableJournalEntries) { entry in
                            let entryTitle = entry.trimmedTitle.isEmpty ? "Untitled Entry" : entry.trimmedTitle
                            Text("\(entryTitle) - \(entry.mood.label)").tag(Optional(entry.id))
                        }
                    }
                    .pickerStyle(.menu)
                    .frame(minWidth: 260)
                }

            case .favoriteLocation:
                if attachableMapFavorites.isEmpty {
                    Text("Create a favorite location in Dynamic Map to attach it here.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .frame(minWidth: 260)
                } else {
                    Picker("Favorite location", selection: $selectedMapFavoriteID) {
                        Text("Select favorite").tag(Optional<UUID>.none)
                        ForEach(attachableMapFavorites) { favorite in
                            Text(favorite.title).tag(Optional(favorite.id))
                        }
                    }
                    .pickerStyle(.menu)
                    .frame(minWidth: 260)
                }

            case .savedRoute:
                if attachableSavedRoutes.isEmpty {
                    Text("Save a route in Dynamic Map to attach it here.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .frame(minWidth: 260)
                } else {
                    Picker("Saved route", selection: $selectedMapSavedRouteID) {
                        Text("Select route").tag(Optional<UUID>.none)
                        ForEach(attachableSavedRoutes) { route in
                            Text(route.title).tag(Optional(route.id))
                        }
                    }
                    .pickerStyle(.menu)
                    .frame(minWidth: 260)
                }

            default:
                EmptyView()
            }

            HStack {
                Spacer()
                Button("Cancel", action: onCancel)
                Button("Add", action: onConfirm)
                    .buttonStyle(.borderedProminent)
                    .disabled(!canConfirm)
                    .keyboardShortcut(.defaultAction)
            }
        }
        .padding(16)
    }

    private var canConfirm: Bool {
        switch kind {
        case .task, .reminder, .event:
            return !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        case .url:
            return !urlInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        case .pdfFile:
            return selectedPDFFileURL != nil
        case .journalEntry:
            return selectedJournalEntryID != nil
        case .favoriteLocation:
            return selectedMapFavoriteID != nil
        case .savedRoute:
            return selectedMapSavedRouteID != nil
        default:
            return false
        }
    }
}

