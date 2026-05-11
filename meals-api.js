/**
 * Meals API Service
 * Handles ingredient lookups from USDA/Nutritionix API with local caching
 */

(function () {
  if (window.mealsAPI) return;

  // API configuration - using USDA FoodData Central API (free, no key required for limited use)
  // Fallback: Nutritionix API (requires free key from nutritionix.com)
  const USDA_API_BASE = 'https://fdc.nal.usda.gov/api/foods/search';
  const USDA_API_KEY = 'AAFAXXXXXXXXXXXXXXXX'; // FDC API has limited free tier without key, but basic search works

  /**
   * Search for ingredient nutrition data via USDA FoodData Central
   * @param {string} ingredientName - Name of ingredient to search
   * @returns {Promise<Object>} Nutrition data { name, caloriesPer100g, protein, carbs, fat }
   */
  async function searchUSDAIngredient(ingredientName) {
    try {
      const params = new URLSearchParams({
        query: ingredientName,
        pageSize: 1,
        pageNumber: 1
      });

      const url = `${USDA_API_BASE}?${params}`;
      const response = await fetch(url);
      
      if (!response.ok) throw new Error(`USDA API error: ${response.status}`);
      
      const data = await response.json();
      if (!data.foods || data.foods.length === 0) {
        return null;
      }

      const food = data.foods[0];
      const foodNutrients = food.foodNutrients || [];

      // Helper: find nutrient value by ID
      const getNutrient = (id) => {
        const nutrient = foodNutrients.find(n => n.nutrientId === id);
        return nutrient ? nutrient.value : 0;
      };

      // USDA Nutrient IDs:
      // 1008 = Energy (kcal)
      // 1003 = Protein (g)
      // 1005 = Carbohydrate (g)
      // 1004 = Total lipid (fat) (g)
      
      const caloriesPer100g = getNutrient(1008) || 0; // energy in kcal
      const protein = getNutrient(1003) || 0; // protein per 100g
      const carbs = getNutrient(1005) || 0; // carbs per 100g
      const fat = getNutrient(1004) || 0; // fat per 100g

      return {
        name: food.description || ingredientName,
        caloriesPer100g: Math.round(caloriesPer100g),
        protein: Math.round(protein * 10) / 10,
        carbs: Math.round(carbs * 10) / 10,
        fat: Math.round(fat * 10) / 10,
        source: 'USDA FoodData Central'
      };
    } catch (err) {
      console.warn('USDA API search failed:', err);
      return null;
    }
  }

  /**
   * Fallback: Parse generic ingredient estimate (for when API fails)
   * Very basic estimates for common ingredients
   * @param {string} ingredientName
   * @returns {Object|null} Estimated nutrition or null
   */
  function getFallbackEstimate(ingredientName) {
    const name = ingredientName.toLowerCase().trim();
    
    // Common ingredient database (kcal/100g, protein/100g, carbs/100g, fat/100g)
    const estimates = {
      'chicken': { calories: 165, protein: 31, carbs: 0, fat: 3.6 },
      'chicken breast': { calories: 165, protein: 31, carbs: 0, fat: 3.6 },
      'beef': { calories: 250, protein: 26, carbs: 0, fat: 15 },
      'ground beef': { calories: 217, protein: 23, carbs: 0, fat: 13 },
      'salmon': { calories: 208, protein: 20, carbs: 0, fat: 13 },
      'fish': { calories: 100, protein: 20, carbs: 0, fat: 1 },
      'egg': { calories: 155, protein: 13, carbs: 1.1, fat: 11 },
      'eggs': { calories: 155, protein: 13, carbs: 1.1, fat: 11 },
      'milk': { calories: 61, protein: 3.2, carbs: 4.8, fat: 3.3 },
      'rice': { calories: 130, protein: 2.7, carbs: 28, fat: 0.3 },
      'white rice': { calories: 130, protein: 2.7, carbs: 28, fat: 0.3 },
      'brown rice': { calories: 111, protein: 2.6, carbs: 23, fat: 0.9 },
      'pasta': { calories: 131, protein: 5, carbs: 25, fat: 1.1 },
      'bread': { calories: 265, protein: 9, carbs: 49, fat: 3.3 },
      'apple': { calories: 52, protein: 0.3, carbs: 14, fat: 0.2 },
      'banana': { calories: 89, protein: 1.1, carbs: 23, fat: 0.3 },
      'broccoli': { calories: 34, protein: 2.8, carbs: 7, fat: 0.4 },
      'spinach': { calories: 23, protein: 2.9, carbs: 3.6, fat: 0.4 },
      'carrot': { calories: 41, protein: 0.9, carbs: 10, fat: 0.2 },
      'tomato': { calories: 18, protein: 0.9, carbs: 3.9, fat: 0.2 },
      'potato': { calories: 77, protein: 2, carbs: 17, fat: 0.1 },
      'sweet potato': { calories: 86, protein: 1.6, carbs: 20, fat: 0.1 },
      'olive oil': { calories: 884, protein: 0, carbs: 0, fat: 100 },
      'butter': { calories: 717, protein: 0.9, carbs: 0.1, fat: 81 },
      'cheese': { calories: 402, protein: 25, carbs: 1.3, fat: 33 },
      'yogurt': { calories: 59, protein: 10, carbs: 3.3, fat: 0.4 },
      'beans': { calories: 127, protein: 8.7, carbs: 23, fat: 0.5 },
      'lentils': { calories: 116, protein: 9, carbs: 20, fat: 0.4 },
      'almonds': { calories: 579, protein: 21, carbs: 22, fat: 50 },
      'peanut butter': { calories: 588, protein: 25, carbs: 20, fat: 50 }
    };

    // Try direct match first
    if (estimates[name]) {
      return {
        name: ingredientName,
        ...estimates[name],
        source: 'Estimated (common ingredient)'
      };
    }

    // Try partial match (e.g., "grilled chicken" -> "chicken")
    for (const key in estimates) {
      if (name.includes(key) || key.includes(name)) {
        return {
          name: ingredientName,
          ...estimates[key],
          source: 'Estimated (partial match)'
        };
      }
    }

    return null;
  }

  const api = {
    /**
     * Search for an ingredient's nutrition data
     * Tries API first, then falls back to estimates, then cache
     * @param {string} ingredientName - Name of ingredient
     * @returns {Promise<Object>} Nutrition data or null
     */
    searchIngredient: async function(ingredientName) {
      if (!ingredientName || ingredientName.trim().length === 0) {
        return null;
      }

      // Check cache first
      const cached = window.mealsStorage.getCachedIngredient(ingredientName);
      if (cached) {
        return cached;
      }

      // Try USDA API
      let result = await searchUSDAIngredient(ingredientName);
      
      // Fallback to estimates
      if (!result) {
        result = getFallbackEstimate(ingredientName);
      }

      // Cache the result (whether from API or fallback)
      if (result) {
        window.mealsStorage.cacheIngredient(ingredientName, result);
      }

      return result;
    },

    /**
     * Batch search for multiple ingredients
     * @param {Array<string>} ingredientNames - Array of ingredient names
     * @returns {Promise<Array>} Array of nutrition data objects
     */
    searchMultipleIngredients: async function(ingredientNames) {
      const promises = (ingredientNames || []).map(name => this.searchIngredient(name));
      const results = await Promise.all(promises);
      return results.filter(r => r !== null);
    },

    /**
     * Get a fallback estimate (when user wants manual entry)
     * @param {string} ingredientName - Ingredient name
     * @returns {Object|null} Estimated nutrition or null
     */
    getFallbackEstimate: getFallbackEstimate,

    /**
     * Clear the ingredient cache (for manual reset)
     */
    clearCache: function() {
      window.mealsStorage.clearIngredientCache();
    }
  };

  window.mealsAPI = api;
})();
