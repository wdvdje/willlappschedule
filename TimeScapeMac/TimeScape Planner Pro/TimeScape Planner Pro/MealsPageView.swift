import SwiftUI

struct MealsPageView: View {
    @State private var weekStartDate = Calendar.current.date(from: Calendar.current.dateComponents([.yearForWeekOfYear, .weekOfYear], from: Date())) ?? Date()
    @State private var weeklyPlan: WeeklyMealPlan?
    @State private var searchText = ""
    @State private var selectedDayIndex = 0
    @State private var showingGroceryList = false
    @State private var showingNutritionReport = false
    @State private var showingGroceryTasks = false
    @State private var showingIngredientPicker = false
    @State private var showingMealEditor = false
    @State private var selectedIngredient: MealIngredient?

    @State private var selectedCellDate: Date?
    @State private var selectedCellMealType: MealType = .breakfast
    @State private var selectedMealID: UUID?

    @State private var editorTitle = ""
    @State private var editorDescription = ""
    @State private var editorIngredients: [MealIngredient] = []
    @State private var editorIsTemplate = false

    @State private var templates: [MealModel] = []
    @State private var recentMeals: [MealModel] = []

    @State private var groupingMode: MealsGroupingMode = .day
    @State private var filterMode: MealsFilterMode = .all

    private let storage = MealsStorageManager.shared
    private let mealLabelColumnWidth: CGFloat = 96
    private let minimumDayColumnWidth: CGFloat = 104
    private let mealHeaderHeight: CGFloat = 52
    private let minimumMealRowHeight: CGFloat = 94
    private let gridContentPadding: CGFloat = 8
    private var daysOfWeek: [Date] {
        (0..<7).compactMap { offset in
            Calendar.current.date(byAdding: .day, value: offset, to: weekStartDate)
        }
    }

    private var visibleMealTypes: [MealType] {
        if let type = filterMode.mealType {
            return [type]
        }
        return MealType.allCases
    }

    private var mealsPlannedCount: Int {
        guard let plan = weeklyPlan else { return 0 }
        return plan.dailyPlans.reduce(into: 0) { result, day in
            if day.breakfast != nil { result += 1 }
            if day.lunch != nil { result += 1 }
            if day.dinner != nil { result += 1 }
        }
    }

    private var weeklyNutrition: NutritionFacts {
        guard let plan = weeklyPlan else { return NutritionFacts() }
        return MealNutritionCalculator.calculateWeeklyNutrition(from: plan)
    }

    private var filteredMealSnapshots: [String] {
        let allMeals = daysOfWeek.flatMap { date in
            MealType.allCases.compactMap { mealType -> String? in
                if let filterType = filterMode.mealType, filterType != mealType {
                    return nil
                }
                guard let meal = mealFor(date: date, mealType: mealType) else { return nil }
                let dayName = dayName(for: date)
                return "\(dayName) \(mealType.rawValue): \(meal.title)"
            }
        }

        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !query.isEmpty else { return allMeals }
        return allMeals.filter { $0.lowercased().contains(query) }
    }

    private var groupedPlanningSections: [MealsSidebarSection] {
        switch groupingMode {
        case .day:
            return daysOfWeek.compactMap { date in
                let dayItems = visibleMealTypes.compactMap { mealType -> String? in
                    guard let meal = mealFor(date: date, mealType: mealType) else { return nil }
                    return "\(mealType.rawValue): \(meal.title)"
                }

                guard !dayItems.isEmpty else { return nil }
                return MealsSidebarSection(title: dayName(for: date), items: dayItems)
            }
        case .mealType:
            return visibleMealTypes.compactMap { mealType in
                let entries = daysOfWeek.compactMap { date -> String? in
                    guard let meal = mealFor(date: date, mealType: mealType) else { return nil }
                    return "\(dayName(for: date)): \(meal.title)"
                }
                guard !entries.isEmpty else { return nil }
                return MealsSidebarSection(title: mealType.rawValue, items: entries)
            }
        }
    }

    private var inlineNutrition: NutritionFacts {
        MealNutritionCalculator.calculateNutrition(from: editorIngredients)
    }

    private var canSaveInlineMeal: Bool {
        !editorTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !editorIngredients.isEmpty && selectedCellDate != nil
    }

    private var minimumMealsGridWidth: CGFloat {
        mealLabelColumnWidth + (CGFloat(daysOfWeek.count) * minimumDayColumnWidth)
    }

    private var minimumMealsGridHeight: CGFloat {
        mealHeaderHeight + (CGFloat(max(visibleMealTypes.count, 1)) * minimumMealRowHeight)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            mealsHeroHeader

            HStack(alignment: .top, spacing: 12) {
                mealsSidebar
                    .frame(width: 320, alignment: .leading)

                mealsPlannerSurface
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                    .layoutPriority(1)
            }
        }
        .padding(14)
        .frame(minWidth: 900, minHeight: 580)
        .background(
            LinearGradient(
                colors: [
                    Color(nsColor: .windowBackgroundColor),
                    Color.white.opacity(0.92),
                    Color.orange.opacity(0.035)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
        .onAppear {
            loadWeeklyPlan()
            refreshLibrarySections()
            if selectedCellDate == nil {
                selectedCellDate = daysOfWeek[safe: selectedDayIndex] ?? weekStartDate
                selectedCellMealType = .breakfast
                loadEditorForSelection()
            }
        }
        .sheet(isPresented: $showingGroceryList) {
            GroceryListSheet(weeklyPlan: weeklyPlan, isPresented: $showingGroceryList)
        }
        .sheet(isPresented: $showingGroceryTasks) {
            GroceryTasksSheet(isPresented: $showingGroceryTasks)
        }
        .sheet(isPresented: $showingNutritionReport) {
            NutritionReportSheet(weeklyPlan: weeklyPlan, isPresented: $showingNutritionReport)
        }
        .sheet(isPresented: $showingIngredientPicker) {
            IngredientPickerSheet(
                ingredient: $selectedIngredient,
                isPresented: $showingIngredientPicker,
                onAdd: { ingredient in
                    editorIngredients.append(ingredient)
                    selectedIngredient = nil
                }
            )
            .frame(minWidth: 460, idealWidth: 520, maxWidth: 640, minHeight: 360, idealHeight: 420, maxHeight: 560)
        }
        .sheet(isPresented: $showingMealEditor) {
            MealEditorSheet(
                date: $selectedCellDate,
                mealType: $selectedCellMealType,
                isPresented: $showingMealEditor,
                mealTitle: $editorTitle,
                mealDescription: $editorDescription,
                ingredients: $editorIngredients,
                isTemplate: $editorIsTemplate,
                hasExistingMeal: selectedMealID != nil,
                onSave: {
                    saveInlineMeal()
                },
                onRemove: {
                    removeSelectedMealFromWeek()
                },
                onStartFresh: {
                    startInlineNewMeal()
                }
            )
            .frame(minWidth: 560, idealWidth: 680, maxWidth: 860, minHeight: 420, idealHeight: 500, maxHeight: 700)
        }
    }

    private var mealsHeroHeader: some View {
        HStack(alignment: .center, spacing: 10) {
            ZStack {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [Color.indigo.opacity(0.88), Color.purple.opacity(0.72)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                Image(systemName: "fork.knife")
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(.white)
            }
            .frame(width: 46, height: 46)

            VStack(alignment: .leading, spacing: 2) {
                Text("Meals")
                    .font(.title2.weight(.semibold))
                Text("Plan your week, track macros, and manage grocery tasks")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            Button {
                selectedCellDate = daysOfWeek[safe: selectedDayIndex] ?? weekStartDate
                selectedCellMealType = filterMode.mealType ?? .breakfast
                startInlineNewMeal()
                showingMealEditor = true
            } label: {
                Label("Quick Add", systemImage: "plus")
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.small)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Color.white.opacity(0.70))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(Color.orange.opacity(0.16), lineWidth: 1)
        )
    }

    private var mealsSidebar: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 9) {
                SectionHeader(title: "Planner Controls", eyebrow: "Week")

                GroupBox {
                    VStack(alignment: .leading, spacing: 8) {
                        weekNavigationBar

                        TextField("Search planned meals", text: $searchText)
                            .textFieldStyle(.roundedBorder)

                        Picker("Group by", selection: $groupingMode) {
                            ForEach(MealsGroupingMode.allCases) { mode in
                                Text(mode.label).tag(mode)
                            }
                        }
                        .pickerStyle(.segmented)

                        Picker("Filter", selection: $filterMode) {
                            ForEach(MealsFilterMode.allCases) { mode in
                                Text(mode.label).tag(mode)
                            }
                        }
                        .pickerStyle(.segmented)

                        Picker("Default day", selection: $selectedDayIndex) {
                            ForEach(Array(daysOfWeek.enumerated()), id: \.offset) { index, date in
                                Text(dayName(for: date)).tag(index)
                            }
                        }
                        .pickerStyle(.menu)
                        .onChange(of: selectedDayIndex) { _, index in
                            selectedCellDate = daysOfWeek[safe: index]
                            if selectedCellDate != nil {
                                loadEditorForSelection()
                            }
                        }
                    }
                }

                GroupBox {
                    HStack(spacing: 8) {
                        Button {
                            showingGroceryList = true
                        } label: {
                            Label("Grocery", systemImage: "checklist")
                        }
                        .buttonStyle(.bordered)

                        Button {
                            showingNutritionReport = true
                        } label: {
                            Label("Nutrition", systemImage: "chart.bar")
                        }
                        .buttonStyle(.bordered)

                        Button {
                            showingGroceryTasks = true
                        } label: {
                            Label("Tasks", systemImage: "checkmark.circle")
                        }
                        .buttonStyle(.bordered)
                    }
                }

                GroupBox("Planned This Week") {
                    VStack(alignment: .leading, spacing: 6) {
                        if groupedPlanningSections.isEmpty {
                            Text("No meals planned yet")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        } else {
                            ForEach(groupedPlanningSections.prefix(1)) { section in
                                Text(section.title)
                                    .font(.caption.weight(.semibold))
                                ForEach(section.items.prefix(5), id: \.self) { item in
                                    Text("• \(item)")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }

                GroupBox("Templates") {
                    VStack(alignment: .leading, spacing: 6) {
                        if templates.isEmpty {
                            Text("No templates yet")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        } else {
                            ForEach(templates.prefix(4), id: \.id) { template in
                                Button(template.title) {
                                    applyTemplate(template)
                                }
                                .buttonStyle(.plain)
                                .font(.caption)
                            }
                        }
                    }
                }

                GroupBox("Recent Meals") {
                    VStack(alignment: .leading, spacing: 6) {
                        if recentMeals.isEmpty {
                            Text("No recent meals yet")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        } else {
                            ForEach(recentMeals.prefix(5), id: \.id) { meal in
                                Text(meal.title)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
            .padding(.trailing, 8)
        }
        .controlSize(.small)
    }

    private var mealsPlannerSurface: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Metric cards above the grid (non-scrollable)
            HStack(alignment: .top, spacing: 12) {
                MetricCard(
                    title: "Meals Planned",
                    value: "\(mealsPlannedCount)",
                    detail: mealsPlannedCount == 0 ? "Start with breakfast on your selected day" : "Across breakfast, lunch, and dinner",
                    tint: .orange
                )

                MetricCard(
                    title: "Weekly Calories",
                    value: "\(weeklyNutrition.calories)",
                    detail: "Protein \(Int(weeklyNutrition.protein))g · Carbs \(Int(weeklyNutrition.carbs))g · Fat \(Int(weeklyNutrition.fat))g",
                    tint: .red
                )
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            // Meal grid with calendar-like styling
            GeometryReader { proxy in
                let availableWidth = max(proxy.size.width - (gridContentPadding * 2), minimumMealsGridWidth)
                let availableHeight = max(proxy.size.height - (gridContentPadding * 2), minimumMealsGridHeight)

                ScrollView(.horizontal) {
                    mealsGrid(availableWidth: availableWidth, availableHeight: availableHeight)
                        .padding(gridContentPadding)
                        .frame(minHeight: availableHeight, alignment: .top)
                }
            }
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(Color.white.opacity(0.78))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(Color.orange.opacity(0.12), lineWidth: 1)
            )
        }
    }

    private var weekNavigationBar: some View {
        HStack(spacing: 10) {
            Button {
                weekStartDate = Calendar.current.date(byAdding: .day, value: -7, to: weekStartDate) ?? weekStartDate
                loadWeeklyPlan()
            } label: {
                Image(systemName: "chevron.left")
            }
            .buttonStyle(.bordered)

            VStack(alignment: .center, spacing: 1) {
                Text(weekRange)
                    .font(.subheadline.weight(.semibold))
                Text("Week of \(weekStartDate.formatted(date: .abbreviated, time: .omitted))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity)

            Button {
                weekStartDate = Calendar.current.date(byAdding: .day, value: 7, to: weekStartDate) ?? weekStartDate
                loadWeeklyPlan()
            } label: {
                Image(systemName: "chevron.right")
            }
            .buttonStyle(.bordered)
        }
    }

    private func dayName(for date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "EEEE"
        return formatter.string(from: date)
    }

    private var weekRange: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "MMM d"
        let endDate = Calendar.current.date(byAdding: .day, value: 6, to: weekStartDate) ?? weekStartDate
        return "\(formatter.string(from: weekStartDate)) - \(formatter.string(from: endDate))"
    }

    private func mealsGrid(availableWidth: CGFloat, availableHeight: CGFloat) -> some View {
        let dayColumnWidth = max((availableWidth - mealLabelColumnWidth) / CGFloat(max(daysOfWeek.count, 1)), minimumDayColumnWidth)
        let rowCount = CGFloat(max(visibleMealTypes.count, 1))
        let rowSpacingTotal = CGFloat(max(visibleMealTypes.count - 1, 0)) * 8
        let rowPaddingTotal = rowCount * 8
        let headerFootprint = mealHeaderHeight + 8
        let availableForRows = max(availableHeight - headerFootprint - rowSpacingTotal - rowPaddingTotal, rowCount * 64)
        let mealRowHeight = max(availableForRows / rowCount, 64)

        return VStack(alignment: .leading, spacing: 8) {
            // Header row with days
            HStack(spacing: 8) {
                Text("Meal")
                    .frame(width: mealLabelColumnWidth, alignment: .leading)
                    .padding(8)
                    .font(.caption.weight(.semibold))

                ForEach(daysOfWeek, id: \.self) { date in
                    dayHeader(for: date)
                        .frame(maxWidth: .infinity)
                }
            }
            .frame(height: mealHeaderHeight)
            .padding(.horizontal, 4)
            .padding(.vertical, 4)

            // Meal rows
            ForEach(visibleMealTypes, id: \.self) { mealType in
                mealRow(for: mealType, dayColumnWidth: dayColumnWidth, rowHeight: mealRowHeight)
            }
        }
        .frame(width: max(availableWidth, minimumMealsGridWidth), alignment: .leading)
        .frame(height: availableHeight, alignment: .top)
        .background(Color.white.opacity(0.92))
    }

    private func dayHeader(for date: Date) -> some View {
        let dayName = Calendar.current.shortWeekdaySymbols[Calendar.current.component(.weekday, from: date) - 1]
        let dayNumber = Calendar.current.component(.day, from: date)
        let isToday = Calendar.current.isDateInToday(date)

        return VStack(spacing: 4) {
            Text(dayName)
                .font(.caption.weight(.semibold))
                .foregroundStyle(isToday ? .primary : .secondary)
            Text("\(dayNumber)")
                .font(.caption2)
                .foregroundStyle(isToday ? .primary : .secondary)
        }
        .frame(height: mealHeaderHeight)
        .padding(6)
        .background(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .fill(isToday ? Color.orange.opacity(0.12) : Color(nsColor: .windowBackgroundColor))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .stroke(isToday ? Color.orange.opacity(0.4) : Color(nsColor: .separatorColor).opacity(0.5), lineWidth: 1)
        )
        .padding(.horizontal, 4)
    }

    private func mealRow(for mealType: MealType, dayColumnWidth: CGFloat, rowHeight: CGFloat) -> some View {
        HStack(spacing: 8) {
            HStack(spacing: 6) {
                Text(mealType.emoji)
                    .font(.body)
                Text(mealType.rawValue)
                    .font(.caption.weight(.semibold))
            }
            .frame(width: mealLabelColumnWidth, alignment: .leading)
            .padding(8)
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(Color(nsColor: .windowBackgroundColor))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(Color(nsColor: .separatorColor).opacity(0.5), lineWidth: 1)
            )

            ForEach(daysOfWeek, id: \.self) { date in
                mealCell(for: date, mealType: mealType, rowHeight: rowHeight)
            }
        }
        .frame(height: rowHeight)
        .padding(.horizontal, 4)
        .padding(.vertical, 4)
    }

    private func mealCell(for date: Date, mealType: MealType, rowHeight: CGFloat) -> some View {
        let meal = mealFor(date: date, mealType: mealType)
        let isSelectedCell = isSameSelectedCell(date: date, mealType: mealType)

        return Button {
            selectedCellDate = date
            selectedCellMealType = mealType
            if let index = daysOfWeek.firstIndex(where: { Calendar.current.isDate($0, inSameDayAs: date) }) {
                selectedDayIndex = index
            }
            loadEditorForSelection()
            showingMealEditor = true
        } label: {
            VStack(alignment: .center, spacing: 4) {
                if let meal = meal {
                    VStack(alignment: .center, spacing: 2) {
                        Text(meal.title)
                            .font(.caption.weight(.semibold))
                            .lineLimit(1)
                        if let nutrition = meal.nutritionFacts {
                            Text("\(nutrition.calories) cal")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                    }
                } else {
                    Text("+ Add")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            .frame(maxWidth: .infinity, minHeight: rowHeight, maxHeight: .infinity)
            .padding(6)
        }
        .buttonStyle(.plain)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(isSelectedCell ? Color.orange.opacity(0.2) : (meal != nil ? Color.orange.opacity(0.08) : Color(nsColor: .windowBackgroundColor)))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(
                    isSelectedCell ? Color.orange.opacity(0.6) : (meal != nil ? Color.orange.opacity(0.3) : Color(nsColor: .separatorColor).opacity(0.4)),
                    lineWidth: isSelectedCell ? 1.5 : 1
                )
        )
        .contentShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .padding(.horizontal, 4)
    }

    private func mealFor(date: Date, mealType: MealType) -> MealModel? {
        weeklyPlan?.getDayPlan(for: date).flatMap { dayPlan -> MealModel? in
            switch mealType {
            case .breakfast: return dayPlan.breakfast
            case .lunch: return dayPlan.lunch
            case .dinner: return dayPlan.dinner
            }
        }
    }

    private func isSameSelectedCell(date: Date, mealType: MealType) -> Bool {
        guard let selectedCellDate else { return false }
        return Calendar.current.isDate(selectedCellDate, inSameDayAs: date) && selectedCellMealType == mealType
    }

    private func loadEditorForSelection() {
        guard let selectedCellDate else { return }
        let selectedMeal = mealFor(date: selectedCellDate, mealType: selectedCellMealType)

        selectedMealID = selectedMeal?.id
        editorTitle = selectedMeal?.title ?? ""
        editorDescription = selectedMeal?.description ?? ""
        editorIngredients = selectedMeal?.ingredients ?? []
        editorIsTemplate = selectedMeal?.isTemplate ?? false
    }

    private func startInlineNewMeal() {
        selectedMealID = nil
        editorTitle = ""
        editorDescription = ""
        editorIngredients = []
        editorIsTemplate = false
    }

    private func saveInlineMeal() {
        guard let selectedCellDate else { return }

        let normalizedTitle = editorTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedTitle.isEmpty else { return }

        var meal = MealModel(
            id: selectedMealID ?? UUID(),
            title: normalizedTitle,
            description: editorDescription,
            ingredients: editorIngredients,
            isTemplate: editorIsTemplate
        )
        meal.nutritionFacts = MealNutritionCalculator.calculateNutrition(from: editorIngredients)

        storage.saveMeal(meal)
        storage.addMealToWeek(meal, for: selectedCellDate, type: selectedCellMealType)
        loadWeeklyPlan()
        refreshLibrarySections()
        selectedMealID = meal.id
    }

    private func removeSelectedMealFromWeek() {
        guard let selectedCellDate else { return }
        storage.removeMealFromWeek(for: selectedCellDate, type: selectedCellMealType)
        loadWeeklyPlan()
        refreshLibrarySections()
        startInlineNewMeal()
    }

    private func refreshLibrarySections() {
        templates = storage.getAllTemplates().sorted { $0.lastModified > $1.lastModified }
        recentMeals = storage.getAllMeals().sorted { $0.lastModified > $1.lastModified }
    }

    private func applyTemplate(_ template: MealModel) {
        if selectedCellDate == nil {
            selectedCellDate = daysOfWeek[safe: selectedDayIndex] ?? weekStartDate
        }
        guard let selectedCellDate else { return }
        storage.addMealToWeek(template, for: selectedCellDate, type: selectedCellMealType)
        loadWeeklyPlan()
        loadEditorForSelection()
    }

    private func loadWeeklyPlan() {
        weeklyPlan = storage.getWeeklyPlan(for: weekStartDate)
        if weeklyPlan == nil {
            // Create empty plan for the week
            weeklyPlan = WeeklyMealPlan(weekStartDate: weekStartDate)
        }
    }
}

private struct MealsSidebarSection: Identifiable {
    let id = UUID()
    let title: String
    let items: [String]
}

private enum MealsGroupingMode: String, CaseIterable, Identifiable {
    case day
    case mealType

    var id: String { rawValue }

    var label: String {
        switch self {
        case .day: return "By Day"
        case .mealType: return "By Meal"
        }
    }
}

private enum MealsFilterMode: String, CaseIterable, Identifiable {
    case all
    case breakfast
    case lunch
    case dinner

    var id: String { rawValue }

    var label: String {
        switch self {
        case .all: return "All"
        case .breakfast: return "Breakfast"
        case .lunch: return "Lunch"
        case .dinner: return "Dinner"
        }
    }

    var mealType: MealType? {
        switch self {
        case .all: return nil
        case .breakfast: return .breakfast
        case .lunch: return .lunch
        case .dinner: return .dinner
        }
    }
}

private extension Array {
    subscript(safe index: Int) -> Element? {
        guard indices.contains(index) else { return nil }
        return self[index]
    }
}

// MARK: - Meal Editor Sheet

struct MealEditorSheet: View {
    @Binding var date: Date?
    @Binding var mealType: MealType
    @Binding var isPresented: Bool
    @Binding var mealTitle: String
    @Binding var mealDescription: String
    @Binding var ingredients: [MealIngredient]
    @Binding var isTemplate: Bool
    let hasExistingMeal: Bool
    var onSave: () -> Void
    var onRemove: () -> Void
    var onStartFresh: () -> Void

    @State private var showingIngredientPicker = false
    @State private var selectedIngredient: MealIngredient?

    private var saveDisabled: Bool {
        mealTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || ingredients.isEmpty || date == nil
    }

    private var removeDisabled: Bool {
        !hasExistingMeal || date == nil
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    GroupBox("Meal Details") {
                        VStack(alignment: .leading, spacing: 12) {
                            VStack(alignment: .leading, spacing: 6) {
                                Text("Meal name")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(.secondary)
                                TextField("Enter a meal name", text: $mealTitle)
                                    .textFieldStyle(.roundedBorder)
                            }

                            VStack(alignment: .leading, spacing: 6) {
                                Text("Description")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(.secondary)
                                TextField("Optional notes", text: $mealDescription)
                                    .textFieldStyle(.roundedBorder)
                            }

                            Toggle("Save as template", isOn: $isTemplate)
                                .toggleStyle(.checkbox)
                        }
                        .padding(.top, 4)
                    }

                    GroupBox("Ingredients") {
                        VStack(alignment: .leading, spacing: 10) {
                            if ingredients.isEmpty {
                                Text("No ingredients yet")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .padding(.vertical, 4)
                            } else {
                                ScrollView {
                                    LazyVStack(spacing: 8) {
                                        ForEach(ingredients) { ingredient in
                                            HStack(spacing: 10) {
                                                VStack(alignment: .leading, spacing: 2) {
                                                    Text(ingredient.name)
                                                        .font(.body.weight(.semibold))
                                                    Text("\(ingredient.quantity) \(ingredient.unit)")
                                                        .font(.caption)
                                                        .foregroundStyle(.secondary)
                                                }

                                                Spacer(minLength: 8)

                                                Text("\(Int((ingredient.caloriesPer100g * ingredient.quantity) / 100)) cal")
                                                    .font(.caption.weight(.semibold))
                                                    .foregroundStyle(.secondary)

                                                Button {
                                                    ingredients.removeAll { $0.id == ingredient.id }
                                                } label: {
                                                    Image(systemName: "xmark.circle.fill")
                                                        .foregroundStyle(.red)
                                                }
                                                .buttonStyle(.plain)
                                            }
                                            .padding(10)
                                            .background(
                                                RoundedRectangle(cornerRadius: 10, style: .continuous)
                                                    .fill(Color(nsColor: .windowBackgroundColor))
                                            )
                                            .overlay(
                                                RoundedRectangle(cornerRadius: 10, style: .continuous)
                                                    .stroke(Color(nsColor: .separatorColor).opacity(0.45), lineWidth: 1)
                                            )
                                        }
                                    }
                                }
                                .frame(maxHeight: 220)
                            }

                            Button {
                                showingIngredientPicker = true
                            } label: {
                                Label("Add Ingredient", systemImage: "plus.circle.fill")
                            }
                            .buttonStyle(.bordered)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.top, 4)
                    }

                    if !ingredients.isEmpty {
                        GroupBox("Nutrition") {
                            let nutrition = MealNutritionCalculator.calculateNutrition(from: ingredients)
                            Grid(alignment: .leading, horizontalSpacing: 10, verticalSpacing: 8) {
                                GridRow {
                                    nutritionChip(label: "Calories", value: "\(nutrition.calories)")
                                    nutritionChip(label: "Protein", value: String(format: "%.1fg", nutrition.protein))
                                }

                                GridRow {
                                    nutritionChip(label: "Carbs", value: String(format: "%.1fg", nutrition.carbs))
                                    nutritionChip(label: "Fat", value: String(format: "%.1fg", nutrition.fat))
                                }
                            }
                        }
                    }

                    HStack {
                        Button("Start Fresh") {
                            onStartFresh()
                        }
                        .buttonStyle(.bordered)

                        Spacer()
                    }
                }
                .padding(24)
                .frame(maxWidth: 700, alignment: .leading)
                .frame(maxWidth: .infinity, alignment: .center)
            }
            .controlSize(.small)
            .frame(minWidth: 560, minHeight: 420)
            .navigationTitle("\(hasExistingMeal ? "Edit" : "Add") \(mealType.rawValue)")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        isPresented = false
                    }
                }

                ToolbarItemGroup(placement: .confirmationAction) {
                    Button("Remove") {
                        onRemove()
                        isPresented = false
                    }
                    .disabled(removeDisabled)

                    Button("Save Meal") {
                        onSave()
                        isPresented = false
                    }
                    .disabled(saveDisabled)
                }
            }
            .sheet(isPresented: $showingIngredientPicker) {
                IngredientPickerSheet(
                    ingredient: $selectedIngredient,
                    isPresented: $showingIngredientPicker,
                    onAdd: { ingredient in
                        ingredients.append(ingredient)
                        selectedIngredient = nil
                    }
                )
                .frame(minWidth: 460, idealWidth: 520, maxWidth: 640, minHeight: 360, idealHeight: 420, maxHeight: 560)
            }
        }
    }

    private func nutritionChip(label: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.headline)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .fill(Color(nsColor: .windowBackgroundColor))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .stroke(Color(nsColor: .separatorColor).opacity(0.45), lineWidth: 1)
        )
    }
}

// MARK: - Ingredient Picker Sheet

struct IngredientPickerSheet: View {
    @Binding var ingredient: MealIngredient?
    @Binding var isPresented: Bool
    var onAdd: (MealIngredient) -> Void

    @State private var ingredientName = ""
    @State private var quantity: Double = 100
    @State private var unit = "g"
    @State private var calories: Double = 0
    @State private var protein: Double = 0
    @State private var carbs: Double = 0
    @State private var fat: Double = 0

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    GroupBox("Ingredient") {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Name")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(.secondary)

                            TextField("Enter ingredient name", text: $ingredientName)
                                .textFieldStyle(.roundedBorder)
                                .onChange(of: ingredientName) { _, name in
                                    if name.count > 2, calories == 0 {
                                        if let estimate = MealNutritionCalculator.getCommonIngredientEstimate(name: name) {
                                            calories = Double(estimate.calories)
                                            protein = estimate.protein
                                            carbs = estimate.carbs
                                            fat = estimate.fat
                                        }
                                    }
                                }
                        }
                        .padding(.top, 4)
                    }

                    GroupBox("Quantity") {
                        HStack(spacing: 10) {
                            VStack(alignment: .leading, spacing: 6) {
                                Text("Amount")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(.secondary)
                                TextField("Amount", value: $quantity, format: .number)
                                    .textFieldStyle(.roundedBorder)
                            }

                            VStack(alignment: .leading, spacing: 6) {
                                Text("Unit")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(.secondary)
                                Picker("Unit", selection: $unit) {
                                    ForEach(["g", "oz", "cup", "tbsp", "tsp"], id: \.self) { u in
                                        Text(u).tag(u)
                                    }
                                }
                                .labelsHidden()
                                .frame(width: 110, alignment: .leading)
                            }
                        }
                        .padding(.top, 4)
                    }

                    GroupBox("Nutrition (per 100g)") {
                        VStack(alignment: .leading, spacing: 10) {
                            nutritionFieldRow(label: "Calories", value: $calories)
                            nutritionFieldRow(label: "Protein (g)", value: $protein)
                            nutritionFieldRow(label: "Carbs (g)", value: $carbs)
                            nutritionFieldRow(label: "Fat (g)", value: $fat)
                        }
                        .padding(.top, 4)
                    }
                }
                .padding(20)
                .frame(maxWidth: 560, alignment: .leading)
                .frame(maxWidth: .infinity, alignment: .center)
            }
            .controlSize(.small)
            .frame(minWidth: 460, minHeight: 360)
            .navigationTitle("Add Ingredient")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        isPresented = false
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") {
                        let newIngredient = MealIngredient(
                            name: ingredientName,
                            quantity: quantity,
                            unit: unit,
                            caloriesPer100g: calories,
                            protein: protein,
                            carbs: carbs,
                            fat: fat
                        )
                        onAdd(newIngredient)
                        isPresented = false
                    }
                    .disabled(ingredientName.isEmpty || quantity <= 0)
                }
            }
        }
    }

    private func nutritionFieldRow(label: String, value: Binding<Double>) -> some View {
        HStack(spacing: 10) {
            Text(label)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)

            TextField("", value: value, format: .number)
                .textFieldStyle(.roundedBorder)
                .multilineTextAlignment(.trailing)
                .frame(width: 140)
        }
    }
}

// MARK: - Grocery List Sheet

struct GroceryListSheet: View {
    var weeklyPlan: WeeklyMealPlan?
    @Binding var isPresented: Bool

    @State private var checkedItems: Set<String> = []
    @State private var showingCreateTaskSheet = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                if let plan = weeklyPlan, !plan.dailyPlans.isEmpty {
                    List(selection: $checkedItems) {
                        let aggregatedIngredients = aggregateIngredients(from: plan)
                        ForEach(aggregatedIngredients.sorted(by: { $0.key < $1.key }), id: \.key) { name, totalQty in
                            HStack {
                                Image(systemName: checkedItems.contains(name) ? "checkmark.circle.fill" : "circle")
                                    .foregroundStyle(checkedItems.contains(name) ? .blue : .gray)
                                    .onTapGesture {
                                        if checkedItems.contains(name) {
                                            checkedItems.remove(name)
                                        } else {
                                            checkedItems.insert(name)
                                        }
                                    }

                                VStack(alignment: .leading, spacing: 2) {
                                    Text(name.capitalized)
                                    Text("\(totalQty, specifier: "%.1f") g")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }

                                Spacer()

                                Button {
                                    addItemAsSubitem(name, quantity: totalQty)
                                } label: {
                                    Image(systemName: "plus.circle")
                                        .foregroundStyle(.blue)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                } else {
                    VStack {
                        Text("No meals planned for this week")
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                }

                // Bottom action bar
                if !checkedItems.isEmpty {
                    VStack(spacing: 8) {
                        Divider()

                        HStack(spacing: 12) {
                            Button {
                                addSelectedAsTask()
                            } label: {
                                Label("Add \(checkedItems.count) to Task", systemImage: "plus.circle.fill")
                            }
                            .buttonStyle(.borderedProminent)

                            Button {
                                checkedItems.removeAll()
                            } label: {
                                Label("Clear", systemImage: "xmark.circle.fill")
                            }
                            .buttonStyle(.bordered)

                            Spacer()
                        }
                        .padding(12)
                    }
                    .background(Color(.controlBackgroundColor))
                }
            }
            .navigationTitle("Grocery List")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        isPresented = false
                    }
                }
            }
        }
    }

    private func addItemAsSubitem(_ itemName: String, quantity: Double) {
        // Get or create a grocery task
        let tasks = GroceryTaskBridge.shared.getAllGroceryTasks()
        let weeklyTask = tasks.first { $0.title == "Weekly Grocery Shopping" }

        if let taskId = weeklyTask?.id {
            GroceryTaskBridge.shared.addItemToTask(taskId: taskId, itemName: itemName, quantity: quantity)
        } else {
            _ = GroceryTaskBridge.shared.addGroceryItemsAsTask(items: [itemName: quantity])
        }

        // Show confirmation (notification skipped - NSUserNotification deprecated in macOS 11+)
        DispatchQueue.main.async {
            print("✓ \(itemName.capitalized) added to grocery task")
        }
    }

    private func addSelectedAsTask() {
        // Convert selected items to a dictionary
        var selectedItems: [String: Double] = [:]
        let aggregatedIngredients = weeklyPlan.map { aggregateIngredients(from: $0) } ?? [:]

        for item in checkedItems {
            if let quantity = aggregatedIngredients[item] {
                selectedItems[item] = quantity
            }
        }

        // Create a grocery task with these items
        let _ = GroceryTaskBridge.shared.addGroceryItemsAsTask(items: selectedItems)

        // Show confirmation (notification skipped - NSUserNotification deprecated in macOS 11+)
        print("✓ Grocery shopping task created with \(checkedItems.count) items")

        // Clear selection after adding
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            checkedItems.removeAll()
        }
    }

    private func aggregateIngredients(from plan: WeeklyMealPlan) -> [String: Double] {
        var aggregated: [String: Double] = [:]

        plan.dailyPlans.forEach { day in
            [day.breakfast, day.lunch, day.dinner].compactMap { $0 }.forEach { meal in
                meal.ingredients.forEach { ingredient in
                    let key = ingredient.name.lowercased()
                    let grams = ingredient.quantity * unitMultiplier(ingredient.unit)
                    aggregated[key, default: 0] += grams
                }
            }
        }

        return aggregated
    }

    private func unitMultiplier(_ unit: String) -> Double {
        switch unit.lowercased() {
        case "oz": return 28.35
        case "cup": return 240
        case "tbsp": return 15
        case "tsp": return 5
        default: return 1
        }
    }
}

// MARK: - Nutrition Report Sheet

struct NutritionReportSheet: View {
    var weeklyPlan: WeeklyMealPlan?
    @Binding var isPresented: Bool

    var body: some View {
        NavigationStack {
            VStack {
                if let plan = weeklyPlan {
                    let nutrition = MealNutritionCalculator.calculateWeeklyNutrition(from: plan)

                    ScrollView {
                        VStack(alignment: .leading, spacing: 16) {
                            // Weekly summary
                            VStack(alignment: .leading, spacing: 12) {
                                Text("Weekly Total")
                                    .font(.headline)

                                HStack(spacing: 16) {
                                    VStack(alignment: .leading) {
                                        Text("Calories").font(.caption).foregroundStyle(.secondary)
                                        Text("\(nutrition.calories)").font(.title2.weight(.semibold))
                                    }
                                    VStack(alignment: .leading) {
                                        Text("Protein").font(.caption).foregroundStyle(.secondary)
                                        Text("\(nutrition.protein, specifier: "%.0f")g").font(.title2.weight(.semibold))
                                    }
                                    VStack(alignment: .leading) {
                                        Text("Carbs").font(.caption).foregroundStyle(.secondary)
                                        Text("\(nutrition.carbs, specifier: "%.0f")g").font(.title2.weight(.semibold))
                                    }
                                    VStack(alignment: .leading) {
                                        Text("Fat").font(.caption).foregroundStyle(.secondary)
                                        Text("\(nutrition.fat, specifier: "%.0f")g").font(.title2.weight(.semibold))
                                    }
                                }
                            }
                            .padding(12)
                            .background(Color.blue.opacity(0.1))
                            .cornerRadius(8)

                            // Daily breakdown
                            Text("Daily Breakdown")
                                .font(.headline)

                            ForEach(plan.dailyPlans.sorted(by: { $0.date < $1.date })) { day in
                                let daily = MealNutritionCalculator.calculateDailyNutrition(
                                    breakfast: day.breakfast,
                                    lunch: day.lunch,
                                    dinner: day.dinner
                                )

                                VStack(alignment: .leading, spacing: 8) {
                                    Text(day.date.formatted(date: .abbreviated, time: .omitted))
                                        .font(.caption.weight(.semibold))

                                    HStack(spacing: 12) {
                                        Label("\(daily.calories) cal", systemImage: "flame")
                                        Label("\(daily.protein, specifier: "%.0f")g protein", systemImage: "lungs.fill")
                                        Spacer()
                                    }
                                    .font(.caption)
                                }
                                .padding(8)
                                .background(Color(.controlBackgroundColor))
                                .cornerRadius(6)
                            }
                        }
                        .padding(16)
                    }
                } else {
                    Text("No meals planned for this week")
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Nutrition Report")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        isPresented = false
                    }
                }
            }
        }
    }
}

// MARK: - Grocery Tasks Sheet

struct GroceryTasksSheet: View {
    @Binding var isPresented: Bool
    @State private var groceryTasks: [GroceryTask] = []
    @State private var expandedTaskId: UUID?

    private let bridge = GroceryTaskBridge.shared

    var body: some View {
        NavigationStack {
            VStack {
                if groceryTasks.isEmpty {
                    VStack(spacing: 12) {
                        Image(systemName: "checklist")
                            .font(.system(size: 40))
                            .foregroundStyle(.secondary)
                        Text("No grocery tasks yet")
                            .font(.headline)
                        Text("Create one from the grocery list")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    List {
                        ForEach(groceryTasks) { task in
                            VStack(alignment: .leading, spacing: 8) {
                                HStack {
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(task.title)
                                            .font(.headline)
                                        let percentage = bridge.getCompletionPercentage(taskId: task.id)
                                        ProgressView(value: percentage / 100)
                                            .tint(task.isComplete ? .green : .blue)
                                        Text("\(task.completionCount)/\(task.totalCount) items")
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    if task.isComplete {
                                        Image(systemName: "checkmark.circle.fill")
                                            .foregroundStyle(.green)
                                    }
                                }

                                if expandedTaskId == task.id {
                                    Divider()

                                    VStack(alignment: .leading, spacing: 8) {
                                        ForEach(task.subitems) { subitem in
                                            HStack {
                                                Button {
                                                    bridge.toggleSubitemCompletion(taskId: task.id, subitemId: subitem.id)
                                                    refreshTasks()
                                                } label: {
                                                    Image(systemName: subitem.isCompleted ? "checkmark.circle.fill" : "circle")
                                                        .foregroundStyle(subitem.isCompleted ? .green : .gray)
                                                }
                                                .buttonStyle(.plain)

                                                VStack(alignment: .leading, spacing: 2) {
                                                    Text(subitem.name)
                                                        .font(.caption)
                                                        .strikethrough(subitem.isCompleted)
                                                    Text(subitem.quantity)
                                                        .font(.caption2)
                                                        .foregroundStyle(.secondary)
                                                }

                                                Spacer()

                                                Button {
                                                    bridge.removeSubitem(taskId: task.id, subitemId: subitem.id)
                                                    refreshTasks()
                                                } label: {
                                                    Image(systemName: "xmark.circle.fill")
                                                        .foregroundStyle(.red)
                                                }
                                                .buttonStyle(.plain)
                                            }
                                        }
                                    }
                                }
                            }
                            .contentShape(Rectangle())
                            .onTapGesture {
                                withAnimation {
                                    expandedTaskId = expandedTaskId == task.id ? nil : task.id
                                }
                            }
                        }
                        .onDelete { indexSet in
                            indexSet.forEach { index in
                                bridge.deleteGroceryTask(id: groceryTasks[index].id)
                            }
                            refreshTasks()
                        }
                    }
                }
            }
            .navigationTitle("Grocery Tasks")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        isPresented = false
                    }
                }
            }
            .onAppear {
                refreshTasks()
            }
        }
    }

    private func refreshTasks() {
        groceryTasks = bridge.getAllGroceryTasks()
    }
}

#Preview {
    MealsPageView()
}
