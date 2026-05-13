import Foundation

struct MealNutritionCalculator {
    /// Calculate total nutrition facts from ingredients
    static func calculateNutrition(from ingredients: [MealIngredient]) -> NutritionFacts {
        var totals = NutritionFacts()

        for ingredient in ingredients {
            guard ingredient.quantity > 0 else { continue }

            // Convert quantity to grams
            let grams = ingredient.quantity * unitMultiplier(ingredient.unit)

            totals.calories += Int((ingredient.caloriesPer100g * grams) / 100)
            totals.protein += round((ingredient.protein * grams) / 100 * 10) / 10
            totals.carbs += round((ingredient.carbs * grams) / 100 * 10) / 10
            totals.fat += round((ingredient.fat * grams) / 100 * 10) / 10
        }

        return totals
    }

    /// Calculate daily nutrition from breakfast, lunch, dinner
    static func calculateDailyNutrition(breakfast: MealModel?, lunch: MealModel?, dinner: MealModel?) -> NutritionFacts {
        var totals = NutritionFacts()

        [breakfast, lunch, dinner].compactMap { $0 }.forEach { meal in
            if let nutrition = meal.nutritionFacts {
                totals.calories += nutrition.calories
                totals.protein += nutrition.protein
                totals.carbs += nutrition.carbs
                totals.fat += nutrition.fat
            }
        }

        return totals
    }

    /// Calculate weekly nutrition from all daily plans
    static func calculateWeeklyNutrition(from weeklyPlan: WeeklyMealPlan) -> NutritionFacts {
        var totals = NutritionFacts()

        weeklyPlan.dailyPlans.forEach { day in
            let daily = calculateDailyNutrition(
                breakfast: day.breakfast,
                lunch: day.lunch,
                dinner: day.dinner
            )
            totals.calories += daily.calories
            totals.protein += daily.protein
            totals.carbs += daily.carbs
            totals.fat += daily.fat
        }

        return totals
    }

    /// Get common ingredient estimates (fallback when API not available)
    static func getCommonIngredientEstimate(name: String) -> NutritionFacts? {
        let name = name.lowercased().trimmingCharacters(in: .whitespaces)

        let estimates: [String: (cal: Double, protein: Double, carbs: Double, fat: Double)] = [
            // Proteins
            "chicken": (165, 31, 0, 3.6),
            "chicken breast": (165, 31, 0, 3.6),
            "beef": (250, 26, 0, 15),
            "ground beef": (217, 23, 0, 13),
            "salmon": (208, 20, 0, 13),
            "fish": (100, 20, 0, 1),
            "egg": (155, 13, 1.1, 11),
            "eggs": (155, 13, 1.1, 11),

            // Dairy
            "milk": (61, 3.2, 4.8, 3.3),
            "cheese": (402, 25, 1.3, 33),
            "yogurt": (59, 10, 3.3, 0.4),

            // Grains
            "rice": (130, 2.7, 28, 0.3),
            "white rice": (130, 2.7, 28, 0.3),
            "brown rice": (111, 2.6, 23, 0.9),
            "pasta": (131, 5, 25, 1.1),
            "bread": (265, 9, 49, 3.3),

            // Fruits
            "apple": (52, 0.3, 14, 0.2),
            "banana": (89, 1.1, 23, 0.3),
            "orange": (47, 0.9, 12, 0.3),

            // Vegetables
            "broccoli": (34, 2.8, 7, 0.4),
            "spinach": (23, 2.9, 3.6, 0.4),
            "carrot": (41, 0.9, 10, 0.2),
            "tomato": (18, 0.9, 3.9, 0.2),
            "potato": (77, 2, 17, 0.1),
            "sweet potato": (86, 1.6, 20, 0.1),

            // Fats & Oils
            "olive oil": (884, 0, 0, 100),
            "butter": (717, 0.9, 0.1, 81),

            // Legumes
            "beans": (127, 8.7, 23, 0.5),
            "lentils": (116, 9, 20, 0.4),

            // Nuts
            "almonds": (579, 21, 22, 50),
            "peanut butter": (588, 25, 20, 50)
        ]

        // Try exact match first
        if let (cal, protein, carbs, fat) = estimates[name] {
            return NutritionFacts(
                calories: Int(cal),
                protein: protein,
                carbs: carbs,
                fat: fat
            )
        }

        // Try partial match
        for (key, (cal, protein, carbs, fat)) in estimates {
            if name.contains(key) || key.contains(name) {
                return NutritionFacts(
                    calories: Int(cal),
                    protein: protein,
                    carbs: carbs,
                    fat: fat
                )
            }
        }

        return nil
    }

    /// Convert unit to grams multiplier
    private static func unitMultiplier(_ unit: String) -> Double {
        switch unit.lowercased() {
        case "g", "grams":
            return 1.0
        case "oz", "ounces":
            return 28.35
        case "cup", "cups":
            return 240.0
        case "tbsp", "tablespoon", "tablespoons":
            return 15.0
        case "tsp", "teaspoon", "teaspoons":
            return 5.0
        default:
            return 1.0
        }
    }

    /// Format nutrition value for display
    static func formatNutrition(_ value: Double, roundTo: Int = 1) -> String {
        let multiplier = pow(10.0, Double(roundTo))
        let rounded = round(value * multiplier) / multiplier
        if roundTo == 0 {
            return String(Int(rounded))
        }
        return String(format: "%.\(roundTo)f", rounded)
    }

    /// Get macro percentages (for visualization)
    static func getMacroPercentages(from nutrition: NutritionFacts) -> (protein: Double, carbs: Double, fat: Double) {
        let proteinCals = nutrition.protein * 4
        let carbsCals = nutrition.carbs * 4
        let fatCals = nutrition.fat * 9
        let totalCals = Double(nutrition.calories)

        guard totalCals > 0 else {
            return (0, 0, 0)
        }

        return (
            protein: (proteinCals / totalCals) * 100,
            carbs: (carbsCals / totalCals) * 100,
            fat: (fatCals / totalCals) * 100
        )
    }
}
