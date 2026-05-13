import Foundation

// MARK: - Models

struct MealModel: Identifiable, Codable {
    var id: UUID = UUID()
    var title: String
    var description: String = ""
    var ingredients: [MealIngredient] = []
    var nutritionFacts: NutritionFacts?
    var isTemplate: Bool = false
    var createdDate: Date = Date()
    var lastModified: Date = Date()

    enum CodingKeys: String, CodingKey {
        case id, title, description, ingredients, nutritionFacts, isTemplate, createdDate, lastModified
    }
}

struct MealIngredient: Identifiable, Codable {
    var id: UUID = UUID()
    var name: String
    var quantity: Double
    var unit: String = "g"
    var caloriesPer100g: Double = 0
    var protein: Double = 0  // grams per 100g
    var carbs: Double = 0    // grams per 100g
    var fat: Double = 0      // grams per 100g
}

struct NutritionFacts: Codable {
    var calories: Int = 0
    var protein: Double = 0
    var carbs: Double = 0
    var fat: Double = 0
}

struct DailyMealPlan: Identifiable, Codable {
    var id: UUID = UUID()
    var date: Date
    var breakfast: MealModel?
    var lunch: MealModel?
    var dinner: MealModel?
    var createdDate: Date = Date()
    var lastModified: Date = Date()
}

struct WeeklyMealPlan: Identifiable, Codable {
    var id: UUID = UUID()
    var weekStartDate: Date  // Monday of the week
    var dailyPlans: [DailyMealPlan] = []
    var createdDate: Date = Date()
    var lastModified: Date = Date()

    func getDayPlan(for date: Date) -> DailyMealPlan? {
        dailyPlans.first { Calendar.current.isDate($0.date, inSameDayAs: date) }
    }
}

// MARK: - Storage Manager

class MealsStorageManager: NSObject, Codable {
    private static let mealsKey = "meals_app_meals"
    private static let weeksKey = "meals_app_weeks"
    private static let templatesKey = "meals_app_templates"
    private static let ingredientCacheKey = "meals_app_ingredient_cache"
    private static let retentionWeeks = 4

    static let shared = MealsStorageManager()

    // MARK: - Meals CRUD

    func saveMeal(_ meal: MealModel) {
        var meal = meal
        meal.lastModified = Date()
        if meal.id == UUID() {
            meal.id = UUID()
        }

        // Calculate nutrition
        meal.nutritionFacts = MealNutritionCalculator.calculateNutrition(from: meal.ingredients)

        var meals = getAllMeals()
        if let index = meals.firstIndex(where: { $0.id == meal.id }) {
            meals[index] = meal
        } else {
            meals.append(meal)
        }
        saveMeals(meals)
    }

    func getMeal(id: UUID) -> MealModel? {
        getAllMeals().first { $0.id == id }
    }

    func deleteMeal(id: UUID) {
        var meals = getAllMeals()
        meals.removeAll { $0.id == id }
        saveMeals(meals)
    }

    func getAllMeals() -> [MealModel] {
        guard let data = UserDefaults.standard.data(forKey: Self.mealsKey) else {
            return []
        }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return (try? decoder.decode([MealModel].self, from: data)) ?? []
    }

    func getAllTemplates() -> [MealModel] {
        getAllMeals().filter { $0.isTemplate }
    }

    private func saveMeals(_ meals: [MealModel]) {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        if let data = try? encoder.encode(meals) {
            UserDefaults.standard.set(data, forKey: Self.mealsKey)
        }
    }

    // MARK: - Weekly Plans CRUD

    func saveWeeklyPlan(_ plan: WeeklyMealPlan) {
        var plan = plan
        plan.lastModified = Date()

        var plans = getAllWeeklyPlans()
        if let index = plans.firstIndex(where: { $0.id == plan.id }) {
            plans[index] = plan
        } else {
            plans.append(plan)
        }
        saveWeeklyPlans(plans)
    }

    func getWeeklyPlan(for date: Date) -> WeeklyMealPlan? {
        let monday = Calendar.current.dateComponents([.yearForWeekOfYear, .weekOfYear], from: date)
        let startOfWeek = Calendar.current.date(from: monday)!

        return getAllWeeklyPlans().first {
            Calendar.current.isDate($0.weekStartDate, inSameDayAs: startOfWeek)
        }
    }

    func getAllWeeklyPlans() -> [WeeklyMealPlan] {
        guard let data = UserDefaults.standard.data(forKey: Self.weeksKey) else {
            return []
        }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return (try? decoder.decode([WeeklyMealPlan].self, from: data)) ?? []
    }

    private func saveWeeklyPlans(_ plans: [WeeklyMealPlan]) {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        if let data = try? encoder.encode(plans) {
            UserDefaults.standard.set(data, forKey: Self.weeksKey)
        }
    }

    func addMealToWeek(_ meal: MealModel, for date: Date, type: MealType) {
        let weekMonday = getMonday(of: date)
        var plan = getWeeklyPlan(for: date) ?? WeeklyMealPlan(weekStartDate: weekMonday)

        var dailyPlan = plan.getDayPlan(for: date) ?? DailyMealPlan(date: date)

        switch type {
        case .breakfast:
            dailyPlan.breakfast = meal
        case .lunch:
            dailyPlan.lunch = meal
        case .dinner:
            dailyPlan.dinner = meal
        }

        if let index = plan.dailyPlans.firstIndex(where: { Calendar.current.isDate($0.date, inSameDayAs: date) }) {
            plan.dailyPlans[index] = dailyPlan
        } else {
            plan.dailyPlans.append(dailyPlan)
        }

        saveWeeklyPlan(plan)
    }

    func removeMealFromWeek(for date: Date, type: MealType) {
        guard var plan = getWeeklyPlan(for: date) else { return }

        if let index = plan.dailyPlans.firstIndex(where: { Calendar.current.isDate($0.date, inSameDayAs: date) }) {
            var dailyPlan = plan.dailyPlans[index]

            switch type {
            case .breakfast:
                dailyPlan.breakfast = nil
            case .lunch:
                dailyPlan.lunch = nil
            case .dinner:
                dailyPlan.dinner = nil
            }

            plan.dailyPlans[index] = dailyPlan
            saveWeeklyPlan(plan)
        }
    }

    // MARK: - Ingredient Cache

    func cacheIngredient(name: String, nutrition: NutritionFacts) {
        var cache = getIngredientCache()
        cache[name.lowercased()] = nutrition
        saveIngredientCache(cache)
    }

    func getCachedIngredient(name: String) -> NutritionFacts? {
        getIngredientCache()[name.lowercased()]
    }

    private func getIngredientCache() -> [String: NutritionFacts] {
        guard let data = UserDefaults.standard.data(forKey: Self.ingredientCacheKey) else {
            return [:]
        }
        let decoder = JSONDecoder()
        return (try? decoder.decode([String: NutritionFacts].self, from: data)) ?? [:]
    }

    private func saveIngredientCache(_ cache: [String: NutritionFacts]) {
        let encoder = JSONEncoder()
        if let data = try? encoder.encode(cache) {
            UserDefaults.standard.set(data, forKey: Self.ingredientCacheKey)
        }
    }

    // MARK: - Data Retention

    func cleanOldData(retentionWeeks: Int = 4) {
        let cutoffDate = Calendar.current.date(byAdding: .weekOfYear, value: -retentionWeeks, to: Date()) ?? Date()

        var meals = getAllMeals()
        meals = meals.filter { $0.isTemplate || $0.createdDate > cutoffDate }
        saveMeals(meals)

        var plans = getAllWeeklyPlans()
        plans = plans.filter { $0.createdDate > cutoffDate }
        saveWeeklyPlans(plans)
    }

    // MARK: - Utility

    private func getMonday(of date: Date) -> Date {
        let calendar = Calendar.current
        let components = calendar.dateComponents([.yearForWeekOfYear, .weekOfYear], from: date)
        return calendar.date(from: components) ?? date
    }

    func exportAllData() -> [String: Any] {
        return [
            "meals": getAllMeals(),
            "weeklyPlans": getAllWeeklyPlans(),
            "ingredientCache": getIngredientCache()
        ]
    }
}

// MARK: - Meal Type

enum MealType: String, CaseIterable {
    case breakfast = "Breakfast"
    case lunch = "Lunch"
    case dinner = "Dinner"

    var emoji: String {
        switch self {
        case .breakfast: return "🌅"
        case .lunch: return "🥗"
        case .dinner: return "🍽️"
        }
    }
}
