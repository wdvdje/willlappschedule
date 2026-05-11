/**
 * Meals Storage Module
 * Handles all meal data persistence, CRUD operations, templates, and retention policies.
 */

(function () {
  if (window.mealsStorage) return;

  // ===== Data Schema =====
  // Meal {
  //   id: string (UUID)
  //   title: string
  //   description: string (optional)
  //   ingredients: [
  //     {
  //       name: string
  //       quantity: number
  //       unit: string (g, oz, cup, tbsp, etc.)
  //       caloriesPer100g: number
  //       protein: number (grams per 100g)
  //       carbs: number (grams per 100g)
  //       fat: number (grams per 100g)
  //     }
  //   ]
  //   nutritionFacts: { calories: number, protein: number, carbs: number, fat: number } (auto-calculated)
  //   isTemplate: boolean (flag for reusable meals)
  //   createdDate: ISO string
  //   lastModified: ISO string
  // }
  //
  // WeeklyMealPlan {
  //   id: string (UUID)
  //   weekStartDate: ISO string (Monday of week, e.g., "2026-05-10")
  //   meals: {
  //     [dayOfWeek]: {
  //       breakfast?: { mealId: string, title: string }
  //       lunch?: { mealId: string, title: string }
  //       dinner?: { mealId: string, title: string }
  //     }
  //   }
  //   createdDate: ISO string
  //   lastModified: ISO string
  // }

  const STORAGE_PREFIX = 'meals_app_';
  const MEALS_KEY = STORAGE_PREFIX + 'meals';
  const WEEKLY_PLANS_KEY = STORAGE_PREFIX + 'weekly_plans';
  const INGREDIENT_CACHE_KEY = STORAGE_PREFIX + 'ingredient_cache';
  const RETENTION_WEEKS = 4;

  // Helper: Generate UUID
  function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // Helper: Get Monday of the week for a given date
  function getMondayOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is Sunday
    const monday = new Date(d.setDate(diff));
    return monday.toISOString().split('T')[0];
  }

  // Helper: Calculate nutrition facts from ingredients
  function calculateNutrition(ingredients) {
    let calories = 0, protein = 0, carbs = 0, fat = 0;
    
    (ingredients || []).forEach(ing => {
      if (!ing.quantity || !ing.caloriesPer100g) return;
      
      // Convert quantity to grams
      let grams = ing.quantity;
      const unit = (ing.unit || 'g').toLowerCase();
      if (unit === 'oz') grams = ing.quantity * 28.35;
      else if (unit === 'cup') grams = ing.quantity * 240;
      else if (unit === 'tbsp') grams = ing.quantity * 15;
      else if (unit === 'tsp') grams = ing.quantity * 5;
      
      calories += (ing.caloriesPer100g * grams) / 100;
      protein += (ing.protein * grams) / 100;
      carbs += (ing.carbs * grams) / 100;
      fat += (ing.fat * grams) / 100;
    });

    return {
      calories: Math.round(calories),
      protein: Math.round(protein * 10) / 10,
      carbs: Math.round(carbs * 10) / 10,
      fat: Math.round(fat * 10) / 10
    };
  }

  // Helper: Load all meals
  function loadAllMeals() {
    return window.appStorage.getJSON(MEALS_KEY, []);
  }

  // Helper: Save all meals
  function saveAllMeals(meals) {
    window.appStorage.setJSON(MEALS_KEY, meals);
  }

  // Helper: Load all weekly plans
  function loadAllWeeklyPlans() {
    return window.appStorage.getJSON(WEEKLY_PLANS_KEY, []);
  }

  // Helper: Save all weekly plans
  function saveAllWeeklyPlans(plans) {
    window.appStorage.setJSON(WEEKLY_PLANS_KEY, plans);
  }

  const storage = {
    // ===== Meal CRUD =====
    
    /**
     * Save or update a meal
     * @param {Object} meal - Meal object (auto-generates ID if not present)
     * @returns {Object} Saved meal with ID
     */
    saveMeal: function(meal) {
      if (!meal.id) meal.id = generateUUID();
      if (!meal.createdDate) meal.createdDate = new Date().toISOString();
      meal.lastModified = new Date().toISOString();
      meal.nutritionFacts = calculateNutrition(meal.ingredients);
      
      const meals = loadAllMeals();
      const idx = meals.findIndex(m => m.id === meal.id);
      if (idx >= 0) {
        meals[idx] = meal;
      } else {
        meals.push(meal);
      }
      saveAllMeals(meals);
      return meal;
    },

    /**
     * Get a single meal by ID
     * @param {string} id - Meal ID
     * @returns {Object|null} Meal object or null
     */
    getMeal: function(id) {
      const meals = loadAllMeals();
      return meals.find(m => m.id === id) || null;
    },

    /**
     * Delete a meal by ID
     * @param {string} id - Meal ID
     */
    deleteMeal: function(id) {
      const meals = loadAllMeals();
      const filtered = meals.filter(m => m.id !== id);
      saveAllMeals(filtered);
    },

    /**
     * Get all meals
     * @returns {Array} All meals
     */
    getAllMeals: function() {
      return loadAllMeals();
    },

    /**
     * Get all template meals
     * @returns {Array} All meals with isTemplate: true
     */
    getAllTemplates: function() {
      const meals = loadAllMeals();
      return meals.filter(m => m.isTemplate);
    },

    // ===== Weekly Plan CRUD =====

    /**
     * Save or update a weekly meal plan
     * @param {Object} plan - WeeklyMealPlan object
     * @returns {Object} Saved plan with ID
     */
    saveWeeklyPlan: function(plan) {
      if (!plan.id) plan.id = generateUUID();
      if (!plan.createdDate) plan.createdDate = new Date().toISOString();
      plan.lastModified = new Date().toISOString();
      
      const plans = loadAllWeeklyPlans();
      const idx = plans.findIndex(p => p.id === plan.id && p.weekStartDate === plan.weekStartDate);
      if (idx >= 0) {
        plans[idx] = plan;
      } else {
        plans.push(plan);
      }
      saveAllWeeklyPlans(plans);
      return plan;
    },

    /**
     * Get weekly plan for a specific week
     * @param {string} weekStartDate - ISO string of Monday (e.g., "2026-05-10")
     * @returns {Object} WeeklyMealPlan or null
     */
    getWeeklyPlan: function(weekStartDate) {
      const plans = loadAllWeeklyPlans();
      return plans.find(p => p.weekStartDate === weekStartDate) || null;
    },

    /**
     * Add a meal to a weekly plan
     * @param {string} weekStartDate - ISO string of Monday
     * @param {string} dayOfWeek - "monday", "tuesday", ..., "sunday"
     * @param {string} mealType - "breakfast", "lunch", or "dinner"
     * @param {string} mealId - Meal ID
     * @param {string} mealTitle - Meal title
     */
    addMealToWeek: function(weekStartDate, dayOfWeek, mealType, mealId, mealTitle) {
      const dayNorm = dayOfWeek.toLowerCase();
      let plan = storage.getWeeklyPlan(weekStartDate);
      
      if (!plan) {
        plan = {
          id: generateUUID(),
          weekStartDate: weekStartDate,
          meals: {}
        };
      }
      
      if (!plan.meals[dayNorm]) {
        plan.meals[dayNorm] = {};
      }
      
      plan.meals[dayNorm][mealType] = { mealId, title: mealTitle };
      storage.saveWeeklyPlan(plan);
    },

    /**
     * Remove a meal from a weekly plan
     * @param {string} weekStartDate - ISO string of Monday
     * @param {string} dayOfWeek - "monday", "tuesday", ..., "sunday"
     * @param {string} mealType - "breakfast", "lunch", or "dinner"
     */
    removeMealFromWeek: function(weekStartDate, dayOfWeek, mealType) {
      const dayNorm = dayOfWeek.toLowerCase();
      let plan = storage.getWeeklyPlan(weekStartDate);
      
      if (!plan || !plan.meals[dayNorm]) return;
      
      delete plan.meals[dayNorm][mealType];
      if (Object.keys(plan.meals[dayNorm]).length === 0) {
        delete plan.meals[dayNorm];
      }
      
      storage.saveWeeklyPlan(plan);
    },

    /**
     * Get meals for a week
     * @param {string} weekStartDate - ISO string of Monday
     * @returns {Object} meals[dayOfWeek][mealType] = { mealId, title }
     */
    getMealsForWeek: function(weekStartDate) {
      const plan = storage.getWeeklyPlan(weekStartDate);
      return (plan && plan.meals) || {};
    },

    /**
     * Get all weekly plans
     * @returns {Array} All weekly plans
     */
    getAllWeeklyPlans: function() {
      return loadAllWeeklyPlans();
    },

    // ===== Ingredient Cache =====

    /**
     * Cache ingredient nutrition data from API
     * @param {string} ingredientName - Ingredient name (key)
     * @param {Object} nutritionData - { name, caloriesPer100g, protein, carbs, fat }
     */
    cacheIngredient: function(ingredientName, nutritionData) {
      const cache = window.appStorage.getJSON(INGREDIENT_CACHE_KEY, {});
      cache[ingredientName.toLowerCase()] = {
        ...nutritionData,
        cachedDate: new Date().toISOString()
      };
      window.appStorage.setJSON(INGREDIENT_CACHE_KEY, cache);
    },

    /**
     * Get cached ingredient nutrition
     * @param {string} ingredientName - Ingredient name
     * @returns {Object|null} Cached nutrition data or null
     */
    getCachedIngredient: function(ingredientName) {
      const cache = window.appStorage.getJSON(INGREDIENT_CACHE_KEY, {});
      return cache[ingredientName.toLowerCase()] || null;
    },

    /**
     * Clear ingredient cache
     */
    clearIngredientCache: function() {
      window.appStorage.removeItem(INGREDIENT_CACHE_KEY);
    },

    // ===== Retention Policy =====

    /**
     * Delete meals and plans older than retention period (4 weeks by default)
     * @param {number} retentionWeeks - Number of weeks to retain (default: 4)
     */
    cleanOldData: function(retentionWeeks) {
      retentionWeeks = retentionWeeks || RETENTION_WEEKS;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - (retentionWeeks * 7));
      const cutoffISO = cutoffDate.toISOString();

      // Clean old meals (non-templates)
      let meals = loadAllMeals();
      meals = meals.filter(m => m.isTemplate || new Date(m.createdDate) > new Date(cutoffISO));
      saveAllMeals(meals);

      // Clean old weekly plans
      let plans = loadAllWeeklyPlans();
      plans = plans.filter(p => new Date(p.createdDate) > new Date(cutoffISO));
      saveAllWeeklyPlans(plans);
    },

    // ===== Utility =====

    /**
     * Get helper function for determining Monday of a week
     * @param {string|Date} date - ISO string or Date object
     * @returns {string} ISO string of Monday
     */
    getMondayOfWeek: getMondayOfWeek,

    /**
     * Export all meals and plans as JSON (for backup/debugging)
     * @returns {Object} { meals, weeklyPlans, ingredientCache }
     */
    exportAllData: function() {
      return {
        meals: loadAllMeals(),
        weeklyPlans: loadAllWeeklyPlans(),
        ingredientCache: window.appStorage.getJSON(INGREDIENT_CACHE_KEY, {})
      };
    },

    /**
     * Import meals and plans from JSON
     * @param {Object} data - { meals, weeklyPlans, ingredientCache }
     */
    importAllData: function(data) {
      if (data.meals) saveAllMeals(data.meals);
      if (data.weeklyPlans) saveAllWeeklyPlans(data.weeklyPlans);
      if (data.ingredientCache) window.appStorage.setJSON(INGREDIENT_CACHE_KEY, data.ingredientCache);
    }
  };

  window.mealsStorage = storage;
})();
