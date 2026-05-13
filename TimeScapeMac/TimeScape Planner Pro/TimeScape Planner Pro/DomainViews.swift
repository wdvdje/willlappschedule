import SwiftUI

    struct PersonalDomainView: View {
        @Binding var isShowingCreateBucketSheet: Bool
        @Binding var editingBucket: PlannerBucket?
        @Binding var isViewingArchivedBuckets: Bool

        var body: some View {
            DomainBucketsPage(
                title: "Personal",
                eyebrow: "Individual focus",
                domain: .personal,
                isShowingCreateBucketSheet: $isShowingCreateBucketSheet,
                editingBucket: $editingBucket,
                isViewingArchivedBuckets: $isViewingArchivedBuckets
            )
        }
    }

    struct HouseholdDomainView: View {
        @Binding var isShowingCreateBucketSheet: Bool
        @Binding var editingBucket: PlannerBucket?
        @Binding var isViewingArchivedBuckets: Bool

        var body: some View {
            DomainBucketsPage(
                title: "Household",
                eyebrow: "Home operations",
                domain: .household,
                isShowingCreateBucketSheet: $isShowingCreateBucketSheet,
                editingBucket: $editingBucket,
                isViewingArchivedBuckets: $isViewingArchivedBuckets
            )
        }
    }

    struct ProfessionalDomainView: View {
        @Binding var isShowingCreateBucketSheet: Bool
        @Binding var editingBucket: PlannerBucket?
        @Binding var isViewingArchivedBuckets: Bool

        var body: some View {
            DomainBucketsPage(
                title: "Professional",
                eyebrow: "Work execution",
                domain: .professional,
                isShowingCreateBucketSheet: $isShowingCreateBucketSheet,
                editingBucket: $editingBucket,
                isViewingArchivedBuckets: $isViewingArchivedBuckets
            )
        }
    }

    struct DomainBucketsPage: View {
        let title: String
        let eyebrow: String
        let domain: BucketDomain

        private let bucketColumns = [
            GridItem(.flexible(), spacing: 16),
            GridItem(.flexible(), spacing: 16)
        ]

        @Binding var isShowingCreateBucketSheet: Bool
        @Binding var editingBucket: PlannerBucket?
        @Binding var isViewingArchivedBuckets: Bool

        @EnvironmentObject private var store: PlannerStore
        @State private var editingPreviewItem: PlanningItem?
        @State private var createItemPrefill: WeekItemPrefill?

        private var destinationForDomain: AppDestination {
            switch domain {
            case .personal:
                return .personal
            case .household:
                return .household
            case .professional:
                return .professional
            }
        }

        private func openCreateItem(for bucket: PlannerBucket) {
            let now = Date()
            let oneHourLater = Calendar.current.date(byAdding: .hour, value: 1, to: now) ?? now
            createItemPrefill = WeekItemPrefill(
                kind: .task,
                domain: bucket.domain,
                bucketID: bucket.id,
                start: now,
                end: oneHourLater,
                isAllDay: true
            )
        }

        var body: some View {
            VStack(alignment: .leading, spacing: 16) {
                SectionHeader(title: title, eyebrow: eyebrow)

                let visibleBuckets = isViewingArchivedBuckets
                    ? store.archivedBuckets(for: domain)
                    : store.activeBuckets(for: domain)

                if visibleBuckets.isEmpty {
                    Text(isViewingArchivedBuckets ? "No archived buckets." : "No active buckets yet.")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                        .padding(.vertical, 8)
                } else {
                    LazyVGrid(columns: bucketColumns, alignment: .leading, spacing: 16) {
                        ForEach(visibleBuckets) { bucket in
                            let bucketItems = store.items(for: bucket.id)
                            BucketCard(
                                bucket: bucket,
                                itemCount: bucketItems.count,
                                previewItems: Array(bucketItems.prefix(3)),
                                onPreviewItemTap: { editingPreviewItem = $0 },
                                onAddItem: { openCreateItem(for: bucket) },
                                onEdit: { editingBucket = bucket },
                                onArchive: {
                                    if isViewingArchivedBuckets {
                                        store.unarchiveBucket(id: bucket.id)
                                    } else {
                                        store.archiveBucket(id: bucket.id)
                                    }
                                },
                                onDelete: { store.deleteBucket(id: bucket.id) }
                            )
                        }
                    }
                }
            }
            .sheet(isPresented: $isShowingCreateBucketSheet) {
                BucketEditorSheet(domain: domain) { name, colorHex, icon, detail, isJob, payRate, payPeriod, jobSite, isRoutine, routineFrequency, jobHolidayPatterns in
                    let newBucketID = store.createBucket(
                        domain: domain,
                        name: name,
                        colorHex: colorHex,
                        icon: icon,
                        detail: detail,
                        isJob: isJob,
                        payRate: payRate,
                        payPeriod: payPeriod,
                        jobSite: jobSite,
                        isRoutine: isRoutine,
                        routineFrequency: routineFrequency
                    )
                    if isJob, let newBucketID {
                        store.updateBucketJobHolidayPatterns(bucketID: newBucketID, patterns: jobHolidayPatterns)
                    }
                }
            }
            .sheet(item: $editingBucket) { bucket in
                BucketEditorSheet(domain: domain, existingBucket: bucket) { name, colorHex, icon, detail, isJob, payRate, payPeriod, jobSite, isRoutine, routineFrequency, jobHolidayPatterns in
                    store.updateBucket(
                        id: bucket.id,
                        name: name,
                        colorHex: colorHex,
                        icon: icon,
                        detail: detail,
                        isJob: isJob,
                        payRate: payRate,
                        payPeriod: payPeriod,
                        jobSite: jobSite,
                        isRoutine: isRoutine,
                        routineFrequency: routineFrequency
                    )
                    if isJob {
                        store.updateBucketJobHolidayPatterns(bucketID: bucket.id, patterns: jobHolidayPatterns)
                    }
                }
            }
            .sheet(item: $editingPreviewItem) { item in
                PlanningItemEditorSheet(item: item) { draft in
                    store.updateItem(itemID: item.id, from: draft)
                }
            }
            .sheet(
                isPresented: Binding(
                    get: { createItemPrefill != nil },
                    set: { isPresented in
                        if !isPresented {
                            createItemPrefill = nil
                        }
                    }
                )
            ) {
                if let createItemPrefill {
                    NewPlanningItemSheet(destination: destinationForDomain, prefill: createItemPrefill) { draft in
                        store.createItem(from: draft)
                    }
                }
            }
        }
    }

    struct ItemPreviewButton: View {
        let item: PlanningItem
        let onEdit: () -> Void
        let symbolName: String

        @EnvironmentObject private var store: PlannerStore
        @State private var isHovering = false
        @State private var showPopover = false

        var bucket: PlannerBucket? {
            store.bucket(for: item.bucketID)
        }

        var body: some View {
            Button {
                showPopover = true
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: symbolName)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    Text(item.title)
                        .font(.caption)
                        .lineLimit(1)
                        .truncationMode(.tail)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 6)
                .background(
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .fill(isHovering ? Color.secondary.opacity(0.14) : Color.clear)
                )
            }
            .buttonStyle(.plain)
            .onHover { hovering in
                isHovering = hovering
            }
            .popover(isPresented: $showPopover, arrowEdge: .leading) {
                ItemPreviewPopover(item: item, bucket: bucket, onEdit: onEdit)
                    .environmentObject(store)
            }
        }
    }

    struct ItemPreviewPopover: View {
        let item: PlanningItem
        let bucket: PlannerBucket?
        let onEdit: () -> Void

        @EnvironmentObject private var store: PlannerStore

        var body: some View {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(item.title)
                            .font(.headline)
                        if let bucket = bucket {
                            HStack(spacing: 6) {
                                Image(systemName: bucket.icon)
                                    .font(.caption)
                                Text(bucket.name)
                                    .font(.caption)
                            }
                            .foregroundStyle(.secondary)
                        }
                    }
                    Spacer()
                }

                Divider()

                if !item.notes.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Notes")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                        Text(item.notes)
                            .font(.caption)
                            .lineLimit(3)
                            .truncationMode(.tail)
                    }
                }

                if !item.subItems.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Sub-Items")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                        ForEach(Array(item.subItems.prefix(3))) { subItem in
                            HStack(spacing: 4) {
                                Image(systemName: subItem.isCompleted ? "checkmark.circle.fill" : "circle")
                                    .font(.caption2)
                                    .foregroundStyle(subItem.isCompleted ? .green : .secondary)
                                Text(subItem.title)
                                    .font(.caption2)
                                    .foregroundStyle(subItem.isCompleted ? .secondary : .primary)
                                    .strikethrough(subItem.isCompleted)
                                    .lineLimit(1)
                                    .truncationMode(.tail)
                            }
                        }
                        if item.subItems.count > 3 {
                            Text("+\(item.subItems.count - 3) more")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                Divider()

                Button(action: onEdit) {
                    HStack {
                        Image(systemName: "pencil")
                        Text("Edit Item")
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
            }
            .padding(12)
            .frame(width: 280)
        }
    }

    struct BucketCard: View {
        let bucket: PlannerBucket
        let itemCount: Int
        let previewItems: [PlanningItem]
        let onPreviewItemTap: (PlanningItem) -> Void
        let onAddItem: () -> Void
        let onEdit: () -> Void
        let onArchive: () -> Void
        let onDelete: () -> Void

        @State private var isHoveringMenu = false

        var body: some View {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    HStack(spacing: 10) {
                        Image(systemName: bucket.icon)
                            .font(.title2)
                        VStack(alignment: .leading, spacing: 2) {
                            HStack(spacing: 8) {
                                Text(bucket.name)
                                    .font(.headline)
                                if bucket.isDefault {
                                    Text("General")
                                        .font(.caption2.weight(.bold))
                                        .padding(.horizontal, 6)
                                        .padding(.vertical, 2)
                                        .background(Color.secondary.opacity(0.18), in: Capsule())
                                }
                            }
                            Text(bucket.detail)
                                .font(.caption)
                                .foregroundStyle(.secondary)

                            if bucket.isJob {
                                HStack(spacing: 8) {
                                    Label("Job", systemImage: "briefcase.fill")
                                        .font(.caption2.weight(.semibold))
                                        .foregroundStyle(.secondary)

                                    if let payRate = bucket.payRate {
                                        Text("$\(payRate.formatted(.number.precision(.fractionLength(2))))\(bucket.payPeriod.suffix)")
                                            .font(.caption2)
                                            .foregroundStyle(.secondary)
                                    }

                                    if !bucket.jobSite.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                                        Text(bucket.jobSite)
                                            .font(.caption2)
                                            .foregroundStyle(.secondary)
                                            .lineLimit(1)
                                            .truncationMode(.tail)
                                    }
                                }
                            }
                        }
                    }

                    Spacer()
                    Menu {
                        if !bucket.isArchived {
                            Button("Add item", action: onAddItem)
                            Divider()
                        }

                        Button("Edit bucket", action: onEdit)
                        if !bucket.isDefault {
                            Divider()
                        }
                        if !bucket.isDefault {
                            Button(bucket.isArchived ? "Unarchive" : "Archive", action: onArchive)
                            Divider()
                            Button("Delete", role: .destructive, action: onDelete)
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                            .foregroundStyle(isHoveringMenu ? .primary : .secondary)
                            .background(isHoveringMenu ? Color.accentColor.opacity(0.1) : Color.clear, in: Circle())
                    }
                    .menuIndicator(.hidden)
                    .menuStyle(.borderlessButton)
                    .onHover { isHoveringMenu = $0 }
                }

                HStack(spacing: 16) {
                    HStack(spacing: 4) {
                        Image(systemName: "list.bullet")
                            .font(.caption)
                        Text("\(itemCount)")
                            .font(.caption.weight(.semibold))
                    }
                    .foregroundStyle(.secondary)
                    Spacer()
                }

                VStack(alignment: .leading, spacing: 6) {
                    Text("Items")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)

                    if previewItems.isEmpty {
                        Text("No items yet")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(previewItems) { item in
                            ItemPreviewButton(
                                item: item,
                                onEdit: { onPreviewItemTap(item) },
                                symbolName: item.icon
                            )
                        }
                    }
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(Color(hex: bucket.colorHex).opacity(0.16))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(Color(hex: bucket.colorHex).opacity(0.34), lineWidth: 1)
            )
        }

    }

    struct BucketBadge: View {
        let bucket: PlannerBucket

        var body: some View {
            HStack(spacing: 6) {
                Image(systemName: bucket.icon)
                Text(bucket.name)
                    .font(.caption.weight(.semibold))
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(Color(hex: bucket.colorHex).opacity(0.24), in: Capsule())
        }
    }

    struct BucketSectionCard<RowContent: View>: View {
        let title: String
        let buckets: [PlannerBucket]
        let emptyMessage: String
        let rowBuilder: (PlannerBucket) -> RowContent

        var body: some View {
            VStack(alignment: .leading, spacing: 12) {
                Text(title)
                    .font(.headline)

                if buckets.isEmpty {
                    Text(emptyMessage)
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(buckets) { bucket in
                        rowBuilder(bucket)
                    }
                }
            }
            .padding(18)
            .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        }
    }

    struct BucketRow: View {
        let bucket: PlannerBucket
        let onEdit: () -> Void
        let onArchiveToggle: () -> Void
        let onDelete: () -> Void

        @State private var isHoveringMenu = false

        var body: some View {
            HStack(spacing: 12) {
                Circle()
                    .fill(Color(hex: bucket.colorHex))
                    .frame(width: 14, height: 14)

                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 8) {
                        Image(systemName: bucket.icon)
                        Text(bucket.name)
                            .font(.subheadline.weight(.semibold))
                        if bucket.isDefault {
                            Text("General")
                                .font(.caption2.weight(.bold))
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(Color.secondary.opacity(0.18), in: Capsule())
                        }
                    }
                    Text(bucket.detail)
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    if bucket.isJob {
                        HStack(spacing: 8) {
                            Label("Job", systemImage: "briefcase.fill")
                                .font(.caption2.weight(.semibold))
                                .foregroundStyle(.secondary)

                            if let payRate = bucket.payRate {
                                Text("$\(payRate.formatted(.number.precision(.fractionLength(2))))\(bucket.payPeriod.suffix)")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }

                            if !bucket.jobSite.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                                Text(bucket.jobSite)
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                                    .lineLimit(1)
                                    .truncationMode(.tail)
                            }
                        }
                    }
                }

                Spacer()

                Button(action: onEdit) {
                    Image(systemName: "pencil")
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
                .help("Edit bucket")

                Menu {
                    if !bucket.isDefault {
                        Button(bucket.isArchived ? "Unarchive" : "Archive", action: onArchiveToggle)
                        Divider()
                        Button("Delete", role: .destructive, action: onDelete)
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                        .foregroundStyle(isHoveringMenu ? .primary : .secondary)
                        .background(isHoveringMenu ? Color.accentColor.opacity(0.1) : Color.clear, in: Circle())
                }
                .menuIndicator(.hidden)
                .menuStyle(.borderlessButton)
                .onHover { isHoveringMenu = $0 }
            }
            .padding(10)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(Color(hex: bucket.colorHex).opacity(0.11))
            )
        }
    }

    struct BucketEditorSheet: View {
        private struct IconChoice: Identifiable {
            let symbolName: String
            let label: String

            var id: String { symbolName }
        }

        private struct IconCategory: Identifiable {
            let title: String
            let choices: [IconChoice]

            var id: String { title }
        }

        private static let iconCategories: [IconCategory] = [
            IconCategory(title: "Quick Picks", choices: [
                IconChoice(symbolName: "star", label: "Important"),
                IconChoice(symbolName: "briefcase", label: "Work"),
                IconChoice(symbolName: "house", label: "Home"),
                IconChoice(symbolName: "calendar", label: "Calendar"),
                IconChoice(symbolName: "checkmark.circle", label: "Task"),
                IconChoice(symbolName: "clock", label: "Clock")
            ]),
            IconCategory(title: "People", choices: [
                IconChoice(symbolName: "person", label: "Person"),
                IconChoice(symbolName: "person.2", label: "People"),
                IconChoice(symbolName: "figure.walk", label: "Walk"),
                IconChoice(symbolName: "pawprint", label: "Pets")
            ]),
            IconCategory(title: "Home", choices: [
                IconChoice(symbolName: "house", label: "House"),
                IconChoice(symbolName: "building", label: "Building"),
                IconChoice(symbolName: "bed.double", label: "Sleep"),
                IconChoice(symbolName: "fork.knife", label: "Meals"),
                IconChoice(symbolName: "cart", label: "Shopping"),
                IconChoice(symbolName: "bag", label: "Bag")
            ]),
            IconCategory(title: "Work", choices: [
                IconChoice(symbolName: "briefcase", label: "Work"),
                IconChoice(symbolName: "building.2", label: "Office"),
                IconChoice(symbolName: "laptopcomputer", label: "Computer"),
                IconChoice(symbolName: "doc.text", label: "Documents"),
                IconChoice(symbolName: "folder", label: "Folder"),
                IconChoice(symbolName: "hammer", label: "Projects"),
                IconChoice(symbolName: "chart.bar", label: "Analytics")
            ]),
            IconCategory(title: "Health", choices: [
                IconChoice(symbolName: "heart", label: "Health"),
                IconChoice(symbolName: "cross.case", label: "Medical"),
                IconChoice(symbolName: "dumbbell", label: "Fitness"),
                IconChoice(symbolName: "leaf", label: "Nature")
            ]),
            IconCategory(title: "Finance", choices: [
                IconChoice(symbolName: "dollarsign.circle", label: "Finance"),
                IconChoice(symbolName: "creditcard", label: "Billing"),
                IconChoice(symbolName: "banknote", label: "Cash"),
                IconChoice(symbolName: "wallet.pass", label: "Wallet"),
                IconChoice(symbolName: "chart.line.uptrend.xyaxis", label: "Growth")
            ]),
            IconCategory(title: "Travel", choices: [
                IconChoice(symbolName: "car", label: "Travel"),
                IconChoice(symbolName: "airplane", label: "Flight"),
                IconChoice(symbolName: "map", label: "Map"),
                IconChoice(symbolName: "location", label: "Location"),
                IconChoice(symbolName: "tram", label: "Transit")
            ]),
            IconCategory(title: "Study & Media", choices: [
                IconChoice(symbolName: "book", label: "Book"),
                IconChoice(symbolName: "graduationcap", label: "Study"),
                IconChoice(symbolName: "camera", label: "Camera"),
                IconChoice(symbolName: "music.note", label: "Music"),
                IconChoice(symbolName: "gamecontroller", label: "Gaming"),
                IconChoice(symbolName: "paintpalette", label: "Creative")
            ]),
            IconCategory(title: "Planning", choices: [
                IconChoice(symbolName: "bell", label: "Reminder"),
                IconChoice(symbolName: "calendar", label: "Calendar"),
                IconChoice(symbolName: "clock", label: "Clock"),
                IconChoice(symbolName: "alarm", label: "Alarm"),
                IconChoice(symbolName: "bookmark", label: "Bookmark"),
                IconChoice(symbolName: "flag", label: "Flag"),
                IconChoice(symbolName: "checklist", label: "Checklist")
            ])
        ]

        let domain: BucketDomain
        let existingBucket: PlannerBucket?
        let onSave: (String, String, String, String, Bool, Double?, JobPayPeriod, String, Bool, RoutineFrequency, [WorkHolidayPattern]) -> Void

        @Environment(\.dismiss) private var dismiss
        @State private var name: String
        @State private var icon: String
        @State private var detail: String
        @State private var tone: BucketTone
        @State private var isJob: Bool
        @State private var payRateText: String
        @State private var payPeriod: JobPayPeriod
        @State private var jobSite: String
        @State private var isRoutine: Bool
        @State private var routineFrequency: RoutineFrequency
        @State private var jobHolidayPatterns: [WorkHolidayPattern]
        @State private var specificDayOffDate: Date
        @State private var recurringDayOffDate: Date
        @State private var selectedUSHoliday: USHoliday

        init(domain: BucketDomain, existingBucket: PlannerBucket? = nil, onSave: @escaping (String, String, String, String, Bool, Double?, JobPayPeriod, String, Bool, RoutineFrequency, [WorkHolidayPattern]) -> Void) {
            self.domain = domain
            self.existingBucket = existingBucket
            self.onSave = onSave

            _name = State(initialValue: existingBucket?.name ?? "")
            _icon = State(initialValue: existingBucket?.icon ?? Self.defaultIcon(for: domain))
            _detail = State(initialValue: existingBucket?.detail ?? "")
            _tone = State(initialValue: BucketTone.nearest(to: existingBucket?.colorHex ?? BucketTone.ocean.hex))
            _isJob = State(initialValue: existingBucket?.isJob ?? false)
            _payRateText = State(initialValue: existingBucket?.payRate.map { $0.formatted(.number.precision(.fractionLength(2))) } ?? "")
            _payPeriod = State(initialValue: existingBucket?.payPeriod ?? .hourly)
            _jobSite = State(initialValue: existingBucket?.jobSite ?? "")
            _isRoutine = State(initialValue: existingBucket?.isRoutine ?? false)
            _routineFrequency = State(initialValue: existingBucket?.routineFrequency ?? .weekly)
            _jobHolidayPatterns = State(initialValue: existingBucket?.jobHolidayPatterns ?? [])
            _specificDayOffDate = State(initialValue: Date())
            _recurringDayOffDate = State(initialValue: Date())
            _selectedUSHoliday = State(initialValue: .newYearsDay)
        }

        private var availableIconCategories: [IconCategory] {
            let currentIcon = icon.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !currentIcon.isEmpty else { return Self.iconCategories }

            if Self.iconCategories.flatMap(\.choices).contains(where: { $0.symbolName == currentIcon }) {
                return Self.iconCategories
            }

            let currentCategory = IconCategory(
                title: "Current",
                choices: [IconChoice(symbolName: currentIcon, label: "Current")]
            )

            return [currentCategory] + Self.iconCategories
        }

        private var parsedPayRate: Double? {
            let trimmed = payRateText.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { return nil }
            guard let value = Double(trimmed), value >= 0 else { return nil }
            return value
        }

        private static func defaultIcon(for domain: BucketDomain) -> String {
            switch domain {
            case .personal:
                return "person"
            case .household:
                return "house"
            case .professional:
                return "briefcase"
            }
        }

        private var requiresJobFields: Bool {
            domain == .professional && isJob
        }

        private var requiresRoutineFields: Bool {
            domain == .personal && isRoutine
        }

        private var canSave: Bool {
            let baseValid = !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
            !icon.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
            !detail.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty

            guard baseValid else { return false }
            guard requiresJobFields else { return true }
            return parsedPayRate != nil && !jobSite.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }

        var body: some View {
            VStack(alignment: .leading, spacing: 14) {
                Text(existingBucket == nil ? "New Bucket" : "Edit Bucket")
                    .font(.title2.weight(.semibold))

                Text("Domain: \(domain.title)")
                    .foregroundStyle(.secondary)

                HStack(spacing: 10) {
                    TextField("Bucket name", text: $name)
                        .textFieldStyle(.roundedBorder)

                    Picker("Icon", selection: $icon) {
                        ForEach(availableIconCategories) { category in
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
                }

                HStack(spacing: 10) {
                    Picker("Color", selection: $tone) {
                        ForEach(BucketTone.allCases) { tone in
                            Text(tone.label).tag(tone)
                        }
                    }
                    .labelsHidden()
                    .pickerStyle(.menu)
                    .frame(maxWidth: .infinity, alignment: .leading)

                    TextField("Description", text: $detail)
                        .textFieldStyle(.roundedBorder)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                if domain == .professional {
                    Toggle("Job?", isOn: $isJob)

                    if isJob {
                        HStack(spacing: 10) {
                            LocationAutocompleteField(
                                text: $jobSite,
                                placeholder: "Job site / Address"
                            )
                            
                            TextField("Pay rate", text: $payRateText)
                                .textFieldStyle(.roundedBorder)
                        }

                        HStack(spacing: 10) {
                            Picker("Pay period", selection: $payPeriod) {
                                ForEach(JobPayPeriod.allCases) { period in
                                    Text(period.label).tag(period)
                                }
                            }
                            .labelsHidden()
                            .pickerStyle(.menu)
                            .frame(maxWidth: .infinity, alignment: .leading)

                            Color.clear
                                .frame(maxWidth: .infinity)
                        }

                        jobHolidayEditor
                    }
                }

                if domain == .personal {
                    Toggle("Routine?", isOn: $isRoutine)

                    if isRoutine {
                        Picker("Frequency", selection: $routineFrequency) {
                            ForEach(RoutineFrequency.allCases) { frequency in
                                Text(frequency.label).tag(frequency)
                            }
                        }
                        .labelsHidden()
                        .pickerStyle(.menu)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }

                HStack {
                    Spacer()
                    Button("Cancel") { dismiss() }
                    Button("Save") {
                        onSave(name, tone.hex, icon, detail, requiresJobFields, parsedPayRate, payPeriod, jobSite, requiresRoutineFields, routineFrequency, requiresJobFields ? jobHolidayPatterns : [])
                        dismiss()
                    }
                    .keyboardShortcut(.defaultAction)
                    .disabled(!canSave)
                }
            }
            .padding(20)
            .frame(minWidth: 420)
        }

        private var jobHolidayEditor: some View {
            VStack(alignment: .leading, spacing: 8) {
                Text("Job days off")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)

                HStack(spacing: 8) {
                    DatePicker("", selection: $specificDayOffDate, displayedComponents: [.date])
                        .labelsHidden()
                    Button("Add date") {
                        jobHolidayPatterns.append(
                            WorkHolidayPattern(
                                kind: .specificDate,
                                specificDateISO: isoDateString(specificDayOffDate)
                            )
                        )
                    }
                    .buttonStyle(.bordered)
                }

                HStack(spacing: 8) {
                    DatePicker("", selection: $recurringDayOffDate, displayedComponents: [.date])
                        .labelsHidden()
                    Button("Add recurring MM/DD") {
                        let components = Calendar.current.dateComponents([.month, .day], from: recurringDayOffDate)
                        jobHolidayPatterns.append(
                            WorkHolidayPattern(
                                kind: .recurringMonthDay,
                                recurringMonth: components.month,
                                recurringDay: components.day
                            )
                        )
                    }
                    .buttonStyle(.bordered)
                }

                HStack(spacing: 8) {
                    Picker("US Holiday", selection: $selectedUSHoliday) {
                        ForEach(USHoliday.allCases) { holiday in
                            Text(holiday.label).tag(holiday)
                        }
                    }
                    .pickerStyle(.menu)

                    Button("Add holiday") {
                        jobHolidayPatterns.append(
                            WorkHolidayPattern(kind: .predefinedUSHoliday, usHoliday: selectedUSHoliday)
                        )
                    }
                    .buttonStyle(.bordered)
                }

                if jobHolidayPatterns.isEmpty {
                    Text("No default days off configured.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(jobHolidayPatterns) { pattern in
                        HStack(spacing: 8) {
                            Text(holidayPatternLabel(pattern))
                                .font(.caption)
                            Spacer()
                            Button(role: .destructive) {
                                jobHolidayPatterns.removeAll { $0.id == pattern.id }
                            } label: {
                                Image(systemName: "trash")
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            .padding(10)
            .background(Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        }

        private func holidayPatternLabel(_ pattern: WorkHolidayPattern) -> String {
            switch pattern.kind {
            case .specificDate:
                return pattern.specificDateISO ?? "Specific date"
            case .recurringMonthDay:
                let month = pattern.recurringMonth ?? 0
                let day = pattern.recurringDay ?? 0
                return String(format: "Recurring %02d/%02d", month, day)
            case .predefinedUSHoliday:
                return pattern.usHoliday?.label ?? "US Holiday"
            }
        }

        private func isoDateString(_ date: Date) -> String {
            let formatter = DateFormatter()
            formatter.calendar = Calendar(identifier: .gregorian)
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.timeZone = TimeZone(secondsFromGMT: 0)
            formatter.dateFormat = "yyyy-MM-dd"
            return formatter.string(from: date)
        }
    }

