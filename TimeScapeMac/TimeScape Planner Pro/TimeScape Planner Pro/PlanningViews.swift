import SwiftUI
import MapKit
import CoreLocation
import Combine
import AppKit

    struct AppsHubView: View {
        @Environment(\.openWindow) private var openWindow
        @State private var selectedApp: CompanionAppID?
        @State private var hoveredApp: CompanionAppID?

        private let tileColumns = [
            GridItem(.adaptive(minimum: 210, maximum: 270), spacing: AppSpacing.generous.rawValue)
        ]

        var body: some View {
            VStack(alignment: .leading, spacing: AppSpacing.generous.rawValue) {
                SectionHeader(title: "Apps", eyebrow: "Companion tools")

                Text("Open companion tools in dedicated windows and connect their output back to your buckets and planning items.")
                    .appDescription()

                LazyVGrid(columns: tileColumns, alignment: .leading, spacing: AppSpacing.generous.rawValue) {
                    ForEach(CompanionAppID.allCases) { app in
                        AppLauncherTile(
                            app: app,
                            isSelected: selectedApp == app,
                            isHovered: hoveredApp == app
                        ) {
                            selectedApp = app
                        }
                        .popover(
                            isPresented: Binding(
                                get: { selectedApp == app },
                                set: { isPresented in
                                    if !isPresented && selectedApp == app {
                                        selectedApp = nil
                                    }
                                }
                            ),
                            arrowEdge: .top
                        ) {
                            VStack(alignment: .leading, spacing: AppSpacing.standard.rawValue) {
                                HStack(alignment: .center, spacing: AppSpacing.compact.rawValue) {
                                    Image(systemName: app.symbolName)
                                        .font(.title3.weight(.semibold))
                                        .foregroundStyle(app.accentStart)

                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(app.title)
                                            .appSubtitle()
                                        Text(app.subtitle)
                                            .appDescription()
                                    }

                                    Spacer()
                                    AppStatusBadge(status: app.status)
                                }

                                FeatureListCard(title: "What this tool will do", items: app.highlights)

                                HStack(spacing: AppSpacing.compact.rawValue) {
                                    Button {
                                        openWindow(id: app.windowID)
                                        selectedApp = nil
                                    } label: {
                                        Label("Open \(app.title)", systemImage: "macwindow")
                                    }
                                    .appButton(.bordered_prominent)

                                    Text("Singleton window mode")
                                        .appCaption()
                                }
                            }
                            .padding(AppSpacing.large.rawValue)
                            .frame(width: 420)
                        }
                        .onHover { isHovering in
                            hoveredApp = isHovering ? app : (hoveredApp == app ? nil : hoveredApp)
                        }
                    }
                }
            }
        }
    }

    struct CompanionAppWindowRoot: View {
        let app: CompanionAppID

        var body: some View {
            Group {
                if app == .meals {
                    MealsPageView()
                } else if app == .dynamicMap {
                    DynamicMapAppView()
                } else if app == .budgeting {
                    BudgetingAppView()
                } else {
                    VStack(alignment: .leading, spacing: AppSpacing.large.rawValue) {
                        HStack(alignment: .center, spacing: AppSpacing.small.rawValue) {
                            ZStack {
                                RoundedRectangle(cornerRadius: 14, style: .continuous)
                                    .fill(
                                        LinearGradient(
                                            colors: [app.accentStart.opacity(0.90), app.accentEnd.opacity(0.74)],
                                            startPoint: .topLeading,
                                            endPoint: .bottomTrailing
                                        )
                                    )
                                Image(systemName: app.symbolName)
                                    .font(.title2.weight(.semibold))
                                    .foregroundStyle(.white)
                            }
                            .frame(width: 56, height: 56)

                            VStack(alignment: .leading, spacing: 4) {
                                Text(app.title)
                                    .appTitle()
                                Text(app.subtitle)
                                    .appDescription()
                            }

                            Spacer()
                            AppStatusBadge(status: app.status)
                        }

                        Grid(horizontalSpacing: AppSpacing.small.rawValue, verticalSpacing: AppSpacing.small.rawValue) {
                            GridRow {
                                MetricCard(
                                    title: "Readiness",
                                    value: app.status.label,
                                    detail: "Window is available",
                                    tint: app.accentStart
                                )

                                MetricCard(
                                    title: "Integration",
                                    value: "In Progress",
                                    detail: "Bucket and item links next",
                                    tint: app.accentEnd
                                )
                            }
                        }

                        FeatureListCard(
                            title: "Current scope",
                            items: app.highlights
                        )

                        Spacer(minLength: 0)
                    }
                    .padding(AppSpacing.spacious.rawValue)
                    .frame(minWidth: 760, minHeight: 520, alignment: .topLeading)
                    .background(
                        LinearGradient(
                            colors: [
                                Color(nsColor: .windowBackgroundColor),
                                app.accentStart.opacity(0.06)
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                }
            }
        }
    }

    struct BudgetingAppView: View {
        @EnvironmentObject private var store: PlannerStore

        @State private var selectedCategoryID: UUID?
        @State private var expenseTitle = ""
        @State private var expenseAmount = ""
        @State private var expenseDate = Date()

        @State private var billTitle = ""
        @State private var billAmount = ""
        @State private var billDay = 1
        @State private var billCadence: BudgetBillCadence = .monthly
        @State private var billCategoryID: UUID?

        @State private var monthlyGoalInput = ""
        @State private var taxRateInput = ""

        private var currencyCode: String {
            Locale.current.currency?.identifier ?? "USD"
        }

        private var activeCategories: [BudgetCategory] {
            store.budgetCategories
                .filter { !$0.isArchived }
                .sorted { $0.title.localizedCaseInsensitiveCompare($1.title) == .orderedAscending }
        }

        private var professionalJobBuckets: [PlannerBucket] {
            store.buckets
                .filter { $0.domain == .professional && $0.isJob && ($0.payRate ?? 0) > 0 }
                .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
        }

        private var payrollWeekdays: [(label: String, value: Int)] {
            [
                ("Sunday", 1),
                ("Monday", 2),
                ("Tuesday", 3),
                ("Wednesday", 4),
                ("Thursday", 5),
                ("Friday", 6),
                ("Saturday", 7)
            ]
        }

        private var isoDateFormatter: DateFormatter {
            let formatter = DateFormatter()
            formatter.calendar = Calendar(identifier: .gregorian)
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.timeZone = TimeZone(secondsFromGMT: 0)
            formatter.dateFormat = "yyyy-MM-dd"
            return formatter
        }

        private var currentWeekRange: (start: Date, end: Date) {
            let calendar = Calendar.current
            let now = Date()
            let start = calendar.date(from: calendar.dateComponents([.yearForWeekOfYear, .weekOfYear], from: now)) ?? calendar.startOfDay(for: now)
            let end = calendar.date(byAdding: .day, value: 6, to: start) ?? start
            return (start, end)
        }

        private var currentMonthRange: (start: Date, end: Date) {
            let calendar = Calendar.current
            let now = Date()
            let start = calendar.date(from: calendar.dateComponents([.year, .month], from: now)) ?? calendar.startOfDay(for: now)
            let days = calendar.range(of: .day, in: .month, for: start)?.count ?? 30
            let end = calendar.date(byAdding: .day, value: days - 1, to: start) ?? start
            return (start, end)
        }

        private var weeklyIncome: BudgetIncomeProjection {
            store.projectedIncome(from: currentWeekRange.start, to: currentWeekRange.end)
        }

        private var monthlyIncome: BudgetIncomeProjection {
            store.projectedIncome(from: currentMonthRange.start, to: currentMonthRange.end)
        }

        private var monthlySpend: Double {
            store.projectedRecurringExpenseTotal(from: currentMonthRange.start, to: currentMonthRange.end)
                + store.loggedExpenseTotal(from: currentMonthRange.start, to: currentMonthRange.end)
        }

        private var monthlyNet: Double {
            monthlyIncome.grossIncome - monthlySpend
        }

        private var paychecks: [BudgetPaycheckProjection] {
            store.projectedPaychecks(weeksAhead: 8)
        }

        private var cash30: BudgetCashFlowProjection {
            store.projectedCashFlow(days: 30)
        }

        private var cash90: BudgetCashFlowProjection {
            store.projectedCashFlow(days: 90)
        }

        private var variance: BudgetVarianceSnapshot {
            store.monthlyVariance()
        }

        private var overtime: BudgetOvertimeImpact {
            store.overtimeImpact(from: currentWeekRange.start, to: currentWeekRange.end)
        }

        private var categorySpendThisMonth: [(category: BudgetCategory, spent: Double)] {
            activeCategories.map { category in
                let spent = store.budgetExpenseRecords.reduce(0.0) { partial, record in
                    guard record.categoryID == category.id else { return partial }
                    guard record.date >= currentMonthRange.start && record.date <= currentMonthRange.end else { return partial }
                    return partial + record.amount
                }
                return (category, spent)
            }
            .sorted { $0.category.title.localizedCaseInsensitiveCompare($1.category.title) == .orderedAscending }
        }

        var body: some View {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    SectionHeader(title: "Budgeting", eyebrow: "Income and cash flow")

                    Grid(horizontalSpacing: 12, verticalSpacing: 12) {
                        GridRow {
                            MetricCard(
                                title: "Projected This Week",
                                value: currency(weeklyIncome.grossIncome),
                                detail: "\(weeklyIncome.occurrenceCount) job occurrences",
                                tint: .green
                            )
                            MetricCard(
                                title: "Projected This Month",
                                value: currency(monthlyIncome.grossIncome),
                                detail: "Net est. \(currency(monthlyIncome.grossIncome * (1 - store.budgetTaxRate)))",
                                tint: .blue
                            )
                        }

                        GridRow {
                            MetricCard(
                                title: "Planned Spend",
                                value: currency(monthlySpend),
                                detail: "Bills + logged expenses",
                                tint: .orange
                            )
                            MetricCard(
                                title: "Projected Net",
                                value: currency(monthlyNet),
                                detail: monthlyNet >= 0 ? "Above target" : "Needs adjustment",
                                tint: monthlyNet >= 0 ? .mint : .red
                            )
                        }
                    }

                    HStack(alignment: .top, spacing: 12) {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Log expense")
                                .font(.headline)

                            TextField("Title", text: $expenseTitle)
                            TextField("Amount", text: $expenseAmount)
                            DatePicker("Date", selection: $expenseDate, displayedComponents: .date)

                            Picker("Category", selection: $selectedCategoryID) {
                                Text("Select").tag(Optional<UUID>.none)
                                ForEach(activeCategories) { category in
                                    Text(category.title).tag(Optional(category.id))
                                }
                            }

                            Button("Add Expense") {
                                createExpense()
                            }
                            .buttonStyle(.borderedProminent)
                        }
                        .padding(16)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))

                        VStack(alignment: .leading, spacing: 10) {
                            Text("Add recurring bill")
                                .font(.headline)

                            TextField("Title", text: $billTitle)
                            TextField("Amount", text: $billAmount)

                            HStack {
                                Picker("Cadence", selection: $billCadence) {
                                    ForEach(BudgetBillCadence.allCases) { cadence in
                                        Text(cadence.label).tag(cadence)
                                    }
                                }
                                Stepper("Due day: \(billDay)", value: $billDay, in: 1...31)
                            }

                            Picker("Category", selection: $billCategoryID) {
                                Text("Select").tag(Optional<UUID>.none)
                                ForEach(activeCategories) { category in
                                    Text(category.title).tag(Optional(category.id))
                                }
                            }

                            Button("Add Bill") {
                                createBill()
                            }
                            .buttonStyle(.borderedProminent)
                        }
                        .padding(16)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    }

                    HStack(alignment: .top, spacing: 12) {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Payroll cadence by job")
                                .font(.headline)

                            if professionalJobBuckets.isEmpty {
                                Text("Create at least one professional bucket marked as a job with a pay rate to configure cadence.")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            } else {
                                ForEach(professionalJobBuckets) { bucket in
                                    let schedule = store.budgetPayrollSchedule(for: bucket.id)

                                    VStack(alignment: .leading, spacing: 8) {
                                        Text(bucket.name)
                                            .font(.subheadline.weight(.semibold))

                                        Picker("Cadence", selection: cadenceBinding(for: bucket.id)) {
                                            ForEach(BudgetPayrollCadence.allCases) { cadence in
                                                Text(cadence.label).tag(cadence)
                                            }
                                        }

                                        if schedule.cadence == .weekly || schedule.cadence == .biweekly {
                                            Picker("Pay weekday", selection: payWeekdayBinding(for: bucket.id)) {
                                                ForEach(payrollWeekdays, id: \.value) { weekday in
                                                    Text(weekday.label).tag(weekday.value)
                                                }
                                            }
                                        }

                                        if schedule.cadence == .biweekly {
                                            DatePicker(
                                                "Anchor pay date",
                                                selection: biweeklyAnchorDateBinding(for: bucket.id),
                                                displayedComponents: .date
                                            )
                                        }

                                        if schedule.cadence == .monthly || schedule.cadence == .customDayOfMonth {
                                            Stepper(
                                                "Pay day: \(schedule.dayOfMonth)",
                                                value: dayOfMonthBinding(for: bucket.id),
                                                in: 1...31
                                            )
                                        }

                                        if schedule.cadence == .semimonthly {
                                            Stepper(
                                                "First pay day: \(min(schedule.dayOfMonth, schedule.secondDayOfMonth ?? schedule.dayOfMonth))",
                                                value: dayOfMonthBinding(for: bucket.id),
                                                in: 1...31
                                            )
                                            Stepper(
                                                "Second pay day: \(max(schedule.dayOfMonth, schedule.secondDayOfMonth ?? schedule.dayOfMonth))",
                                                value: secondDayOfMonthBinding(for: bucket.id),
                                                in: 1...31
                                            )
                                        }
                                    }

                                    if bucket.id != professionalJobBuckets.last?.id {
                                        Divider()
                                    }
                                }
                            }
                        }
                        .padding(16)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))

                        VStack(alignment: .leading, spacing: 8) {
                            Text("Paycheck projection")
                                .font(.headline)
                            ForEach(paychecks.prefix(8)) { check in
                                HStack {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(check.bucketName)
                                            .font(.subheadline.weight(.semibold))
                                        Text("Pay date: \(check.payDate.formatted(date: .abbreviated, time: .omitted))")
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    VStack(alignment: .trailing, spacing: 2) {
                                        Text(currency(check.gross))
                                            .font(.subheadline.weight(.semibold))
                                        Text("Net: \(currency(check.net))")
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                }
                                .padding(.vertical, 4)
                            }
                        }
                        .padding(16)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))

                        VStack(alignment: .leading, spacing: 8) {
                            Text("Reporting")
                                .font(.headline)
                            Text("30-day cash flow: \(currency(cash30.net))")
                                .font(.subheadline.weight(.semibold))
                            Text("90-day cash flow: \(currency(cash90.net))")
                                .font(.subheadline.weight(.semibold))
                            Text("Income variance (actual vs projected): \(currency(variance.actualIncomeToDate - variance.projectedIncome))")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            Text("Spend variance (actual vs projected): \(currency(variance.actualSpendToDate - variance.projectedSpend))")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            Text("Overtime impact this week: \(currency(overtime.overtimeIncome))")
                                .font(.caption)
                                .foregroundStyle(.secondary)

                            Divider()

                            Text("Savings goal + tax")
                                .font(.subheadline.weight(.semibold))
                            HStack {
                                TextField("Monthly goal", text: $monthlyGoalInput)
                                TextField("Tax rate (0.22)", text: $taxRateInput)
                                Button("Save") {
                                    saveTargets()
                                }
                            }
                            Text("Current target: \(currency(store.budgetMonthlySavingsTarget))")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        .padding(16)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        Text("Category budget envelopes")
                            .font(.headline)
                        ForEach(categorySpendThisMonth, id: \.category.id) { entry in
                            HStack {
                                Text(entry.category.title)
                                Spacer()
                                Text("\(currency(entry.spent)) / \(currency(entry.category.monthlyLimit))")
                                    .foregroundStyle(entry.spent > entry.category.monthlyLimit ? .red : .secondary)
                            }
                            ProgressView(value: envelopeProgress(for: entry.spent, limit: entry.category.monthlyLimit))
                        }
                    }
                    .padding(16)
                    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))

                    FeatureListCard(
                        title: "Included in v1",
                        items: [
                            "Occurrence-based job income forecasting",
                            "Recurring bills and one-time expenses",
                            "Paycheck projections and net estimates",
                            "Cash-flow and variance reporting",
                            "Overtime impact and savings target tracking"
                        ]
                    )
                }
                .padding(24)
            }
            .onAppear {
                if selectedCategoryID == nil {
                    selectedCategoryID = activeCategories.first?.id
                }
                if billCategoryID == nil {
                    billCategoryID = activeCategories.first?.id
                }
                monthlyGoalInput = String(format: "%.0f", store.budgetMonthlySavingsTarget)
                taxRateInput = String(format: "%.2f", store.budgetTaxRate)
            }
        }

        private func createExpense() {
            guard let categoryID = selectedCategoryID else { return }
            guard let amount = Double(expenseAmount.trimmingCharacters(in: .whitespacesAndNewlines)) else { return }
            _ = store.createExpenseRecord(
                title: expenseTitle,
                amount: amount,
                categoryID: categoryID,
                date: expenseDate,
                notes: ""
            )
            expenseTitle = ""
            expenseAmount = ""
            expenseDate = Date()
        }

        private func createBill() {
            guard let categoryID = billCategoryID else { return }
            guard let amount = Double(billAmount.trimmingCharacters(in: .whitespacesAndNewlines)) else { return }
            _ = store.createRecurringBill(
                title: billTitle,
                amount: amount,
                categoryID: categoryID,
                cadence: billCadence,
                dueDay: billDay,
                notes: ""
            )
            billTitle = ""
            billAmount = ""
            billDay = 1
            billCadence = .monthly
        }

        private func saveTargets() {
            guard let monthly = Double(monthlyGoalInput.trimmingCharacters(in: .whitespacesAndNewlines)) else { return }
            guard let taxRate = Double(taxRateInput.trimmingCharacters(in: .whitespacesAndNewlines)) else { return }
            store.updateBudgetTargets(monthlySavingsTarget: monthly, taxRate: taxRate)
        }

        private func envelopeProgress(for spent: Double, limit: Double) -> Double {
            guard limit > 0 else { return 0 }
            return min(max(spent / limit, 0), 1)
        }

        private func cadenceBinding(for bucketID: UUID) -> Binding<BudgetPayrollCadence> {
            Binding(
                get: { store.budgetPayrollSchedule(for: bucketID).cadence },
                set: { newCadence in
                    var updated = store.budgetPayrollSchedule(for: bucketID)
                    updated.cadence = newCadence
                    store.setBudgetPayrollSchedule(for: bucketID, schedule: updated)
                }
            )
        }

        private func payWeekdayBinding(for bucketID: UUID) -> Binding<Int> {
            Binding(
                get: { store.budgetPayrollSchedule(for: bucketID).payWeekday },
                set: { newWeekday in
                    var updated = store.budgetPayrollSchedule(for: bucketID)
                    updated.payWeekday = newWeekday
                    store.setBudgetPayrollSchedule(for: bucketID, schedule: updated)
                }
            )
        }

        private func dayOfMonthBinding(for bucketID: UUID) -> Binding<Int> {
            Binding(
                get: { store.budgetPayrollSchedule(for: bucketID).dayOfMonth },
                set: { newDay in
                    var updated = store.budgetPayrollSchedule(for: bucketID)
                    updated.dayOfMonth = newDay
                    store.setBudgetPayrollSchedule(for: bucketID, schedule: updated)
                }
            )
        }

        private func secondDayOfMonthBinding(for bucketID: UUID) -> Binding<Int> {
            Binding(
                get: { store.budgetPayrollSchedule(for: bucketID).secondDayOfMonth ?? 15 },
                set: { newDay in
                    var updated = store.budgetPayrollSchedule(for: bucketID)
                    updated.secondDayOfMonth = newDay
                    store.setBudgetPayrollSchedule(for: bucketID, schedule: updated)
                }
            )
        }

        private func biweeklyAnchorDateBinding(for bucketID: UUID) -> Binding<Date> {
            Binding(
                get: {
                    let schedule = store.budgetPayrollSchedule(for: bucketID)
                    if let iso = schedule.anchorDateISO, let date = isoDateFormatter.date(from: iso) {
                        return date
                    }
                    return Date()
                },
                set: { newDate in
                    var updated = store.budgetPayrollSchedule(for: bucketID)
                    updated.anchorDateISO = isoDateFormatter.string(from: newDate)
                    store.setBudgetPayrollSchedule(for: bucketID, schedule: updated)
                }
            )
        }

        private func currency(_ amount: Double) -> String {
            amount.formatted(.currency(code: currencyCode))
        }
    }

    private enum DynamicMapSourceKind {
        case planningItem
        case bucketJobSite
    }

    private struct DynamicMapSource: Identifiable {
        let id: String
        let kind: DynamicMapSourceKind
        let title: String
        let subtitle: String
        let locationText: String
        let domain: BucketDomain
        let planningItemID: UUID?
        let bucketID: UUID?

        var tint: Color {
            switch domain {
            case .personal:
                return .mint
            case .household:
                return .orange
            case .professional:
                return .blue
            }
        }

        var symbolName: String {
            switch kind {
            case .planningItem:
                return "location"
            case .bucketJobSite:
                return "briefcase"
            }
        }
    }

    private struct DynamicMapPin: Identifiable {
        let source: DynamicMapSource
        let coordinate: CLLocationCoordinate2D

        var id: String { source.id }
    }

    @MainActor
    private final class DynamicMapResolver: ObservableObject {
        @Published private(set) var coordinatesBySourceID: [String: CLLocationCoordinate2D] = [:]
        @Published private(set) var isResolving = false

        private var cachedByQuery: [String: CLLocationCoordinate2D] = [:]

        func resolve(sources: [DynamicMapSource]) async {
            isResolving = true
            defer { isResolving = false }

            var next: [String: CLLocationCoordinate2D] = [:]
            for source in sources {
                let query = source.locationText.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !query.isEmpty else { continue }

                if let cached = cachedByQuery[query.lowercased()] {
                    next[source.id] = cached
                    continue
                }

                if let resolved = await resolveCoordinate(for: query) {
                    cachedByQuery[query.lowercased()] = resolved
                    next[source.id] = resolved
                }
            }

            coordinatesBySourceID = next
        }

        private func resolveCoordinate(for query: String) async -> CLLocationCoordinate2D? {
            let request = MKLocalSearch.Request()
            request.naturalLanguageQuery = query

            do {
                let response = try await MKLocalSearch(request: request).start()
                return response.mapItems.first?.location.coordinate
            } catch {
                return nil
            }
        }
    }

    @MainActor
    private final class DynamicMapLocationProvider: NSObject, ObservableObject, CLLocationManagerDelegate {
        @Published private(set) var authorizationStatus: CLAuthorizationStatus
        @Published private(set) var currentLocation: CLLocation?

        private let manager = CLLocationManager()

        override init() {
            authorizationStatus = manager.authorizationStatus
            super.init()
            manager.delegate = self
            manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        }

        func requestPermissionIfNeeded() {
            authorizationStatus = manager.authorizationStatus
            if authorizationStatus == .notDetermined {
                manager.requestWhenInUseAuthorization()
            }
            if authorizationStatus == .authorizedAlways {
                manager.startUpdatingLocation()
            }
        }

        func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
            authorizationStatus = manager.authorizationStatus
            if authorizationStatus == .authorizedAlways {
                manager.startUpdatingLocation()
            }
        }

        func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
            currentLocation = locations.last
        }
    }

    struct DynamicMapAppView: View {
        @EnvironmentObject private var store: PlannerStore

        @StateObject private var resolver = DynamicMapResolver()
        @StateObject private var locationProvider = DynamicMapLocationProvider()

        @State private var region = MKCoordinateRegion(
            center: CLLocationCoordinate2D(latitude: 39.8283, longitude: -98.5795),
            span: MKCoordinateSpan(latitudeDelta: 25.0, longitudeDelta: 25.0)
        )
        @State private var selectedSourceID: String?
        @State private var selectedStopIDs: [String] = []
        @State private var directionsOriginID: String?
        @State private var directionsDestinationID: String?
        @State private var waypointIDs: [String] = []
        @State private var selectedSavedRouteID: UUID?
        @State private var routeSummary = "Select two or more stops to estimate a route."
        @State private var routeAlternatives: [String] = []
        @State private var isEstimatingRoute = false
        @State private var sourceFilter: Set<DynamicMapSourceKind> = [.planningItem, .bucketJobSite]
        @State private var isPresentingAddFavorite = false
        @State private var newFavoriteTitle = ""
        @State private var newFavoriteLocation = ""

        private var favoriteLocations: [DynamicMapFavoriteLocation] {
            store.dynamicMapFavorites.sorted { lhs, rhs in
                lhs.title.localizedCaseInsensitiveCompare(rhs.title) == .orderedAscending
            }
        }

        private var savedRoutes: [DynamicMapSavedRoute] {
            store.dynamicMapSavedRoutes.sorted { lhs, rhs in
                lhs.updatedAt > rhs.updatedAt
            }
        }

        private var currentRouteSourceIDs: [String] {
            if hasDirectionsPair, let originID = directionsOriginID, let destinationID = directionsDestinationID {
                return [originID] + waypointIDs + [destinationID]
            }
            return selectedStopIDs
        }

        private var canSaveCurrentRoute: Bool {
            currentRouteSourceIDs.count >= 2
        }

        private var routeLegLabels: [String] {
            let ids = currentRouteSourceIDs
            guard ids.count >= 2 else { return [] }
            let titles = ids.compactMap { sourceID in
                selectableSource(for: sourceID)?.title
            }
            guard titles.count >= 2 else { return [] }
            return zip(titles, titles.dropFirst()).enumerated().map { idx, pair in
                "Leg \(idx + 1): \(pair.0) -> \(pair.1)"
            }
        }

        private var allSources: [DynamicMapSource] {
            var sources: [DynamicMapSource] = []

            sources.append(
                contentsOf: store.items.compactMap { item in
                    let location = item.location.trimmingCharacters(in: .whitespacesAndNewlines)
                    guard !location.isEmpty else { return nil }
                    return DynamicMapSource(
                        id: "item-\(item.id.uuidString)",
                        kind: .planningItem,
                        title: item.title,
                        subtitle: "\(item.kind.rawValue.capitalized) • \(item.domain.title)",
                        locationText: location,
                        domain: item.domain,
                        planningItemID: item.id,
                        bucketID: item.bucketID
                    )
                }
            )

            sources.append(
                contentsOf: store.buckets.compactMap { bucket in
                    let location = bucket.jobSite.trimmingCharacters(in: .whitespacesAndNewlines)
                    guard bucket.domain == .professional, bucket.isJob, !location.isEmpty else { return nil }
                    return DynamicMapSource(
                        id: "bucket-\(bucket.id.uuidString)",
                        kind: .bucketJobSite,
                        title: bucket.name,
                        subtitle: "Job site • \(bucket.domain.title)",
                        locationText: location,
                        domain: bucket.domain,
                        planningItemID: nil,
                        bucketID: bucket.id
                    )
                }
            )

            let allowedKinds = sourceFilter
            return sources
                .filter { allowedKinds.contains($0.kind) }
                .sorted { lhs, rhs in
                    lhs.title.localizedCaseInsensitiveCompare(rhs.title) == .orderedAscending
                }
        }

        private var resolvedPins: [DynamicMapPin] {
            allSources.compactMap { source in
                guard let coordinate = resolver.coordinatesBySourceID[source.id] else { return nil }
                return DynamicMapPin(source: source, coordinate: coordinate)
            }
        }

        private var selectedSource: DynamicMapSource? {
            guard let selectedSourceID else { return nil }
            return allSources.first(where: { $0.id == selectedSourceID })
        }

        private var directionsOrigin: DynamicMapSource? {
            guard let directionsOriginID else { return nil }
            return selectableSource(for: directionsOriginID)
        }

        private var directionsDestination: DynamicMapSource? {
            guard let directionsDestinationID else { return nil }
            return selectableSource(for: directionsDestinationID)
        }

        private var hasDirectionsPair: Bool {
            guard let directionsOriginID, let directionsDestinationID else { return false }
            return directionsOriginID != directionsDestinationID
        }

        private var favoriteSources: [DynamicMapSource] {
            favoriteLocations.map { favorite in
                DynamicMapSource(
                    id: "favorite-\(favorite.id.uuidString)",
                    kind: .planningItem,
                    title: favorite.title,
                    subtitle: favorite.subtitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Favorite location" : favorite.subtitle,
                    locationText: favorite.locationText,
                    domain: .personal,
                    planningItemID: nil,
                    bucketID: nil
                )
            }
        }

        private var routePickerSavedSources: [DynamicMapSource] {
            allSources
        }

        private var routePickerFavoriteSources: [DynamicMapSource] {
            favoriteSources
        }

        var body: some View {
            VStack(alignment: .leading, spacing: AppSpacing.standard.rawValue) {
                header
                controls

                HSplitView {
                    sourceList
                        .frame(minWidth: 320, idealWidth: 360)

                    mapPane
                }
                .frame(minHeight: 360, idealHeight: 440)

                routePanel
            }
            .padding(AppSpacing.spacious.rawValue)
            .frame(minWidth: 980, minHeight: 620, alignment: .topLeading)
            .background(
                LinearGradient(
                    colors: [
                        Color(nsColor: .windowBackgroundColor),
                        CompanionAppID.dynamicMap.accentStart.opacity(0.07)
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .task(id: allSources.map { $0.id }.joined(separator: "|")) {
                await resolver.resolve(sources: allSources)
                fitMapToResolvedPins()
            }
            .onAppear {
                locationProvider.requestPermissionIfNeeded()
                _ = consumePendingSavedRouteSelectionIfAvailable()
            }
            .onChange(of: store.pendingDynamicMapRouteID) { _, _ in
                _ = consumePendingSavedRouteSelectionIfAvailable()
            }
            .sheet(isPresented: $isPresentingAddFavorite) {
                addFavoriteSheet
            }
        }

        private var header: some View {
            HStack(alignment: .center, spacing: AppSpacing.small.rawValue) {
                ZStack {
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .fill(
                            LinearGradient(
                                colors: [CompanionAppID.dynamicMap.accentStart.opacity(0.90), CompanionAppID.dynamicMap.accentEnd.opacity(0.74)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                    Image(systemName: CompanionAppID.dynamicMap.symbolName)
                        .font(.title2.weight(.semibold))
                        .foregroundStyle(.white)
                }
                .frame(width: 56, height: 56)

                VStack(alignment: .leading, spacing: 4) {
                    Text(CompanionAppID.dynamicMap.title)
                        .appTitle()
                    Text("Sync locations from items and buckets, then estimate traffic-aware routes.")
                        .appDescription()
                }

                Spacer()

                AppStatusBadge(status: CompanionAppID.dynamicMap.status)
            }
        }

        private var controls: some View {
            HStack(spacing: AppSpacing.compact.rawValue) {
                Toggle(
                    "Planning items",
                    isOn: $sourceFilter.bind(for: .planningItem)
                )
                .toggleStyle(.checkbox)

                Toggle(
                    "Bucket job sites",
                    isOn: $sourceFilter.bind(for: .bucketJobSite)
                )
                .toggleStyle(.checkbox)

                Spacer()

                if resolver.isResolving {
                    ProgressView("Resolving locations")
                        .controlSize(.small)
                }

                Button {
                    fitMapToResolvedPins()
                } label: {
                    Label("Center Map", systemImage: "scope")
                }
                .appButton(.bordered)

                Button {
                    newFavoriteTitle = ""
                    newFavoriteLocation = ""
                    isPresentingAddFavorite = true
                } label: {
                    Label("Add Favorite", systemImage: "mappin.and.ellipse")
                }
                .appButton(.bordered)
            }
            .padding(AppSpacing.standard.rawValue)
            .cardStyleWithMaterial(color: .primary)
        }

        private var sourceList: some View {
            ScrollView(.vertical) {
                VStack(alignment: .leading, spacing: AppSpacing.compact.rawValue) {
                    Text("Saved locations")
                        .appSubtitle()

                    if allSources.isEmpty {
                        Text("No saved locations yet")
                            .appCaption()
                    } else {
                        ForEach(allSources) { source in
                            HStack(alignment: .top, spacing: AppSpacing.compact.rawValue) {
                                Circle()
                                    .fill(source.tint.opacity(0.24))
                                    .frame(width: 10, height: 10)
                                    .padding(.top, 6)

                                VStack(alignment: .leading, spacing: 3) {
                                    Text(source.title)
                                        .appSubtitle()
                                    Text(source.subtitle)
                                        .appCaption()
                                    Text(source.locationText)
                                        .appCaption()
                                        .lineLimit(2)
                                }

                                Spacer()

                                Menu {
                                    Button {
                                        setDirectionsOrigin(source.id)
                                    } label: {
                                        Label("Directions from here", systemImage: "arrow.turn.up.right")
                                    }

                                    Button {
                                        setDirectionsDestination(source.id)
                                    } label: {
                                        Label("Directions to here", systemImage: "arrow.turn.down.left")
                                    }

                                    Divider()

                                    Button {
                                        toggleStop(source.id)
                                    } label: {
                                        Label(
                                            selectedStopIDs.contains(source.id) ? "Remove stop from route" : "Add stop to route",
                                            systemImage: selectedStopIDs.contains(source.id) ? "minus.circle" : "plus.circle"
                                        )
                                    }

                                    Divider()

                                    Button {
                                        _ = saveFavorite(source)
                                    } label: {
                                        Label("Save Favorite", systemImage: "star")
                                    }
                                }
                                label: {
                                    Image(systemName: selectedStopIDs.contains(source.id) ? "checkmark.circle.fill" : "plus.circle")
                                }
                            }
                            .contentShape(Rectangle())
                            .onTapGesture {
                                selectedSourceID = source.id
                            }
                            .padding(.vertical, 2)
                        }
                    }

                    Text("Stops in route: \(selectedStopIDs.count)")
                        .appCaption()

                    Divider()
                    Text("Favorite locations")
                        .appSubtitle()

                    if favoriteLocations.isEmpty {
                        Text("No favorites yet")
                            .appCaption()
                    } else {
                        ForEach(Array(favoriteLocations.enumerated()), id: \.element.id) { _, favorite in
                            HStack(alignment: .top, spacing: AppSpacing.compact.rawValue) {
                                Circle()
                                    .fill(Color.yellow.opacity(0.30))
                                    .frame(width: 10, height: 10)
                                    .padding(.top, 6)

                                VStack(alignment: .leading, spacing: 3) {
                                    Text(favorite.title)
                                        .appSubtitle()
                                    if !favorite.subtitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                                        Text(favorite.subtitle)
                                            .appCaption()
                                    }
                                    Text(favorite.locationText)
                                        .appCaption()
                                        .lineLimit(2)
                                }

                                Spacer()

                                Menu {
                                    Button {
                                        setDirectionsOrigin("favorite-\(favorite.id.uuidString)")
                                    } label: {
                                        Label("Directions from here", systemImage: "arrow.turn.up.right")
                                    }

                                    Button {
                                        setDirectionsDestination("favorite-\(favorite.id.uuidString)")
                                    } label: {
                                        Label("Directions to here", systemImage: "arrow.turn.down.left")
                                    }

                                    Button {
                                        let favID = "favorite-\(favorite.id.uuidString)"
                                        if !waypointIDs.contains(favID) {
                                            waypointIDs.append(favID)
                                        }
                                    } label: {
                                        Label("Add to Route", systemImage: "arrow.triangle.turn.up.right.circle")
                                    }

                                    Divider()

                                    Button(role: .destructive) {
                                        store.deleteDynamicMapFavorite(favoriteID: favorite.id)
                                    } label: {
                                        Label("Remove Favorite", systemImage: "trash")
                                    }
                                } label: {
                                    Image(systemName: "ellipsis.circle")
                                }
                            }
                            .padding(.vertical, 2)
                        }
                    }

                    Divider()
                    Text("Saved routes")
                        .appSubtitle()

                    if savedRoutes.isEmpty {
                        Text("No saved routes yet")
                            .appCaption()
                    } else {
                        ForEach(savedRoutes) { route in
                            HStack(alignment: .top, spacing: AppSpacing.compact.rawValue) {
                                Circle()
                                    .fill(Color.indigo.opacity(0.26))
                                    .frame(width: 10, height: 10)
                                    .padding(.top, 6)

                                Button {
                                    loadSavedRoute(route)
                                } label: {
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text(route.title)
                                            .appSubtitle()
                                            .lineLimit(1)
                                        Text("\(route.orderedSourceIDs.count) stops")
                                            .appCaption()
                                        if !route.lastSummary.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                                            Text(route.lastSummary)
                                                .appCaption()
                                                .lineLimit(2)
                                        }
                                    }
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                }
                                .appButton(.plain)

                                Button {
                                    store.deleteDynamicMapSavedRoute(routeID: route.id)
                                    if selectedSavedRouteID == route.id {
                                        selectedSavedRouteID = nil
                                    }
                                } label: {
                                    Image(systemName: "trash")
                                }
                                .appButton(.plain)
                            }
                            .padding(.vertical, 2)
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(AppSpacing.standard.rawValue)
            .cardStyleWithMaterial(color: .primary)
        }

        private var mapPane: some View {
            VStack(alignment: .leading, spacing: AppSpacing.compact.rawValue) {
                if locationProvider.authorizationStatus == .denied || locationProvider.authorizationStatus == .restricted {
                    Text("Location access is off. Enable it to use your current position as route origin.")
                        .appCaption()
                }

                Map(coordinateRegion: $region, annotationItems: resolvedPins) { pin in
                    MapMarker(coordinate: pin.coordinate, tint: pin.source.tint)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .stroke(Color.primary.opacity(0.12), lineWidth: 1)
                )

                if let selectedSource {
                    HStack(spacing: AppSpacing.xCompact.rawValue) {
                        Text("Selected:")
                            .appCaptionBold()
                        Text(selectedSource.title)
                            .appCaption()
                        Spacer()
                    }
                }
            }
            .padding(AppSpacing.standard.rawValue)
            .cardStyleWithMaterial(color: .primary)
        }

        private var routePanel: some View {
            VStack(alignment: .leading, spacing: AppSpacing.compact.rawValue) {
                HStack(spacing: AppSpacing.compact.rawValue) {
                    routeEndpointChip(
                        prefix: "From",
                        selectedID: directionsOriginID,
                        source: directionsOrigin,
                        placeholder: "Choose origin",
                        onSelect: setDirectionsOrigin
                    )

                    if directionsOriginID != nil && directionsDestinationID != nil && !waypointIDs.isEmpty {
                        ForEach(waypointIDs, id: \.self) { waypointID in
                            HStack(spacing: AppSpacing.xCompact.rawValue) {
                                Image(systemName: "arrow.right")
                                    .foregroundStyle(.secondary)
                                routeWaypointChip(sourceID: waypointID)
                            }
                        }
                    }

                    Image(systemName: "arrow.right")
                        .foregroundStyle(.secondary)

                    routeEndpointChip(
                        prefix: "To",
                        selectedID: directionsDestinationID,
                        source: directionsDestination,
                        placeholder: "Choose destination",
                        onSelect: setDirectionsDestination
                    )

                    Spacer()

                    Button {
                        swapDirections()
                    } label: {
                        Label("Swap", systemImage: "arrow.left.arrow.right")
                    }
                    .appButton(.bordered)
                    .disabled(!hasDirectionsPair)

                    Button {
                        clearDirectionsPair()
                    } label: {
                        Label("Clear", systemImage: "xmark.circle")
                    }
                    .appButton(.bordered)
                }

                HStack(spacing: AppSpacing.compact.rawValue) {
                    Button {
                        Task { await handleGetDirectionsTapped() }
                    } label: {
                        Label(hasDirectionsPair ? "Get Directions" : "Estimate Route", systemImage: "car")
                    }
                    .appButton(.bordered_prominent)
                    .disabled((hasDirectionsPair == false && selectedStopIDs.count < 2) || isEstimatingRoute)

                    if hasDirectionsPair {
                        Text("Ordered directions use the explicit From/To pair.")
                            .appCaption()
                    }

                    Button {
                        _ = saveCurrentRoute()
                    } label: {
                        Label("Save Route", systemImage: "square.and.arrow.down")
                    }
                    .appButton(.bordered)
                    .disabled(!canSaveCurrentRoute)
                }

                Text(routeSummary)
                    .appBody()

                if !routeLegLabels.isEmpty {
                    ForEach(routeLegLabels, id: \.self) { line in
                        Text(line)
                            .appCaption()
                    }
                }

                if !routeAlternatives.isEmpty {
                    ForEach(routeAlternatives, id: \.self) { line in
                        Text(line)
                            .appCaption()
                    }
                }
            }
            .padding(AppSpacing.standard.rawValue)
            .cardStyleWithMaterial(color: .primary)
        }

        private func routeEndpointChip(
            prefix: String,
            selectedID: String?,
            source: DynamicMapSource?,
            placeholder: String,
            onSelect: @escaping (String) -> Void
        ) -> some View {
            Menu {
                Section("Saved locations") {
                    if routePickerSavedSources.isEmpty {
                        Text("No saved locations")
                    } else {
                        ForEach(routePickerSavedSources) { candidate in
                            Button {
                                onSelect(candidate.id)
                            } label: {
                                Label(candidate.title, systemImage: selectedID == candidate.id ? "checkmark.circle.fill" : "location")
                            }
                        }
                    }
                }

                Section("Favorite locations") {
                    if routePickerFavoriteSources.isEmpty {
                        Text("No favorites")
                    } else {
                        ForEach(routePickerFavoriteSources) { candidate in
                            Button {
                                onSelect(candidate.id)
                            } label: {
                                Label(candidate.title, systemImage: selectedID == candidate.id ? "checkmark.circle.fill" : "star")
                            }
                        }
                    }
                }
            } label: {
                HStack(spacing: AppSpacing.xCompact.rawValue) {
                    Text(prefix)
                        .appCaptionBold()
                    if let source {
                        Image(systemName: source.symbolName)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(source.tint)
                        Text(source.title)
                            .appCaption()
                            .lineLimit(1)
                    } else {
                        Text(placeholder)
                            .appCaption()
                    }
                    Image(systemName: "chevron.down")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                .padding(.horizontal, AppSpacing.compact.rawValue)
                .padding(.vertical, AppSpacing.xCompact.rawValue)
                .frame(minHeight: 34)
                .background(
                    RoundedRectangle(cornerRadius: 999, style: .continuous)
                        .fill(source.map { $0.tint.opacity(0.12) } ?? Color.secondary.opacity(0.10))
                )
            }
            .menuIndicator(.hidden)
        }

        @ViewBuilder
        private func routeWaypointChip(sourceID: String) -> some View {
            HStack(spacing: AppSpacing.xCompact.rawValue) {
                Image(systemName: "mappin.circle")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.blue)
                Text(selectableSource(for: sourceID)?.title ?? "Waypoint")
                    .appCaption()
                    .lineLimit(1)
                Button {
                    waypointIDs.removeAll { $0 == sourceID }
                } label: {
                    Image(systemName: "xmark")
                        .font(.caption2.weight(.bold))
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
            }
            .padding(.horizontal, AppSpacing.compact.rawValue)
            .padding(.vertical, AppSpacing.xCompact.rawValue)
            .frame(minHeight: 34)
            .background(
                RoundedRectangle(cornerRadius: 999, style: .continuous)
                    .fill(Color.blue.opacity(0.12))
            )
        }

        private var addFavoriteSheet: some View {
            VStack(alignment: .leading, spacing: AppSpacing.standard.rawValue) {
                Text("Add Favorite Location")
                    .appTitle()

                TextField("Title (for example: Home)", text: $newFavoriteTitle)
                TextField("Location", text: $newFavoriteLocation)

                HStack {
                    Spacer()
                    Button("Cancel") {
                        isPresentingAddFavorite = false
                    }
                    .appButton(.bordered)

                    Button("Add Favorite") {
                        Task { await addFavoriteFromForm() }
                    }
                    .appButton(.bordered_prominent)
                    .disabled(newFavoriteTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || newFavoriteLocation.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .padding(AppSpacing.spacious.rawValue)
            .frame(width: 420)
        }

        private func toggleStop(_ sourceID: String) {
            if let idx = selectedStopIDs.firstIndex(of: sourceID) {
                selectedStopIDs.remove(at: idx)
            } else {
                selectedStopIDs.append(sourceID)
            }
        }

        private func setDirectionsOrigin(_ sourceID: String) {
            directionsOriginID = sourceID
            if directionsDestinationID == sourceID {
                directionsDestinationID = nil
            }
            routeSummary = directionsDestinationID == nil
                ? "Origin selected. Choose a destination to get directions."
                : routeSummary
            routeAlternatives = []
            if hasDirectionsPair {
                Task { await estimateRoute() }
            }
        }

        private func setDirectionsDestination(_ sourceID: String) {
            directionsDestinationID = sourceID
            if directionsOriginID == sourceID {
                directionsOriginID = nil
            }
            routeSummary = directionsOriginID == nil
                ? "Destination selected. Choose an origin to get directions."
                : routeSummary
            routeAlternatives = []
            if hasDirectionsPair {
                Task { await estimateRoute() }
            }
        }

        private func clearDirectionsPair() {
            directionsOriginID = nil
            directionsDestinationID = nil
            waypointIDs = []
            selectedSavedRouteID = nil
            routeSummary = "Choose an origin and destination from the saved locations list."
            routeAlternatives = []
        }

        private func swapDirections() {
            guard let originID = directionsOriginID, let destinationID = directionsDestinationID else { return }
            guard originID != destinationID else { return }
            directionsOriginID = destinationID
            directionsDestinationID = originID
        }

        private func handleGetDirectionsTapped() async {
            if hasDirectionsPair {
                await openDirectionsInAppleMaps()
                return
            }
            await estimateRoute()
        }

        private func fitMapToResolvedPins() {
            let pins = resolvedPins
            guard !pins.isEmpty else { return }

            let lats = pins.map { $0.coordinate.latitude }
            let lons = pins.map { $0.coordinate.longitude }

            guard
                let minLat = lats.min(),
                let maxLat = lats.max(),
                let minLon = lons.min(),
                let maxLon = lons.max()
            else { return }

            let center = CLLocationCoordinate2D(latitude: (minLat + maxLat) / 2.0, longitude: (minLon + maxLon) / 2.0)
            let span = MKCoordinateSpan(
                latitudeDelta: max((maxLat - minLat) * 1.45, 0.08),
                longitudeDelta: max((maxLon - minLon) * 1.45, 0.08)
            )
            region = MKCoordinateRegion(center: center, span: span)
        }

        @discardableResult
        private func saveFavorite(_ source: DynamicMapSource) -> UUID? {
            let coordinate = resolver.coordinatesBySourceID[source.id]
            let favoriteID = store.createDynamicMapFavorite(
                sourceID: source.id,
                title: source.title,
                subtitle: source.subtitle,
                locationText: source.locationText,
                latitude: coordinate?.latitude,
                longitude: coordinate?.longitude
            )
            if favoriteID != nil {
                routeSummary = "Saved favorite location: \(source.title)."
            }
            return favoriteID
        }

        @discardableResult
        private func saveCurrentRoute() -> UUID? {
            let ids = currentRouteSourceIDs
            guard ids.count >= 2 else { return nil }

            let titles = ids.compactMap { sourceID in
                selectableSource(for: sourceID)?.title
            }
            let defaultTitle: String
            if let first = titles.first, let last = titles.last, titles.count >= 2 {
                defaultTitle = "\(first) -> \(last)"
            } else {
                defaultTitle = "Saved Route"
            }

            let routeID = store.createDynamicMapSavedRoute(
                title: defaultTitle,
                orderedSourceIDs: ids,
                lastSummary: routeSummary
            )
            if let routeID {
                selectedSavedRouteID = routeID
                routeSummary = "Saved route: \(defaultTitle)."
            }
            return routeID
        }

        private func loadSavedRoute(_ route: DynamicMapSavedRoute) {
            let resolvedIDs = route.orderedSourceIDs.filter { sourceID in
                selectableSource(for: sourceID) != nil
            }
            guard resolvedIDs.count >= 2 else {
                routeSummary = "Saved route has fewer than two available locations with current filters."
                return
            }

            selectedSavedRouteID = route.id
            selectedStopIDs = resolvedIDs

            if resolvedIDs.count == 2 {
                directionsOriginID = resolvedIDs[0]
                directionsDestinationID = resolvedIDs[1]
            } else {
                directionsOriginID = nil
                directionsDestinationID = nil
            }

            Task { await estimateRoute() }
        }

        private func consumePendingSavedRouteSelectionIfAvailable() -> Bool {
            guard let pendingID = store.consumePendingDynamicMapRouteSelection() else { return false }
            guard let route = store.dynamicMapSavedRoute(for: pendingID) else { return false }
            loadSavedRoute(route)
            return true
        }

        private func openDirectionsInAppleMaps() async {
            guard
                let originSource = directionsOrigin,
                let destinationSource = directionsDestination,
                originSource.id != destinationSource.id
            else {
                routeSummary = "Choose an origin and destination before opening Apple Maps."
                return
            }

            guard
                let originMapItem = await mapItem(for: originSource),
                let destinationMapItem = await mapItem(for: destinationSource)
            else {
                routeSummary = "Could not resolve one of the selected locations for Apple Maps."
                return
            }

            await MKMapItem.openMaps(
                with: [originMapItem, destinationMapItem],
                launchOptions: [MKLaunchOptionsDirectionsModeKey: MKLaunchOptionsDirectionsModeDriving]
            )
            routeSummary = "Opened Apple Maps driving directions from \(originSource.title) to \(destinationSource.title)."
        }

        private func mapItem(for source: DynamicMapSource) async -> MKMapItem? {
            if let coordinate = await coordinate(for: source) {
                let item = MKMapItem(placemark: MKPlacemark(coordinate: coordinate))
                item.name = source.title
                return item
            }

            let query = source.locationText.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !query.isEmpty else { return nil }

            let request = MKLocalSearch.Request()
            request.naturalLanguageQuery = query

            do {
                let response = try await MKLocalSearch(request: request).start()
                let item = response.mapItems.first
                item?.name = source.title
                return item
            } catch {
                return nil
            }
        }

        private func estimateRoute() async {
            isEstimatingRoute = true
            defer { isEstimatingRoute = false }

            if hasDirectionsPair {
                guard
                    let originID = directionsOriginID,
                    let destinationID = directionsDestinationID,
                    originID != destinationID,
                    let originSource = directionsOrigin,
                    let destinationSource = directionsDestination
                else {
                    routeSummary = "Choose two different saved locations with resolvable addresses."
                    routeAlternatives = []
                    return
                }

                guard
                    let origin = await coordinate(for: originSource),
                    let destination = await coordinate(for: destinationSource)
                else {
                    routeSummary = "Choose two different saved locations with resolvable addresses."
                    routeAlternatives = []
                    return
                }

                // Build full coordinate list: origin → waypoints → destination
                var allCoordinates: [CLLocationCoordinate2D] = [origin]
                for waypointID in waypointIDs {
                    if let waypointSource = selectableSource(for: waypointID),
                       let waypointCoord = await coordinate(for: waypointSource) {
                        allCoordinates.append(waypointCoord)
                    }
                }
                allCoordinates.append(destination)

                if allCoordinates.count == 2 {
                    // Simple A→B with no waypoints
                    let request = MKDirections.Request()
                    request.transportType = .automobile
                    request.source = MKMapItem(placemark: MKPlacemark(coordinate: origin))
                    request.destination = MKMapItem(placemark: MKPlacemark(coordinate: destination))
                    request.requestsAlternateRoutes = true

                    do {
                        let etaResponse = try await MKDirections(request: request).calculateETA()
                        let minutes = Int(etaResponse.expectedTravelTime / 60)
                        let miles = etaResponse.distance / 1609.34

                        var alternatives: [String] = []
                        do {
                            let response = try await MKDirections(request: request).calculate()
                            alternatives = response.routes.prefix(3).enumerated().map { idx, route in
                                let optionMinutes = Int(route.expectedTravelTime / 60)
                                let optionMiles = route.distance / 1609.34
                                return "Option \(idx + 1): \(optionMinutes)m • \(String(format: "%.1f", optionMiles)) mi"
                            }
                        } catch {
                            alternatives = []
                        }

                        routeSummary = "From \(originSource.title) to \(destinationSource.title): Estimated drive \(minutes) min across \(String(format: "%.1f", miles)) miles."
                        routeAlternatives = alternatives
                    } catch {
                        routeSummary = "Route estimate failed for the selected directions pair."
                        routeAlternatives = []
                    }
                } else {
                    // Multi-stop: chain legs through waypoints
                    var totalDistanceMeters: CLLocationDistance = 0
                    var totalTravelSeconds: TimeInterval = 0
                    var alternatives: [String] = []

                    for i in 0..<(allCoordinates.count - 1) {
                        let legFrom = allCoordinates[i]
                        let legTo = allCoordinates[i + 1]
                        let request = MKDirections.Request()
                        request.transportType = .automobile
                        request.source = MKMapItem(placemark: MKPlacemark(coordinate: legFrom))
                        request.destination = MKMapItem(placemark: MKPlacemark(coordinate: legTo))
                        request.requestsAlternateRoutes = true

                        do {
                            let etaResponse = try await MKDirections(request: request).calculateETA()
                            totalTravelSeconds += etaResponse.expectedTravelTime
                            totalDistanceMeters += etaResponse.distance
                        } catch {
                            routeSummary = "Route estimate failed for one of the legs."
                            routeAlternatives = []
                            return
                        }

                        if alternatives.isEmpty {
                            do {
                                let response = try await MKDirections(request: request).calculate()
                                alternatives = response.routes.prefix(3).enumerated().map { idx, route in
                                    let minutes = Int(route.expectedTravelTime / 60)
                                    let miles = route.distance / 1609.34
                                    return "Option \(idx + 1): \(minutes)m • \(String(format: "%.1f", miles)) mi"
                                }
                            } catch {
                                alternatives = []
                            }
                        }
                    }

                    let totalMinutes = Int(totalTravelSeconds / 60)
                    let totalMiles = totalDistanceMeters / 1609.34
                    routeSummary = "From \(originSource.title) to \(destinationSource.title) via \(waypointIDs.count) waypoint(s): Estimated drive \(totalMinutes) min across \(String(format: "%.1f", totalMiles)) miles."
                    routeAlternatives = alternatives
                }

                return
            }

            guard selectedStopIDs.count >= 2 else {
                routeSummary = "Select two or more stops to estimate a route."
                routeAlternatives = []
                return
            }

            let points = selectedStopIDs.compactMap { sourceID -> CLLocationCoordinate2D? in
                resolver.coordinatesBySourceID[sourceID]
            }

            guard points.count >= 2 else {
                routeSummary = "Some selected stops are unresolved. Try refining location names first."
                routeAlternatives = []
                return
            }

            var totalDistanceMeters: CLLocationDistance = 0
            var totalTravelSeconds: TimeInterval = 0
            var alternatives: [String] = []

            var legs = points
            var origin = locationProvider.currentLocation?.coordinate
            if origin == nil {
                origin = legs.removeFirst()
            }

            guard let startCoordinate = origin else {
                routeSummary = "Route origin unavailable. Enable location access or include more stops."
                routeAlternatives = []
                return
            }

            var previous = startCoordinate
            for point in legs {
                let request = MKDirections.Request()
                request.transportType = .automobile
                request.source = MKMapItem(placemark: MKPlacemark(coordinate: previous))
                request.destination = MKMapItem(placemark: MKPlacemark(coordinate: point))
                request.requestsAlternateRoutes = true

                do {
                    let etaResponse = try await MKDirections(request: request).calculateETA()
                    totalTravelSeconds += etaResponse.expectedTravelTime
                    totalDistanceMeters += etaResponse.distance
                } catch {
                    routeSummary = "Route estimate failed for one of the legs."
                    routeAlternatives = []
                    return
                }

                if alternatives.isEmpty {
                    do {
                        let response = try await MKDirections(request: request).calculate()
                        alternatives = response.routes.prefix(3).enumerated().map { idx, route in
                            let minutes = Int(route.expectedTravelTime / 60)
                            let miles = route.distance / 1609.34
                            return "Option \(idx + 1): \(minutes)m • \(String(format: "%.1f", miles)) mi"
                        }
                    } catch {
                        alternatives = []
                    }
                }

                previous = point
            }

            let totalMinutes = Int(totalTravelSeconds / 60)
            let totalMiles = totalDistanceMeters / 1609.34
            let prefix = locationProvider.currentLocation == nil ? "Origin: first selected stop." : "Origin: current location."
            routeSummary = "\(prefix) Estimated drive: \(totalMinutes) min across \(String(format: "%.1f", totalMiles)) miles."
            routeAlternatives = alternatives
        }

        private func addFavoriteFromForm() async {
            let cleanTitle = newFavoriteTitle.trimmingCharacters(in: .whitespacesAndNewlines)
            let cleanLocation = newFavoriteLocation.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !cleanTitle.isEmpty, !cleanLocation.isEmpty else { return }

            let coordinate = await geocodeCoordinate(for: cleanLocation)
            let sourceID = "manual-\(UUID().uuidString)"
            let favoriteID = store.createDynamicMapFavorite(
                sourceID: sourceID,
                title: cleanTitle,
                subtitle: "",
                locationText: cleanLocation,
                latitude: coordinate?.latitude,
                longitude: coordinate?.longitude
            )

            guard favoriteID != nil else { return }
            newFavoriteTitle = ""
            newFavoriteLocation = ""
            isPresentingAddFavorite = false
            routeSummary = "Saved favorite location: \(cleanTitle)."
        }

        private func selectableSource(for sourceID: String) -> DynamicMapSource? {
            if let source = allSources.first(where: { $0.id == sourceID }) {
                return source
            }
            return favoriteSources.first(where: { $0.id == sourceID })
        }

        private func favorite(for sourceID: String) -> DynamicMapFavoriteLocation? {
            guard sourceID.hasPrefix("favorite-") else { return nil }
            let rawID = String(sourceID.dropFirst("favorite-".count))
            guard let uuid = UUID(uuidString: rawID) else { return nil }
            return favoriteLocations.first(where: { $0.id == uuid })
        }

        private func coordinate(for source: DynamicMapSource) async -> CLLocationCoordinate2D? {
            if let coordinate = resolver.coordinatesBySourceID[source.id] {
                return coordinate
            }
            if let favorite = favorite(for: source.id),
               let latitude = favorite.latitude,
               let longitude = favorite.longitude {
                return CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
            }
            return await geocodeCoordinate(for: source.locationText)
        }

        private func geocodeCoordinate(for query: String) async -> CLLocationCoordinate2D? {
            let cleanQuery = query.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !cleanQuery.isEmpty else { return nil }

            let request = MKLocalSearch.Request()
            request.naturalLanguageQuery = cleanQuery

            do {
                let response = try await MKLocalSearch(request: request).start()
                return response.mapItems.first?.placemark.coordinate
            } catch {
                return nil
            }
        }
    }

    private enum JournalGroupingMode: String, CaseIterable, Identifiable {
        case day
        case mood

        var id: String { rawValue }

        var label: String {
            switch self {
            case .day:
                return "Day"
            case .mood:
                return "Mood"
            }
        }
    }

    private struct JournalSection: Identifiable {
        let id: String
        let title: String
        let entryIDs: [UUID]
    }

    struct JournalAppView: View {
        @EnvironmentObject private var store: PlannerStore

        @State private var selectedEntryID: UUID?
        @State private var groupingMode: JournalGroupingMode = .day
        @State private var searchText: String = ""

        @State private var editorTitle: String = ""
        @State private var editorBody: String = ""
        @State private var editorMood: JournalMood = .neutral
        @State private var editorDate: Date = Date()

        private var filteredEntries: [JournalEntry] {
            let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            let base = store.journalEntries.sorted { lhs, rhs in
                if lhs.createdAt != rhs.createdAt {
                    return lhs.createdAt > rhs.createdAt
                }
                return lhs.updatedAt > rhs.updatedAt
            }

            guard !query.isEmpty else { return base }
            return base.filter { entry in
                entry.title.lowercased().contains(query) || entry.body.lowercased().contains(query)
            }
        }

        private var sections: [JournalSection] {
            switch groupingMode {
            case .day:
                let grouped = Dictionary(grouping: filteredEntries) { entry in
                    Calendar.current.startOfDay(for: entry.createdAt)
                }
                let formatter = DateFormatter()
                formatter.dateStyle = .medium
                formatter.timeStyle = .none

                return grouped.keys.sorted(by: >).map { day in
                    let dayEntries = (grouped[day] ?? []).sorted { lhs, rhs in lhs.createdAt > rhs.createdAt }
                    return JournalSection(
                        id: "day-\(day.timeIntervalSince1970)",
                        title: formatter.string(from: day),
                        entryIDs: dayEntries.map(\.id)
                    )
                }

            case .mood:
                return JournalMood.allCases.compactMap { mood in
                    let moodEntries = filteredEntries.filter { $0.mood == mood }
                    guard !moodEntries.isEmpty else { return nil }
                    return JournalSection(
                        id: "mood-\(mood.rawValue)",
                        title: mood.label,
                        entryIDs: moodEntries.map(\.id)
                    )
                }
            }
        }

        private var selectedEntry: JournalEntry? {
            guard let selectedEntryID else { return nil }
            return store.journalEntry(for: selectedEntryID)
        }

        private var canSave: Bool {
            let cleanTitle = editorTitle.trimmingCharacters(in: .whitespacesAndNewlines)
            let cleanBody = editorBody.trimmingCharacters(in: .whitespacesAndNewlines)
            return !cleanTitle.isEmpty || !cleanBody.isEmpty
        }

        var body: some View {
            VStack(alignment: .leading, spacing: AppSpacing.standard.rawValue) {
                HStack(alignment: .center, spacing: AppSpacing.small.rawValue) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill(
                                LinearGradient(
                                    colors: [Color.indigo.opacity(0.88), Color.purple.opacity(0.72)],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                        Image(systemName: "book.closed")
                            .font(.title3.weight(.semibold))
                            .foregroundStyle(.white)
                    }
                    .frame(width: 46, height: 46)

                    VStack(alignment: .leading, spacing: 2) {
                        Text("Journal")
                            .appTitle()
                        Text("Capture entries and attach snapshots to item sub-items")
                            .appDescription()
                    }

                    Spacer()

                    Button {
                        startNewEntry()
                    } label: {
                        Label("New Entry", systemImage: "plus")
                    }
                    .appButton(.bordered_prominent)
                }

                HStack(spacing: AppSpacing.compact.rawValue) {
                    TextField("Search entries", text: $searchText)
                        .textFieldStyle(.roundedBorder)

                    Picker("Group", selection: $groupingMode) {
                        ForEach(JournalGroupingMode.allCases) { mode in
                            Text(mode.label).tag(mode)
                        }
                    }
                    .pickerStyle(.segmented)
                    .frame(width: 190)
                }

                HSplitView {
                    List(selection: $selectedEntryID) {
                        if sections.isEmpty {
                            Text("No journal entries yet")
                                .appDescription()
                        } else {
                            ForEach(sections) { section in
                                Section(section.title) {
                                    ForEach(section.entryIDs, id: \.self) { entryID in
                                        if let entry = store.journalEntry(for: entryID) {
                                            JournalEntryRow(entry: entry)
                                                .tag(Optional(entryID))
                                        }
                                    }
                                }
                            }
                        }
                    }
                    .frame(minWidth: 300, idealWidth: 340)

                    VStack(alignment: .leading, spacing: AppSpacing.compact.rawValue) {
                        Text(selectedEntry == nil ? "New Entry" : "Edit Entry")
                            .appSubtitle()

                        TextField("Title", text: $editorTitle)
                            .textFieldStyle(.roundedBorder)

                        HStack(spacing: AppSpacing.compact.rawValue) {
                            Picker("Mood", selection: $editorMood) {
                                ForEach(JournalMood.allCases) { mood in
                                    Label(mood.label, systemImage: mood.symbolName)
                                        .tag(mood)
                                }
                            }
                            .pickerStyle(.menu)
                            .frame(maxWidth: .infinity, alignment: .leading)

                            DatePicker(
                                "Date",
                                selection: $editorDate,
                                displayedComponents: [.date, .hourAndMinute]
                            )
                            .labelsHidden()
                            .frame(maxWidth: .infinity, alignment: .trailing)
                        }

                        TextEditor(text: $editorBody)
                            .frame(minHeight: 260)
                            .overlay(
                                RoundedRectangle(cornerRadius: 8, style: .continuous)
                                    .stroke(Color.secondary.opacity(0.20), lineWidth: 1)
                            )

                        Text("Snapshot for item sub-item attachments: first 120 characters")
                            .appCaption()

                        HStack(spacing: AppSpacing.compact.rawValue) {
                            Button("Save Entry") {
                                saveCurrentEntry()
                            }
                            .appButton(.bordered_prominent)
                            .disabled(!canSave)

                            Button("Delete") {
                                deleteCurrentEntry()
                            }
                            .appButton(.bordered)
                            .disabled(selectedEntry == nil)

                            Spacer()
                        }
                    }
                    .padding(.leading, 8)
                    .frame(minWidth: 460)
                }
            }
            .padding(AppSpacing.spacious.rawValue)
            .frame(minWidth: 900, minHeight: 580)
            .background(
                LinearGradient(
                    colors: [
                        Color(nsColor: .windowBackgroundColor),
                        Color.indigo.opacity(0.05)
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .onAppear {
                if !consumePendingSelectionIfAvailable(), selectedEntryID == nil, let first = filteredEntries.first {
                    selectedEntryID = first.id
                }
                loadSelectedEntryIntoEditor()
            }
            .onChange(of: store.pendingJournalEntryID) { _, _ in
                _ = consumePendingSelectionIfAvailable()
            }
            .onChange(of: selectedEntryID) { _, _ in
                loadSelectedEntryIntoEditor()
            }
        }

        private func consumePendingSelectionIfAvailable() -> Bool {
            guard let pendingID = store.consumePendingJournalEntrySelection() else { return false }
            if store.journalEntry(for: pendingID) != nil {
                selectedEntryID = pendingID
            } else if selectedEntryID == nil, let first = filteredEntries.first {
                selectedEntryID = first.id
            }
            return true
        }

        private func loadSelectedEntryIntoEditor() {
            guard let selectedEntry else {
                startNewEntry()
                return
            }

            editorTitle = selectedEntry.title
            editorBody = selectedEntry.body
            editorMood = selectedEntry.mood
            editorDate = selectedEntry.createdAt
        }

        private func startNewEntry() {
            selectedEntryID = nil
            editorTitle = ""
            editorBody = ""
            editorMood = .neutral
            editorDate = Date()
        }

        private func saveCurrentEntry() {
            if let selectedEntryID {
                store.updateJournalEntry(
                    id: selectedEntryID,
                    title: editorTitle,
                    body: editorBody,
                    mood: editorMood,
                    createdAt: editorDate
                )
                return
            }

            if let createdID = store.createJournalEntry(
                title: editorTitle,
                body: editorBody,
                mood: editorMood,
                createdAt: editorDate
            ) {
                selectedEntryID = createdID
            }
        }

        private func deleteCurrentEntry() {
            guard let selectedEntryID else { return }
            store.deleteJournalEntry(id: selectedEntryID)

            if let replacement = filteredEntries.first(where: { $0.id != selectedEntryID }) {
                self.selectedEntryID = replacement.id
            } else {
                startNewEntry()
            }
        }
    }

    private struct JournalEntryRow: View {
        let entry: JournalEntry

        private var dateLabel: String {
            let formatter = DateFormatter()
            formatter.dateStyle = .medium
            formatter.timeStyle = .short
            return formatter.string(from: entry.createdAt)
        }

        var body: some View {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: AppSpacing.xCompact.rawValue) {
                    Text(entry.trimmedTitle.isEmpty ? "Untitled Entry" : entry.trimmedTitle)
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(1)
                        .truncationMode(.tail)

                    Spacer(minLength: 0)

                    Image(systemName: entry.mood.symbolName)
                        .font(.caption)
                        .foregroundStyle(entry.mood.tint)
                }

                Text(entry.previewText.isEmpty ? "No body text" : entry.previewText)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)

                Text(dateLabel)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            .padding(.vertical, 2)
        }
    }

    struct EventsPageView: View {
        let dateFilter: PlanningDateFilter
        let domainFilter: BucketDomain?
        let bucketFilter: UUID?

        var body: some View {
            PlanningItemsPage(
                kind: .event,
                title: "Events",
                eyebrow: "Event planning",
                dateFilter: dateFilter,
                domainFilter: domainFilter,
                bucketFilter: bucketFilter
            )
        }
    }

    struct TasksPageView: View {
        let dateFilter: PlanningDateFilter
        let domainFilter: BucketDomain?
        let bucketFilter: UUID?

        var body: some View {
            PlanningItemsPage(
                kind: .task,
                title: "Tasks",
                eyebrow: "Action management",
                dateFilter: dateFilter,
                domainFilter: domainFilter,
                bucketFilter: bucketFilter
            )
        }
    }

    struct RemindersPageView: View {
        let dateFilter: PlanningDateFilter
        let domainFilter: BucketDomain?
        let bucketFilter: UUID?

        var body: some View {
            PlanningItemsPage(
                kind: .reminder,
                title: "Reminders",
                eyebrow: "Time-based prompts",
                dateFilter: dateFilter,
                domainFilter: domainFilter,
                bucketFilter: bucketFilter
            )
        }
    }

    struct PlanningItemsPage: View {
        let kind: PlanningKind
        let title: String
        let eyebrow: String
        let dateFilter: PlanningDateFilter
        let domainFilter: BucketDomain?
        let bucketFilter: UUID?

        private let itemColumns = [
            GridItem(.flexible(), spacing: AppSpacing.generous.rawValue),
            GridItem(.flexible(), spacing: AppSpacing.generous.rawValue)
        ]

        @EnvironmentObject private var store: PlannerStore

        private var filteredItems: [PlanningItem] {
            store.items(for: kind).filter { item in
                matchesDomain(item) && matchesBucket(item) && matchesDate(item)
            }
        }

        var body: some View {
            VStack(alignment: .leading, spacing: AppSpacing.generous.rawValue) {
                SectionHeader(title: title, eyebrow: eyebrow)

                if filteredItems.isEmpty {
                    Text("No items match the current filters.")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                } else {
                    LazyVGrid(columns: itemColumns, alignment: .leading, spacing: AppSpacing.generous.rawValue) {
                        ForEach(filteredItems) { item in
                            PlanningItemCard(itemID: item.id)
                        }
                    }
                }
            }
        }

        private func matchesDomain(_ item: PlanningItem) -> Bool {
            guard let domainFilter else { return true }
            return item.domain == domainFilter
        }

        private func matchesBucket(_ item: PlanningItem) -> Bool {
            guard let bucketFilter else { return true }
            return item.bucketID == bucketFilter
        }

        private func matchesDate(_ item: PlanningItem) -> Bool {
            guard dateFilter != .all else { return true }
            let calendar = Calendar.current
            switch dateFilter {
            case .all:
                return true
            case .today:
                return store.occurs(item, on: Date())
            case .next7Days:
                let todayStart = calendar.startOfDay(for: Date())
                guard let upperBound = calendar.date(byAdding: .day, value: 7, to: todayStart) else { return false }
                return !store.occurrenceDates(for: item, from: todayStart, to: upperBound).isEmpty
            }
        }
    }

    struct PlanningItemCard: View {
        private struct DetailSegment: Hashable {
            let text: String
            let isValue: Bool
        }

        private struct DetailLine: Hashable {
            let segments: [DetailSegment]
        }

        let itemID: UUID

        @EnvironmentObject private var store: PlannerStore
        @Environment(\.openWindow) private var openWindow
        @Environment(\.openURL) private var openURL
        @State private var editingItem: PlanningItem?
        @State private var hoveredSubItemID: UUID?
        @State private var isHoveringMenu = false
        @State private var isDatePickerPresented = false
        @State private var isTimePickerPresented = false
        @State private var pendingDateSelection = Date()
        @State private var pendingTimeSelection = Date()
        @State private var pendingEventStartTime = Date()
        @State private var pendingEventEndTime = Date()
        @State private var pendingEventIsAllDay = false
        @State private var isRepeatPickerPresented = false
        @State private var isPriorityPickerPresented = false
        @State private var isLocationEditorPresented = false
        @State private var pendingRepeatRule: RepeatRule = .none
        @State private var pendingAlternateHasEndDate = false
        @State private var pendingAlternateUntilDate = Date()
        @State private var pendingPriority: PriorityLevel = .medium
        @State private var pendingLocationText: String = ""

        private let maxDetailsPreviewCount = 4
        private let maxSubItemsPreviewCount = 2

        var body: some View {
            if let item = store.item(for: itemID), let bucket = store.bucket(for: item.bucketID) {
                let isDone = item.kind == .task ? item.isCompleted : item.isRead
                let menuIconColor: Color = isHoveringMenu ? .accentColor : .secondary
                VStack(alignment: .leading, spacing: AppSpacing.compact.rawValue) {
                    HStack {
                        if item.kind == .task {
                            Button {
                                store.toggleTaskCompletion(itemID: item.id)
                            } label: {
                                Image(systemName: isDone ? "checkmark.circle.fill" : "circle")
                                    .font(.title3)
                                    .foregroundStyle(isDone ? .green : .secondary)
                            }
                            .appButton(.plain)
                        } else if item.kind == .reminder {
                            Button {
                                store.setReminderRead(itemID: item.id, isRead: !item.isRead)
                            } label: {
                                Image(systemName: isDone ? "checkmark.circle.fill" : "circle")
                                    .font(.title3)
                                    .foregroundStyle(isDone ? .green : .secondary)
                            }
                            .appButton(.plain)
                        }

                        Image(systemName: item.icon)
                            .appSubtitle()
                            .foregroundStyle(.secondary)

                        Text(item.title)
                            .appSubtitle()
                            .strikethrough(isDone)
                            .foregroundStyle(isDone ? .secondary : .primary)

                        Spacer()
                        BucketBadge(bucket: bucket)
                        Menu {
                            Button {
                                editingItem = item
                            } label: {
                                Label("Edit", systemImage: "pencil")
                            }

                            Button {
                                store.duplicateItem(itemID: item.id)
                            } label: {
                                Label("Duplicate", systemImage: "plus.square.on.square")
                            }

                            Divider()

                            Button(role: .destructive) {
                                store.deleteItem(itemID: item.id)
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                        } label: {
                            Image(systemName: "ellipsis.circle")
                                .foregroundStyle(menuIconColor)
                                .padding(4)
                        }
                        .menuIndicator(.hidden)
                        .menuStyle(.borderlessButton)
                        .onHover { hovering in
                            isHoveringMenu = hovering
                        }
                    }

                    Divider()

                    sectionTitle("Core")
                    let domainSelection = domainBinding(for: item.id)
                    let bucketSelection = bucketBinding(for: item.id)
                    let bucketOptions = store.bucketsForPicker(domain: item.domain)
                    let domainChoices: [(value: BucketDomain, title: String)] = BucketDomain.allCases.map { domain in
                        (value: domain, title: domain.title)
                    }
                    let bucketChoices: [(id: UUID, name: String)] = bucketOptions.map { bucketOption in
                        (id: bucketOption.id, name: bucketOption.name)
                    }

                    HStack(spacing: AppSpacing.small.rawValue) {
                        Picker("Domain", selection: domainSelection) {
                            ForEach(domainChoices, id: \.value) { domainChoice in
                                Text(domainChoice.title)
                                    .tag(domainChoice.value)
                            }
                        }
                        .pickerStyle(.menu)

                        Picker("Bucket", selection: bucketSelection) {
                            ForEach(bucketChoices, id: \.id) { bucketChoice in
                                Text(bucketChoice.name)
                                    .tag(bucketChoice.id)
                            }
                        }
                        .pickerStyle(.menu)
                    }

                    sectionTitle("Details")
                    detailsSection(for: item)

                    sectionTitle("Sub-Items")
                    VStack(alignment: .leading, spacing: 6) {
                        if item.subItems.isEmpty {
                            Text("No sub-items")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        } else {
                            ForEach(item.subItems) { subItem in
                                HStack(spacing: AppSpacing.xCompact.rawValue) {
                                    Image(systemName: subItemIcon(for: subItem))
                                        .font(.body)
                                        .foregroundStyle(Color.accentColor)
                                    Text(subItem.title)
                                        .font(.body)
                                        .foregroundStyle(subItem.isCompleted ? .secondary : .primary)
                                        .strikethrough(subItem.isCompleted)
                                        .lineLimit(1)
                                        .truncationMode(.tail)
                                }
                                .padding(.horizontal, AppSpacing.xCompact.rawValue)
                                .padding(.vertical, 6)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(
                                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                                        .fill(hoveredSubItemID == subItem.id ? Color.accentColor.opacity(0.10) : Color.clear)
                                )
                                .overlay(
                                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                                        .stroke(hoveredSubItemID == subItem.id ? Color.accentColor.opacity(0.30) : Color.clear, lineWidth: 1)
                                )
                                .contentShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                                .appAnimated(hoveredSubItemID, animation: AppMotion.micro)
                                .onHover { isHovering in
                                    hoveredSubItemID = isHovering ? subItem.id : nil
                                }
                                .onTapGesture {
                                    handleSubItemTap(subItem, parentItem: item)
                                }
                            }
                        }
                    }

                }
            .cardStyle(color: Color(hex: bucket.colorHex))
            .sheet(item: $editingItem) { item in
                PlanningItemEditorSheet(item: item) { draft in
                    store.updateItem(itemID: item.id, from: draft)
                }
            }
        }
        }

        private func handleSubItemTap(_ subItem: PlanningSubItem, parentItem: PlanningItem) {

            switch subItem.kind {
            case .task, .reminder, .event:
                editingItem = parentItem

            case .journalEntry:
                if let entryID = subItem.sourceEntryID {
                    store.queueJournalEntrySelection(entryID)
                }
                openWindow(id: CompanionAppID.journal.windowID)

            case .url:
                guard let url = resolvedURL(for: subItem) else { return }
                openURL(url)

            case .favoriteLocation:
                guard let favoriteID = subItem.sourceEntryID,
                      let favorite = store.dynamicMapFavorite(for: favoriteID),
                      let url = appleMapsURL(for: favorite) else { return }
                openURL(url)

            case .savedRoute:
                guard let routeID = subItem.sourceEntryID else { return }
                store.queueDynamicMapRouteSelection(routeID)
                openWindow(id: CompanionAppID.dynamicMap.windowID)

            case .mapTrip:
                if !handleLegacyMapTripTap(subItem) {
                    openWindow(id: CompanionAppID.dynamicMap.windowID)
                }

            case .pdfFile:
                guard let fileURL = resolvedPDFFileURL(for: subItem) else { return }
                let didAccessSecurityScope = fileURL.startAccessingSecurityScopedResource()
                NSWorkspace.shared.open(fileURL)
                if didAccessSecurityScope {
                    fileURL.stopAccessingSecurityScopedResource()
                }

            case .outfit, .weatherReport:
                break
            }
        }

        private func resolvedPDFFileURL(for subItem: PlanningSubItem) -> URL? {
            if let bookmarkData = subItem.pdfBookmarkData {
                var isStale = false
                if let bookmarkURL = try? URL(
                    resolvingBookmarkData: bookmarkData,
                    options: [.withSecurityScope, .withoutUI],
                    relativeTo: nil,
                    bookmarkDataIsStale: &isStale
                ), bookmarkURL.isFileURL {
                    return bookmarkURL
                }
            }

            if let rawURL = subItem.urlString?.trimmingCharacters(in: .whitespacesAndNewlines),
               let url = URL(string: rawURL),
               url.isFileURL {
                return url
            }

            return nil
        }

        private func handleLegacyMapTripTap(_ subItem: PlanningSubItem) -> Bool {
            if let entryID = subItem.sourceEntryID {
                if let route = store.dynamicMapSavedRoute(for: entryID) {
                    store.queueDynamicMapRouteSelection(route.id)
                    openWindow(id: CompanionAppID.dynamicMap.windowID)
                    return true
                }

                if let favorite = resolveLegacyFavorite(from: entryID),
                   let url = appleMapsURL(for: favorite) {
                    openURL(url)
                    return true
                }
            }

            if let route = resolveLegacyRouteByTitle(subItem.title) {
                store.queueDynamicMapRouteSelection(route.id)
                openWindow(id: CompanionAppID.dynamicMap.windowID)
                return true
            }

            if let favorite = resolveLegacyFavoriteByTitle(subItem.title),
               let url = appleMapsURL(for: favorite) {
                openURL(url)
                return true
            }

            if let rawURL = subItem.urlString?.trimmingCharacters(in: .whitespacesAndNewlines),
               let url = URL(string: rawURL),
               let scheme = url.scheme?.lowercased(),
               ["http", "https", "maps"].contains(scheme) {
                openURL(url)
                return true
            }

            return false
        }

        private func resolveLegacyFavorite(from entryID: UUID) -> DynamicMapFavoriteLocation? {
            if let direct = store.dynamicMapFavorite(for: entryID) {
                return direct
            }

            if store.item(for: entryID) != nil {
                let sourceID = "item-\(entryID.uuidString)"
                return store.dynamicMapFavorites.first(where: { $0.sourceID == sourceID })
            }

            if store.bucket(for: entryID) != nil {
                let sourceID = "bucket-\(entryID.uuidString)"
                return store.dynamicMapFavorites.first(where: { $0.sourceID == sourceID })
            }

            return nil
        }

        private func resolveLegacyRouteByTitle(_ rawTitle: String) -> DynamicMapSavedRoute? {
            let normalized = normalizeLegacyMapTripTitle(rawTitle)
            guard !normalized.isEmpty else { return nil }

            if let exact = store.dynamicMapSavedRoutes.first(where: {
                normalizeLegacyMapTripTitle($0.title) == normalized
            }) {
                return exact
            }

            let separators = ["->", "→", " to ", " - "]
            for separator in separators where normalized.contains(separator) {
                let parts = normalized.components(separatedBy: separator)
                    .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                    .filter { !$0.isEmpty }
                guard parts.count >= 2 else { continue }
                let first = parts.first ?? ""
                let last = parts.last ?? ""

                if let matched = store.dynamicMapSavedRoutes.first(where: { route in
                    let routeTitle = normalizeLegacyMapTripTitle(route.title)
                    return routeTitle.contains(first) && routeTitle.contains(last)
                }) {
                    return matched
                }
            }

            return nil
        }

        private func resolveLegacyFavoriteByTitle(_ rawTitle: String) -> DynamicMapFavoriteLocation? {
            let normalized = normalizeLegacyMapTripTitle(rawTitle)
            guard !normalized.isEmpty else { return nil }

            return store.dynamicMapFavorites.first(where: { favorite in
                normalizeLegacyMapTripTitle(favorite.title) == normalized ||
                normalizeLegacyMapTripTitle(favorite.locationText) == normalized
            })
        }

        private func normalizeLegacyMapTripTitle(_ value: String) -> String {
            value
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .lowercased()
                .replacingOccurrences(of: "  ", with: " ")
        }

        private func appleMapsURL(for favorite: DynamicMapFavoriteLocation) -> URL? {
            if let latitude = favorite.latitude, let longitude = favorite.longitude {
                let query = favorite.title.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "Location"
                return URL(string: "https://maps.apple.com/?ll=\(latitude),\(longitude)&q=\(query)")
            }

            let encoded = favorite.locationText.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed)
            guard let encoded else { return nil }
            return URL(string: "https://maps.apple.com/?q=\(encoded)")
        }

        private func resolvedURL(for subItem: PlanningSubItem) -> URL? {
            let raw = (subItem.urlString ?? subItem.title).trimmingCharacters(in: .whitespacesAndNewlines)
            guard !raw.isEmpty else { return nil }

            if let direct = URL(string: raw), let scheme = direct.scheme?.lowercased(), scheme == "http" || scheme == "https" {
                return direct
            }

            if let inferred = URL(string: "https://\(raw)"), inferred.host != nil {
                return inferred
            }

            return nil
        }

    // Returns the SF Symbol name for a sub-item kind
    private func subItemIcon(for subItem: PlanningSubItem) -> String {
        switch subItem.kind {
        case .task:
            return "checkmark.circle"
        case .reminder:
            return "bell"
        case .event:
            return "calendar"
        case .journalEntry:
            return "book.closed"
        case .url:
            return "link"
        case .favoriteLocation:
            return "star"
        case .savedRoute:
            return "point.topleft.down.curvedto.point.bottomright.up"
        case .mapTrip:
            return "car"
        case .outfit:
            return "tshirt"
        case .weatherReport:
            return "cloud.sun"
        case .pdfFile:
            return "doc.pdf"
        }
    }

    @ViewBuilder
    private func sectionTitle(_ title: String) -> some View {
        Text(title)
            .font(.caption.weight(.semibold))
            .foregroundStyle(.secondary)
            .textCase(.uppercase)
    }

    @ViewBuilder
    private func detailsSection(for item: PlanningItem) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            dateSelectionRow(for: item)
            repeatInteractiveRow(for: item)

            if item.kind == .event {
                locationInteractiveRow(for: item)
            }

            if item.kind == .task {
                priorityInteractiveRow(for: item)
            }

            let details = supplementaryDetailsLines(for: item)
            let previewDetails = Array(details.prefix(maxDetailsPreviewCount - 1))
            let previewDetailStrings = previewDetails.map { line in
                line.segments.map(\.text).joined()
            }
            if previewDetailStrings.indices.contains(0) {
                Text(previewDetailStrings[0])
                    .font(.body)
                    .foregroundStyle(.primary)
                    .lineLimit(2)
            }
            if previewDetailStrings.indices.contains(1) {
                Text(previewDetailStrings[1])
                    .font(.body)
                    .foregroundStyle(.primary)
                    .lineLimit(2)
            }
            if previewDetailStrings.indices.contains(2) {
                Text(previewDetailStrings[2])
                    .font(.body)
                    .foregroundStyle(.primary)
                    .lineLimit(2)
            }

            let hiddenDetailsCount = details.count - (maxDetailsPreviewCount - 1)
            if hiddenDetailsCount > 0 {
                Text("+\(hiddenDetailsCount) more details")
                    .font(.body)
                    .foregroundStyle(.primary)
            }
        }
    }

        private func trimmedNotes(for item: PlanningItem) -> String {
            item.notes.trimmingCharacters(in: .whitespacesAndNewlines)
        }

        @ViewBuilder
        private func dateSelectionRow(for item: PlanningItem) -> some View {
            HStack(spacing: 4) {
                Text(dateSelectionPrefix(for: item.kind))
                    .font(.body)
                    .foregroundStyle(.primary)

                Button {
                    pendingDateSelection = currentPrimaryDate(for: item) ?? Date()
                    isDatePickerPresented = true
                } label: {
                    HStack(spacing: 4) {
                        Text(primaryDateLabel(for: item))
                            .font(.body.weight(.semibold))
                            .foregroundStyle(.primary)
                        Image(systemName: "chevron.down")
                            .font(.body.weight(.semibold))
                            .foregroundStyle(.primary)
                    }
                }
                .appButton(.plain)
                .popover(isPresented: $isDatePickerPresented) {
                    VStack(alignment: .leading, spacing: AppSpacing.small.rawValue) {
                        Text("Select date")
                            .font(.subheadline.weight(.semibold))

                        DatePicker(
                            "",
                            selection: primaryDateBinding(for: item),
                            displayedComponents: [.date]
                        )
                        .labelsHidden()
                        .datePickerStyle(.graphical)

                        HStack {
                            Spacer()
                            Button("Done") {
                                isDatePickerPresented = false
                            }
                        }
                    }
                    .padding(AppSpacing.standard.rawValue)
                    .frame(minWidth: 280)
                }

                if item.kind == .event {
                    Button {
                        prepareTimePopover(for: item)
                        isTimePickerPresented = true
                    } label: {
                        HStack(spacing: 4) {
                            eventTimingView(for: item)
                                .foregroundStyle(.primary)
                            Image(systemName: "chevron.down")
                                .font(.body.weight(.semibold))
                                .foregroundStyle(.primary)
                        }
                    }
                    .appButton(.plain)
                    .popover(isPresented: $isTimePickerPresented) {
                        VStack(alignment: .leading, spacing: AppSpacing.small.rawValue) {
                            Text("Event timing")
                                .font(.subheadline.weight(.semibold))

                            Toggle(
                                "All Day",
                                isOn: eventAllDayBinding(for: item)
                            )

                            if !pendingEventIsAllDay {
                                HStack(spacing: AppSpacing.compact.rawValue) {
                                    VStack(alignment: .leading, spacing: 6) {
                                        Text("Start")
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                        DatePicker(
                                            "",
                                            selection: eventStartTimeBinding(for: item),
                                            displayedComponents: [.hourAndMinute]
                                        )
                                        .labelsHidden()
                                    }

                                    VStack(alignment: .leading, spacing: 6) {
                                        Text("End")
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                        DatePicker(
                                            "",
                                            selection: eventEndTimeBinding(for: item),
                                            displayedComponents: [.hourAndMinute]
                                        )
                                        .labelsHidden()
                                    }
                                }
                            }

                            HStack {
                                Spacer()
                                Button("Done") {
                                    isTimePickerPresented = false
                                }
                            }
                        }
                        .padding(AppSpacing.standard.rawValue)
                        .frame(minWidth: 320)
                    }
                } else {
                    let timingLabel = reminderOrTaskTimingLabel(for: item)
                    if timingLabel != nil {
                        Text("at")
                            .font(.body)
                            .foregroundStyle(.primary)
                    }

                    Button {
                        prepareTimePopover(for: item)
                        isTimePickerPresented = true
                    } label: {
                        HStack(spacing: 4) {
                            Text(timingLabel ?? "all day")
                                .font(.body.weight(.semibold))
                                .foregroundStyle(.primary)
                            Image(systemName: "chevron.down")
                                .font(.body.weight(.semibold))
                                .foregroundStyle(.primary)
                        }
                    }
                    .appButton(.plain)
                    .popover(isPresented: $isTimePickerPresented) {
                        simpleTimePopover(for: item)
                    }
                }

                Spacer(minLength: 0)
            }
        }

        @ViewBuilder
        private func repeatInteractiveRow(for item: PlanningItem) -> some View {
            HStack(spacing: 4) {
                if item.repeatRule == .none {
                    Text("Repeating")
                        .font(.body)
                        .foregroundStyle(.primary)

                    Button {
                        prepareRepeatPopover(for: item)
                        isRepeatPickerPresented = true
                    } label: {
                        HStack(spacing: 4) {
                            Text("never")
                                .font(.body.weight(.bold))
                                .foregroundStyle(.primary)
                            Image(systemName: "chevron.down")
                                .font(.body.weight(.semibold))
                                .foregroundStyle(.primary)
                        }
                    }
                    .appButton(.plain)
                    .popover(isPresented: $isRepeatPickerPresented) {
                        repeatRulePopover(for: item)
                    }
                } else {
                    Text("Repeating every")
                        .font(.body)
                        .foregroundStyle(.primary)

                    Button {
                        prepareRepeatPopover(for: item)
                        isRepeatPickerPresented = true
                    } label: {
                        HStack(spacing: 4) {
                            if item.repeatRule == .alternateWorkdays,
                               let untilISO = item.alternateWorkdayConfig?.untilDateISO,
                               let untilDate = dateFromISO(untilISO) {
                                Text("other workday")
                                    .font(.body.weight(.bold))
                                    .foregroundStyle(.primary)
                                Text("until")
                                    .font(.body)
                                    .foregroundStyle(.primary)
                                Text(displayDateString(untilDate))
                                    .font(.body.weight(.bold))
                                    .foregroundStyle(.primary)
                            } else {
                                Text(repeatSummaryLabel(for: item))
                                    .font(.body.weight(.bold))
                                    .foregroundStyle(.primary)
                            }
                            Image(systemName: "chevron.down")
                                .font(.body.weight(.semibold))
                                .foregroundStyle(.primary)
                        }
                    }
                    .appButton(.plain)
                    .popover(isPresented: $isRepeatPickerPresented) {
                        repeatRulePopover(for: item)
                    }
                }

                Spacer(minLength: 0)
            }
        }

        @ViewBuilder
        private func priorityInteractiveRow(for item: PlanningItem) -> some View {
            HStack(spacing: 4) {
                Text("Priority: ")
                    .font(.body)
                    .foregroundStyle(.primary)

                Button {
                    pendingPriority = item.priority
                    isPriorityPickerPresented = true
                } label: {
                    HStack(spacing: 4) {
                        Text(item.priority.label.lowercased())
                            .font(.body.weight(.bold))
                            .foregroundStyle(.primary)
                        Image(systemName: "chevron.down")
                            .font(.body.weight(.semibold))
                            .foregroundStyle(.primary)
                    }
                }
                .appButton(.plain)
                .popover(isPresented: $isPriorityPickerPresented) {
                    priorityPopover(for: item)
                }

                Spacer(minLength: 0)
            }
        }

        private func locationInteractiveRow(for item: PlanningItem) -> some View {
            let location = item.location.trimmingCharacters(in: .whitespacesAndNewlines)
            let helper: String
            if location.isEmpty {
                helper = "Located at"
            } else if isOnlinePlatformLocation(location) {
                helper = "Located on"
            } else if isLikelyStreetAddress(location) {
                helper = "Located at"
            } else {
                helper = "Located in"
            }

            return HStack(spacing: 4) {
                Text(helper)
                    .font(.body)
                    .foregroundStyle(.primary)

                Button {
                    pendingLocationText = location
                    isLocationEditorPresented = true
                } label: {
                    HStack(spacing: 4) {
                        Text(location.isEmpty ? "add location" : location)
                            .font(.body.weight(.semibold))
                            .foregroundStyle(.primary)
                            .lineLimit(1)
                            .truncationMode(.tail)
                        Image(systemName: "chevron.down")
                            .font(.body.weight(.semibold))
                            .foregroundStyle(.primary)
                    }
                }
                .appButton(.plain)
                .popover(isPresented: $isLocationEditorPresented) {
                    locationPopover(for: item)
                }

                Spacer(minLength: 0)
            }
        }

        @ViewBuilder
        private func repeatRulePopover(for item: PlanningItem) -> some View {
            VStack(alignment: .leading, spacing: AppSpacing.small.rawValue) {
                Text("Repeat")
                    .font(.subheadline.weight(.semibold))

                Picker("Repeat", selection: $pendingRepeatRule) {
                    ForEach(availableRepeatRules(for: item)) { option in
                        Text(option.label).tag(option)
                    }
                }
                .pickerStyle(.menu)
                .onChange(of: pendingRepeatRule) { _, newValue in
                    updateRepeatRule(
                        for: item,
                        to: newValue,
                        alternateUntilDateISO: resolvedAlternateUntilDateISO(for: item)
                    )
                }

                if pendingRepeatRule == .alternateWorkdays {
                    Toggle("End repeat date", isOn: $pendingAlternateHasEndDate)
                        .onChange(of: pendingAlternateHasEndDate) { _, _ in
                            updateRepeatRule(
                                for: item,
                                to: .alternateWorkdays,
                                alternateUntilDateISO: resolvedAlternateUntilDateISO(for: item)
                            )
                        }

                    if pendingAlternateHasEndDate {
                        DatePicker(
                            "Ends on",
                            selection: $pendingAlternateUntilDate,
                            displayedComponents: [.date]
                        )
                        .onChange(of: pendingAlternateUntilDate) { _, _ in
                            updateRepeatRule(
                                for: item,
                                to: .alternateWorkdays,
                                alternateUntilDateISO: resolvedAlternateUntilDateISO(for: item)
                            )
                        }
                    }
                }

                HStack {
                    Spacer()
                    Button("Done") {
                        isRepeatPickerPresented = false
                    }
                }
            }
            .padding(AppSpacing.standard.rawValue)
            .frame(minWidth: 240)
        }

        @ViewBuilder
        private func priorityPopover(for item: PlanningItem) -> some View {
            VStack(alignment: .leading, spacing: AppSpacing.small.rawValue) {
                Text("Priority")
                    .font(.subheadline.weight(.semibold))

                Picker("Priority", selection: prioritySelectionBinding(for: item)) {
                    ForEach(PriorityLevel.allCases) { option in
                        Text(option.label).tag(option)
                    }
                }
                .pickerStyle(.menu)

                HStack {
                    Spacer()
                    Button("Done") {
                        isPriorityPickerPresented = false
                    }
                }
            }
            .padding(AppSpacing.standard.rawValue)
            .frame(minWidth: 240)
        }

        @ViewBuilder
        private func locationPopover(for item: PlanningItem) -> some View {
            VStack(alignment: .leading, spacing: AppSpacing.small.rawValue) {
                Text("Location")
                    .font(.subheadline.weight(.semibold))

                TextField("Address, area, or URL", text: $pendingLocationText)
                    .textFieldStyle(.roundedBorder)

                HStack {
                    Button("Clear") {
                        pendingLocationText = ""
                        updateLocation(for: item, to: "")
                    }
                    .appButton(.bordered)

                    Spacer()

                    Button("Done") {
                        updateLocation(for: item, to: pendingLocationText)
                        isLocationEditorPresented = false
                    }
                    .appButton(.bordered_prominent)
                }
            }
            .padding(AppSpacing.standard.rawValue)
            .frame(minWidth: 300)
        }

        private func detailLineText(_ line: DetailLine) -> Text {
            line.segments.reduce(Text("")) { partial, segment in
                let piece = Text(segment.text).fontWeight(segment.isValue ? .semibold : .regular)
                return partial + piece
            }
        }

        private func makeLine(_ segments: DetailSegment...) -> DetailLine {
            DetailLine(segments: segments)
        }

        private func repeatDetailLine(for item: PlanningItem) -> DetailLine {
            if item.repeatRule == .none {
                return makeLine(
                    DetailSegment(text: "Repeating ", isValue: false),
                    DetailSegment(text: "never", isValue: true)
                )
            }

            if item.repeatRule == .alternateWorkdays {
                if let untilISO = item.alternateWorkdayConfig?.untilDateISO,
                   let untilDate = dateFromISO(untilISO) {
                    return makeLine(
                        DetailSegment(text: "Repeating every ", isValue: false),
                        DetailSegment(text: "other workday", isValue: true),
                        DetailSegment(text: " until ", isValue: false),
                        DetailSegment(text: displayDateString(untilDate), isValue: true)
                    )
                }
                return makeLine(
                    DetailSegment(text: "Repeating every ", isValue: false),
                    DetailSegment(text: "other workday", isValue: true)
                )
            }

            return makeLine(
                DetailSegment(text: "Repeating every ", isValue: false),
                DetailSegment(text: item.repeatRule.label.lowercased(), isValue: true),
                DetailSegment(text: " forever", isValue: false)
            )
        }

        private func locationDetailLine(for item: PlanningItem) -> DetailLine? {
            let location = item.location.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !location.isEmpty else { return nil }

            let helper: String
            if isOnlinePlatformLocation(location) {
                helper = "Located on "
            } else if isLikelyStreetAddress(location) {
                helper = "Located at "
            } else {
                helper = "Located in "
            }

            return makeLine(
                DetailSegment(text: helper, isValue: false),
                DetailSegment(text: location, isValue: true)
            )
        }

        private func isOnlinePlatformLocation(_ location: String) -> Bool {
            let trimmed = location.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { return false }

            if let url = URL(string: trimmed),
               let scheme = url.scheme?.lowercased(),
               (scheme == "http" || scheme == "https"),
               let host = url.host,
               !host.isEmpty {
                return true
            }

            if trimmed.lowercased().hasPrefix("www.") {
                return true
            }

            if let inferredURL = URL(string: "https://\(trimmed)"),
               let host = inferredURL.host,
               host.contains(".") {
                return true
            }

            return false
        }

        private func isLikelyStreetAddress(_ location: String) -> Bool {
            let trimmed = location.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { return false }

            let lower = trimmed.lowercased()
            let streetHints = ["st", "street", "ave", "avenue", "rd", "road", "blvd", "lane", "ln", "dr", "drive", "ct", "court"]
            let hasStreetHint = streetHints.contains { hint in
                lower.contains(" \(hint)") || lower.hasSuffix(hint)
            }
            let hasDigit = trimmed.rangeOfCharacter(from: .decimalDigits) != nil
            return hasDigit || hasStreetHint
        }

        private func supplementaryDetailsLines(for item: PlanningItem) -> [DetailLine] {
            switch item.kind {
            case .event:
                return []

            case .task:
                var lines: [DetailLine] = []
                if let estimatedMinutes = item.estimatedMinutes {
                    lines.append(makeLine(
                        DetailSegment(text: "Estimate: ", isValue: false),
                        DetailSegment(text: "\(estimatedMinutes) min", isValue: true)
                    ))
                } else {
                    lines.append(makeLine(
                        DetailSegment(text: "Estimate: ", isValue: false),
                        DetailSegment(text: "none", isValue: true)
                    ))
                }
                return lines

            case .reminder:
                var lines: [DetailLine] = []
                if item.reminderTime == nil {
                    lines.append(makeLine(
                        DetailSegment(text: "Alerting ", isValue: false),
                        DetailSegment(text: "never", isValue: true)
                    ))
                } else {
                    lines.append(makeLine(
                        DetailSegment(text: "Alerting at ", isValue: false),
                        DetailSegment(text: item.reminderLeadTime.label.lowercased(), isValue: true)
                    ))
                }
                return lines
            }
        }

        private func dateSelectionPrefix(for kind: PlanningKind) -> String {
            switch kind {
            case .event:
                return "Event on"
            case .task:
                return "Task on"
            case .reminder:
                return "Reminder on"
            }
        }

        private func currentPrimaryDate(for item: PlanningItem) -> Date? {
            switch item.kind {
            case .event:
                return item.startDate
            case .task:
                return item.dueDate
            case .reminder:
                return item.reminderDate
            }
        }

        private func primaryDateLabel(for item: PlanningItem) -> String {
            guard let date = currentPrimaryDate(for: item) else { return "Select date" }
            let formatter = DateFormatter()
            formatter.dateStyle = .medium
            formatter.timeStyle = .none
            return formatter.string(from: date)
        }

        private func reminderOrTaskTimingLabel(for item: PlanningItem) -> String? {
            let formatter = DateFormatter()
            formatter.dateStyle = .none
            formatter.timeStyle = .short

            switch item.kind {
            case .task:
                guard let dueTime = item.dueTime else { return nil }
                return formatter.string(from: dueTime)
            case .reminder:
                guard let reminderTime = item.reminderTime else { return nil }
                return formatter.string(from: reminderTime)
            case .event:
                return nil
            }
        }

        private func eventTimingLabel(for item: PlanningItem) -> String {
            if item.isAllDay {
                return "all day"
            }

            let formatter = DateFormatter()
            formatter.dateStyle = .none
            formatter.timeStyle = .short

            let start = item.startTime ?? defaultEventStartTime(for: item)
            let end = item.endTime ?? defaultEventEndTime(for: item, startTime: start)
            return "from \(formatter.string(from: start)) to \(formatter.string(from: end))"
        }

        private func eventTimingView(for item: PlanningItem) -> some View {
            if item.isAllDay {
                return AnyView(
                    Text("all day")
                        .font(.body.weight(.semibold))
                )
            }

            let formatter = DateFormatter()
            formatter.dateStyle = .none
            formatter.timeStyle = .short

            let start = item.startTime ?? defaultEventStartTime(for: item)
            let end = item.endTime ?? defaultEventEndTime(for: item, startTime: start)
            let startText = formatter.string(from: start)
            let endText = formatter.string(from: end)

            return AnyView(
                HStack(spacing: 0) {
                    Text("from ")
                        .font(.body)
                    Text(startText)
                        .font(.body.weight(.semibold))
                    Text(" to ")
                        .font(.body)
                    Text(endText)
                        .font(.body.weight(.semibold))
                }
            )
        }

        private func updatePrimaryDate(for item: PlanningItem, to newDate: Date) {
            let normalizedDate = Calendar.current.startOfDay(for: newDate)
            var draft = PlanningItemDraft(
                kind: item.kind,
                title: item.title,
                icon: item.icon,
                domain: item.domain,
                bucketID: item.bucketID,
                notes: item.notes,
                subItems: item.subItems,
                priority: item.priority,
                repeatRule: item.repeatRule,
                alternateWorkdayConfig: item.alternateWorkdayConfig,
                startDate: item.startDate,
                endDate: item.endDate,
                isAllDay: item.isAllDay,
                startTime: item.startTime,
                endTime: item.endTime,
                location: item.location,
                dueDate: item.dueDate,
                dueTime: item.dueTime,
                estimatedMinutes: item.estimatedMinutes,
                reminderDate: item.reminderDate,
                reminderTime: item.reminderTime,
                reminderLeadTime: item.reminderLeadTime
            )

            switch item.kind {
            case .event:
                let calendar = Calendar.current
                let existingStart = item.startDate ?? normalizedDate
                let existingEnd = item.endDate ?? existingStart
                let daySpan = calendar.dateComponents(
                    [.day],
                    from: calendar.startOfDay(for: existingStart),
                    to: calendar.startOfDay(for: existingEnd)
                ).day ?? 0

                draft.startDate = normalizedDate
                draft.endDate = calendar.date(byAdding: .day, value: max(daySpan, 0), to: normalizedDate) ?? normalizedDate

            case .task:
                draft.dueDate = normalizedDate

            case .reminder:
                draft.reminderDate = normalizedDate
            }

            store.updateItem(itemID: item.id, from: draft)
        }

        @ViewBuilder
        private func simpleTimePopover(for item: PlanningItem) -> some View {
                let hasExplicitTime: Bool = {
                    switch item.kind {
                    case .task:
                        return item.dueTime != nil
                    case .reminder:
                        return item.reminderTime != nil
                    case .event:
                        return false
                    }
                }()

            VStack(alignment: .leading, spacing: AppSpacing.small.rawValue) {
                Text(item.kind == .task ? "Task time" : "Reminder time")
                    .font(.subheadline.weight(.semibold))

                    if hasExplicitTime {
                        DatePicker(
                            "",
                            selection: simpleTimeSelectionBinding(for: item),
                            displayedComponents: [.hourAndMinute]
                        )
                        .labelsHidden()
                    } else {
                        Text("All day")
                            .font(.body.weight(.semibold))

                        Button("Add time") {
                            let defaultTime = pendingTimeSelection
                            switch item.kind {
                            case .task:
                                updateTaskTime(for: item, to: defaultTime)
                            case .reminder:
                                updateReminderTime(for: item, to: defaultTime)
                            case .event:
                                break
                            }
                        }
                        .appButton(.bordered)
                    }

                HStack {
                        Button(hasExplicitTime ? "Set all day" : "Keep all day") {
                        switch item.kind {
                        case .task:
                            updateTaskTime(for: item, to: nil)
                        case .reminder:
                            updateReminderTime(for: item, to: nil)
                        case .event:
                            break
                        }
                        isTimePickerPresented = false
                    }
                    .appButton(.bordered)

                    Spacer()

                    Button("Done") {
                        isTimePickerPresented = false
                    }
                }
            }
            .padding(AppSpacing.standard.rawValue)
            .frame(minWidth: 260)
        }

        private func prepareTimePopover(for item: PlanningItem) {
            switch item.kind {
            case .task:
                pendingTimeSelection = item.dueTime ?? Date()
            case .reminder:
                pendingTimeSelection = item.reminderTime ?? Date()
            case .event:
                let start = item.startTime ?? defaultEventStartTime(for: item)
                pendingEventStartTime = start
                pendingEventEndTime = item.endTime ?? defaultEventEndTime(for: item, startTime: start)
                pendingEventIsAllDay = item.isAllDay
            }
        }

        private func updateTaskTime(for item: PlanningItem, to newValue: Date?) {
            var draft = draft(from: item)
            draft.dueTime = newValue
            store.updateItem(itemID: item.id, from: draft)
        }

        private func updateRepeatRule(for item: PlanningItem, to newValue: RepeatRule, alternateUntilDateISO: String? = nil) {
            var draft = draft(from: item)
            draft.repeatRule = newValue
            if newValue != .alternateWorkdays {
                draft.alternateWorkdayConfig = nil
            } else {
                var config = draft.alternateWorkdayConfig ?? AlternateWorkdayConfig(
                    startingPattern: inferredAlternatePattern(for: item)
                )
                config.untilDateISO = alternateUntilDateISO
                draft.alternateWorkdayConfig = config
            }
            store.updateItem(itemID: item.id, from: draft)
        }

        private func prepareRepeatPopover(for item: PlanningItem) {
            pendingRepeatRule = item.repeatRule

            let fallbackDate = Calendar.current.date(byAdding: .month, value: 3, to: currentPrimaryDate(for: item) ?? Date()) ?? Date()
            if let untilISO = item.alternateWorkdayConfig?.untilDateISO,
               let parsedDate = dateFromISO(untilISO) {
                pendingAlternateHasEndDate = true
                pendingAlternateUntilDate = parsedDate
            } else {
                pendingAlternateHasEndDate = false
                pendingAlternateUntilDate = fallbackDate
            }
        }

        private func availableRepeatRules(for item: PlanningItem) -> [RepeatRule] {
            guard let bucket = store.bucket(for: item.bucketID), bucket.domain == .professional, bucket.isJob else {
                return RepeatRule.allCases.filter { $0 != .alternateWorkdays }
            }
            return RepeatRule.allCases
        }

        private func repeatSummaryLabel(for item: PlanningItem) -> String {
            if item.repeatRule == .alternateWorkdays {
                if let untilISO = item.alternateWorkdayConfig?.untilDateISO,
                   let untilDate = dateFromISO(untilISO) {
                    return "other workday until \(displayDateString(untilDate))"
                }
                return "other workday forever"
            }
            return "\(item.repeatRule.label.lowercased()) forever"
        }

        private func resolvedAlternateUntilDateISO(for item: PlanningItem) -> String? {
            guard pendingRepeatRule == .alternateWorkdays, pendingAlternateHasEndDate else { return nil }
            let minimumDate = currentPrimaryDate(for: item) ?? pendingAlternateUntilDate
            return isoDateString(max(pendingAlternateUntilDate, minimumDate))
        }

        private func inferredAlternatePattern(for item: PlanningItem) -> ABPattern {
            _ = item
            return .a
        }

        private func isoDateString(_ date: Date) -> String {
            let formatter = DateFormatter()
            formatter.calendar = Calendar(identifier: .gregorian)
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.timeZone = TimeZone(secondsFromGMT: 0)
            formatter.dateFormat = "yyyy-MM-dd"
            return formatter.string(from: date)
        }

        private func dateFromISO(_ isoDate: String) -> Date? {
            let formatter = DateFormatter()
            formatter.calendar = Calendar(identifier: .gregorian)
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.timeZone = TimeZone(secondsFromGMT: 0)
            formatter.dateFormat = "yyyy-MM-dd"
            return formatter.date(from: isoDate)
        }

        private func displayDateString(_ date: Date) -> String {
            let formatter = DateFormatter()
            formatter.dateStyle = .medium
            formatter.timeStyle = .none
            return formatter.string(from: date)
        }

        private func updatePriority(for item: PlanningItem, to newValue: PriorityLevel) {
            var draft = draft(from: item)
            draft.priority = newValue
            store.updateItem(itemID: item.id, from: draft)
        }

        private func updateLocation(for item: PlanningItem, to newValue: String) {
            var draft = draft(from: item)
            draft.location = newValue.trimmingCharacters(in: .whitespacesAndNewlines)
            store.updateItem(itemID: item.id, from: draft)
        }

        private func updateReminderTime(for item: PlanningItem, to newValue: Date?) {
            var draft = draft(from: item)
            draft.reminderTime = newValue
            store.updateItem(itemID: item.id, from: draft)
        }

        private func updateEventTiming(for item: PlanningItem, startTime: Date, endTime: Date, isAllDay: Bool) {
            var draft = draft(from: item)
            draft.isAllDay = isAllDay

            if isAllDay {
                draft.startTime = nil
                draft.endTime = nil
            } else {
                draft.startTime = startTime
                draft.endTime = max(endTime, startTime)
            }

            store.updateItem(itemID: item.id, from: draft)
        }

        private func draft(from item: PlanningItem) -> PlanningItemDraft {
            PlanningItemDraft(
                kind: item.kind,
                title: item.title,
                icon: item.icon,
                domain: item.domain,
                bucketID: item.bucketID,
                notes: item.notes,
                subItems: item.subItems,
                priority: item.priority,
                repeatRule: item.repeatRule,
                alternateWorkdayConfig: item.alternateWorkdayConfig,
                startDate: item.startDate,
                endDate: item.endDate,
                isAllDay: item.isAllDay,
                startTime: item.startTime,
                endTime: item.endTime,
                location: item.location,
                dueDate: item.dueDate,
                dueTime: item.dueTime,
                estimatedMinutes: item.estimatedMinutes,
                reminderDate: item.reminderDate,
                reminderTime: item.reminderTime,
                reminderLeadTime: item.reminderLeadTime
            )
        }

        private func defaultEventStartTime(for item: PlanningItem) -> Date {
            if let date = item.startDate {
                return Calendar.current.date(bySettingHour: 9, minute: 0, second: 0, of: date) ?? date
            }
            return Date()
        }

        private func defaultEventEndTime(for item: PlanningItem, startTime: Date) -> Date {
            let baseDate = item.endDate ?? item.startDate ?? Date()
            let fallbackEnd = Calendar.current.date(byAdding: .hour, value: 1, to: startTime) ?? startTime
            let resolvedBase = Calendar.current.date(bySettingHour: 10, minute: 0, second: 0, of: baseDate) ?? fallbackEnd
            return max(resolvedBase, fallbackEnd)
        }

        private func primaryDateBinding(for item: PlanningItem) -> Binding<Date> {
            Binding(
                get: { pendingDateSelection },
                set: { newValue in
                    pendingDateSelection = newValue
                    updatePrimaryDate(for: item, to: newValue)
                }
            )
        }

        private func prioritySelectionBinding(for item: PlanningItem) -> Binding<PriorityLevel> {
            Binding(
                get: { pendingPriority },
                set: { newValue in
                    pendingPriority = newValue
                    updatePriority(for: item, to: newValue)
                }
            )
        }

        private func eventAllDayBinding(for item: PlanningItem) -> Binding<Bool> {
            Binding(
                get: { pendingEventIsAllDay },
                set: { isAllDay in
                    pendingEventIsAllDay = isAllDay
                    updateEventTiming(
                        for: item,
                        startTime: pendingEventStartTime,
                        endTime: pendingEventEndTime,
                        isAllDay: isAllDay
                    )
                }
            )
        }

        private func eventStartTimeBinding(for item: PlanningItem) -> Binding<Date> {
            Binding(
                get: { pendingEventStartTime },
                set: { newValue in
                    pendingEventStartTime = newValue
                    if pendingEventEndTime < newValue {
                        pendingEventEndTime = Calendar.current.date(byAdding: .hour, value: 1, to: newValue) ?? newValue
                    }
                    updateEventTiming(
                        for: item,
                        startTime: pendingEventStartTime,
                        endTime: pendingEventEndTime,
                        isAllDay: false
                    )
                }
            )
        }

        private func eventEndTimeBinding(for item: PlanningItem) -> Binding<Date> {
            Binding(
                get: { pendingEventEndTime },
                set: { newValue in
                    let adjusted = max(newValue, pendingEventStartTime)
                    pendingEventEndTime = adjusted
                    updateEventTiming(
                        for: item,
                        startTime: pendingEventStartTime,
                        endTime: pendingEventEndTime,
                        isAllDay: false
                    )
                }
            )
        }

        private func simpleTimeSelectionBinding(for item: PlanningItem) -> Binding<Date> {
            Binding(
                get: { pendingTimeSelection },
                set: { newValue in
                    pendingTimeSelection = newValue
                    switch item.kind {
                    case .task:
                        updateTaskTime(for: item, to: newValue)
                    case .reminder:
                        updateReminderTime(for: item, to: newValue)
                    case .event:
                        break
                    }
                }
            )
        }

        private func domainBinding(for itemID: UUID) -> Binding<BucketDomain> {
            Binding(
                get: { store.item(for: itemID)?.domain ?? .personal },
                set: { store.updateItemDomain(itemID: itemID, domain: $0) }
            )
        }

        private func bucketBinding(for itemID: UUID) -> Binding<UUID> {
            Binding(
                get: {
                    if let item = store.item(for: itemID) {
                        return item.bucketID
                    }
                    return store.defaultBucket(for: .personal).id
                },
                set: { store.updateItemBucket(itemID: itemID, bucketID: $0) }
            )
        }
}

