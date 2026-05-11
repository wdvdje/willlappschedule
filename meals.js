/**
 * Meals App Main Logic
 * Handles week navigation, meal grid rendering, and modal interactions
 */

(function () {
  // State
  let currentWeekStart = null;
  let currentEditingMealId = null;
  let currentEditingDay = null;
  let currentEditingMealType = null;
  let currentIngredients = [];
  let uiInitialized = false;

  // DOM Elements
  let mealsView = null;
  let weekRangeEl = null;
  let prevWeekBtn = null;
  let nextWeekBtn = null;
  let groceryListBtn = null;
  let nutritionReportBtn = null;
  let templatesBtn = null;
  let mealModal = null;
  let mealForm = null;
  let mealNameInput = null;
  let mealDescInput = null;
  let ingredientsList = null;
  let addIngredientBtn = null;
  let saveMealBtn = null;
  let deleteBtn = null;
  let cancelBtn = null;
  let closeModalBtn = null;
  let ingredientSearchModal = null;
  let ingredientSearchInput = null;
  let searchIngredientBtn = null;
  let ingredientSearchResults = null;
  let addIngredientConfirmBtn = null;
  let cancelIngredientBtn = null;
  let closeIngredientSearchBtn = null;
  let modalTitle = null;

  // Initialize on view:show event
  window.addEventListener('view:show', function(e) {
    if (e.detail && e.detail.view === 'meals') {
      if (!uiInitialized) {
        renderMealsUI();
        initializeElements();
        setupEventListeners();
        uiInitialized = true;
      }
      initializeMealsView();
    }
  });

  function renderMealsUI() {
    mealsView = document.getElementById('mealsView');
    if (!mealsView) return;

    mealsView.innerHTML = `
      <style>
        #mealsView { width: 100%; height: 100%; display: flex; flex-direction: column; background: #f5f5f5; }
        .meals-container { display: flex; flex-direction: column; height: 100%; padding: 16px; gap: 16px; }
        .meals-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; }
        .meals-header h1 { font-size: 24px; font-weight: 600; }
        .week-nav { display: flex; align-items: center; gap: 12px; background: white; padding: 8px 12px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); }
        .week-nav button { background: none; border: none; font-size: 18px; cursor: pointer; padding: 4px 8px; border-radius: 4px; color: #0066cc; transition: background 0.2s; }
        .week-nav button:hover { background: #f0f0f0; }
        .week-range { font-size: 14px; font-weight: 500; min-width: 160px; text-align: center; color: #666; }
        .actions-bar { display: flex; gap: 8px; flex-wrap: wrap; }
        .action-btn { padding: 8px 16px; background: #0066cc; color: white; border: none; border-radius: 6px; font-size: 14px; font-weight: 500; cursor: pointer; transition: background 0.2s; }
        .action-btn:hover { background: #0052a3; }
        .action-btn.secondary { background: #e8e8e8; color: #333; }
        .action-btn.secondary:hover { background: #d0d0d0; }
        .meals-grid-wrapper { flex: 1; display: flex; background: white; border-radius: 8px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); overflow: auto; }
        .meals-grid { display: table; width: 100%; border-collapse: collapse; min-width: 600px; }
        .meals-grid-header { display: table-header-group; background: #f9f9f9; border-bottom: 2px solid #e0e0e0; }
        .meals-grid-body { display: table-row-group; }
        .grid-row { display: table-row; border-bottom: 1px solid #e0e0e0; }
        .grid-row:last-child { border-bottom: none; }
        .grid-cell { display: table-cell; padding: 12px; border-right: 1px solid #e0e0e0; vertical-align: middle; height: 100px; }
        .grid-cell:last-child { border-right: none; }
        .grid-header-cell { display: table-cell; padding: 12px; border-right: 1px solid #e0e0e0; font-weight: 600; font-size: 13px; text-align: center; vertical-align: middle; min-width: 80px; background: #f9f9f9; }
        .grid-header-cell:last-child { border-right: none; }
        .meal-label { font-weight: 600; font-size: 14px; color: #333; min-width: 80px; }
        .meal-cell-button { width: 100%; height: 100%; padding: 12px; background: #fafafa; border: 1px dashed #ccc; border-radius: 4px; cursor: pointer; text-align: center; font-size: 13px; color: #666; transition: all 0.2s; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 4px; overflow: hidden; }
        .meal-cell-button:hover { border-color: #0066cc; background: #f0f8ff; color: #0066cc; }
        .meal-cell-button.has-meal { background: white; border: 1px solid #0066cc; color: #0066cc; font-weight: 500; }
        .meal-cell-button.has-meal:hover { background: #f0f8ff; }
        .meal-title { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
        .meal-nutrition-preview { font-size: 11px; color: #999; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
        .modal { display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.5); z-index: 1000; justify-content: center; align-items: center; }
        .modal.open { display: flex; }
        .modal-content { background: white; border-radius: 8px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15); max-width: 600px; width: 90%; max-height: 90vh; overflow-y: auto; }
        .modal-header { padding: 20px; border-bottom: 1px solid #e0e0e0; display: flex; justify-content: space-between; align-items: center; }
        .modal-header h2 { font-size: 18px; font-weight: 600; }
        .modal-close-btn { background: none; border: none; font-size: 24px; cursor: pointer; color: #999; padding: 0; width: 32px; height: 32px; }
        .modal-body { padding: 20px; }
        .modal-footer { padding: 20px; border-top: 1px solid #e0e0e0; display: flex; justify-content: flex-end; gap: 8px; }
        .form-group { margin-bottom: 16px; }
        .form-label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; color: #333; }
        .form-input, .form-textarea { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; font-family: inherit; }
        .form-input:focus, .form-textarea:focus { outline: none; border-color: #0066cc; box-shadow: 0 0 0 3px rgba(0, 102, 204, 0.1); }
        .form-textarea { resize: vertical; min-height: 60px; }
        .toast { position: fixed; bottom: 20px; right: 20px; background: #333; color: white; padding: 12px 16px; border-radius: 6px; font-size: 13px; z-index: 2000; }
        .toast.success { background: #28a745; }
        .toast.error { background: #dc3545; }
        .checkbox-group { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
        .checkbox-group input[type="checkbox"] { width: 16px; height: 16px; cursor: pointer; }
        .checkbox-group label { cursor: pointer; font-size: 13px; }
        .loading { display: inline-block; width: 12px; height: 12px; border: 2px solid #0066cc; border-top-color: transparent; border-radius: 50%; animation: spin 0.6s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      </style>

      <div class="meals-container">
        <div class="meals-header">
          <h1>🍽️ Weekly Meal Plan</h1>
          <div class="week-nav">
            <button id="prevWeekBtn" title="Previous week">‹</button>
            <span class="week-range" id="weekRange">Loading...</span>
            <button id="nextWeekBtn" title="Next week">›</button>
          </div>
        </div>

        <div class="actions-bar">
          <button id="groceryListBtn" class="action-btn secondary">📋 Grocery List</button>
          <button id="nutritionReportBtn" class="action-btn secondary">📊 Nutrition Report</button>
          <button id="templatesBtn" class="action-btn secondary">⭐ Meal Templates</button>
        </div>

        <div class="meals-grid-wrapper">
          <div class="meals-grid">
            <div class="meals-grid-header">
              <div class="grid-row">
                <div class="grid-header-cell" style="width: 100px;">Meal</div>
                <div class="grid-header-cell">Monday</div>
                <div class="grid-header-cell">Tuesday</div>
                <div class="grid-header-cell">Wednesday</div>
                <div class="grid-header-cell">Thursday</div>
                <div class="grid-header-cell">Friday</div>
                <div class="grid-header-cell">Saturday</div>
                <div class="grid-header-cell">Sunday</div>
              </div>
            </div>
            <div class="meals-grid-body">
              <div class="grid-row">
                <div class="grid-cell"><div class="meal-label">🌅 Breakfast</div></div>
                <div class="grid-cell" data-day="monday" data-meal="breakfast"></div>
                <div class="grid-cell" data-day="tuesday" data-meal="breakfast"></div>
                <div class="grid-cell" data-day="wednesday" data-meal="breakfast"></div>
                <div class="grid-cell" data-day="thursday" data-meal="breakfast"></div>
                <div class="grid-cell" data-day="friday" data-meal="breakfast"></div>
                <div class="grid-cell" data-day="saturday" data-meal="breakfast"></div>
                <div class="grid-cell" data-day="sunday" data-meal="breakfast"></div>
              </div>
              <div class="grid-row">
                <div class="grid-cell"><div class="meal-label">🥗 Lunch</div></div>
                <div class="grid-cell" data-day="monday" data-meal="lunch"></div>
                <div class="grid-cell" data-day="tuesday" data-meal="lunch"></div>
                <div class="grid-cell" data-day="wednesday" data-meal="lunch"></div>
                <div class="grid-cell" data-day="thursday" data-meal="lunch"></div>
                <div class="grid-cell" data-day="friday" data-meal="lunch"></div>
                <div class="grid-cell" data-day="saturday" data-meal="lunch"></div>
                <div class="grid-cell" data-day="sunday" data-meal="lunch"></div>
              </div>
              <div class="grid-row">
                <div class="grid-cell"><div class="meal-label">🍽️ Dinner</div></div>
                <div class="grid-cell" data-day="monday" data-meal="dinner"></div>
                <div class="grid-cell" data-day="tuesday" data-meal="dinner"></div>
                <div class="grid-cell" data-day="wednesday" data-meal="dinner"></div>
                <div class="grid-cell" data-day="thursday" data-meal="dinner"></div>
                <div class="grid-cell" data-day="friday" data-meal="dinner"></div>
                <div class="grid-cell" data-day="saturday" data-meal="dinner"></div>
                <div class="grid-cell" data-day="sunday" data-meal="dinner"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Meal Modal -->
      <div id="mealModal" class="modal">
        <div class="modal-content">
          <div class="modal-header">
            <h2 id="modalTitle">Add Meal</h2>
            <button class="modal-close-btn" id="closeModalBtn">✕</button>
          </div>
          <div class="modal-body">
            <form id="mealForm">
              <div class="form-group">
                <label class="form-label">Meal Name</label>
                <input type="text" id="mealNameInput" class="form-input" placeholder="e.g., Grilled Chicken with Rice" required>
              </div>
              <div class="form-group">
                <label class="form-label">Description (optional)</label>
                <textarea id="mealDescInput" class="form-textarea" placeholder="Add notes or recipe details..."></textarea>
              </div>
              <div class="form-group">
                <label class="form-label">Ingredients</label>
                <div id="ingredientsList" style="max-height: 300px; overflow-y: auto; border: 1px solid #e0e0e0; border-radius: 4px; padding: 8px; margin-bottom: 8px; min-height: 60px;"></div>
                <button type="button" id="addIngredientBtn" class="action-btn secondary" style="width: 100%;">+ Add Ingredient</button>
              </div>
              <div class="form-group">
                <label class="form-label">Nutrition Facts (auto-calculated)</label>
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;">
                  <div style="background: #f9f9f9; padding: 12px; border-radius: 4px;">
                    <div style="font-size: 12px; color: #666;">Calories</div>
                    <div id="calDisplay" style="font-size: 18px; font-weight: 600; color: #333;">0</div>
                  </div>
                  <div style="background: #f9f9f9; padding: 12px; border-radius: 4px;">
                    <div style="font-size: 12px; color: #666;">Protein</div>
                    <div id="proteinDisplay" style="font-size: 18px; font-weight: 600; color: #333;">0g</div>
                  </div>
                  <div style="background: #f9f9f9; padding: 12px; border-radius: 4px;">
                    <div style="font-size: 12px; color: #666;">Carbs</div>
                    <div id="carbsDisplay" style="font-size: 18px; font-weight: 600; color: #333;">0g</div>
                  </div>
                  <div style="background: #f9f9f9; padding: 12px; border-radius: 4px;">
                    <div style="font-size: 12px; color: #666;">Fat</div>
                    <div id="fatDisplay" style="font-size: 18px; font-weight: 600; color: #333;">0g</div>
                  </div>
                </div>
              </div>
              <div class="checkbox-group">
                <input type="checkbox" id="saveAsTemplateCheckbox">
                <label for="saveAsTemplateCheckbox">Save as template for future use</label>
              </div>
            </form>
          </div>
          <div class="modal-footer">
            <button type="button" id="deleteBtn" class="action-btn" style="background: #dc3545; margin-right: auto; display: none;">Delete</button>
            <button type="button" id="cancelBtn" class="action-btn secondary">Cancel</button>
            <button type="button" id="saveMealBtn" class="action-btn">Save Meal</button>
          </div>
        </div>
      </div>

      <!-- Ingredient Search Modal -->
      <div id="ingredientSearchModal" class="modal">
        <div class="modal-content" style="max-width: 500px;">
          <div class="modal-header">
            <h2>Add Ingredient</h2>
            <button class="modal-close-btn" id="closeIngredientSearchBtn">✕</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">Ingredient Name</label>
              <input type="text" id="ingredientSearchInput" class="form-input" placeholder="e.g., Chicken, Rice, Broccoli...">
            </div>
            <button type="button" id="searchIngredientBtn" class="action-btn" style="width: 100%; margin-bottom: 16px;">Search Nutrition Database</button>
            <div id="ingredientSearchResults" style="display: none; max-height: 300px; overflow-y: auto; border: 1px solid #e0e0e0; border-radius: 4px;"></div>
            <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e0e0e0;">
              <h3 style="font-size: 14px; font-weight: 600; margin-bottom: 12px;">Or enter manually:</h3>
              <div class="form-group">
                <label class="form-label">Quantity</label>
                <input type="number" id="ingredientQtyInput" class="form-input" placeholder="100" min="0" step="0.1">
              </div>
              <div class="form-group">
                <label class="form-label">Unit</label>
                <select id="ingredientUnitSelect" class="form-input">
                  <option value="g">grams (g)</option>
                  <option value="oz">ounces (oz)</option>
                  <option value="cup">cups</option>
                  <option value="tbsp">tablespoons (tbsp)</option>
                  <option value="tsp">teaspoons (tsp)</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Calories per 100g</label>
                <input type="number" id="ingredientCalInput" class="form-input" placeholder="0" min="0" step="0.1">
              </div>
              <div class="form-group">
                <label class="form-label">Protein (g per 100g)</label>
                <input type="number" id="ingredientProteinInput" class="form-input" placeholder="0" min="0" step="0.1">
              </div>
              <div class="form-group">
                <label class="form-label">Carbs (g per 100g)</label>
                <input type="number" id="ingredientCarbsInput" class="form-input" placeholder="0" min="0" step="0.1">
              </div>
              <div class="form-group">
                <label class="form-label">Fat (g per 100g)</label>
                <input type="number" id="ingredientFatInput" class="form-input" placeholder="0" min="0" step="0.1">
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" id="cancelIngredientBtn" class="action-btn secondary">Cancel</button>
            <button type="button" id="addIngredientConfirmBtn" class="action-btn">Add Ingredient</button>
          </div>
        </div>
      </div>
    `;
  }

  function initializeElements() {
    mealsView = document.getElementById('mealsView');
    weekRangeEl = document.getElementById('weekRange');
    prevWeekBtn = document.getElementById('prevWeekBtn');
    nextWeekBtn = document.getElementById('nextWeekBtn');
    groceryListBtn = document.getElementById('groceryListBtn');
    nutritionReportBtn = document.getElementById('nutritionReportBtn');
    templatesBtn = document.getElementById('templatesBtn');
    mealModal = document.getElementById('mealModal');
    mealForm = document.getElementById('mealForm');
    mealNameInput = document.getElementById('mealNameInput');
    mealDescInput = document.getElementById('mealDescInput');
    ingredientsList = document.getElementById('ingredientsList');
    addIngredientBtn = document.getElementById('addIngredientBtn');
    saveMealBtn = document.getElementById('saveMealBtn');
    deleteBtn = document.getElementById('deleteBtn');
    cancelBtn = document.getElementById('cancelBtn');
    closeModalBtn = document.getElementById('closeModalBtn');
    ingredientSearchModal = document.getElementById('ingredientSearchModal');
    ingredientSearchInput = document.getElementById('ingredientSearchInput');
    searchIngredientBtn = document.getElementById('searchIngredientBtn');
    ingredientSearchResults = document.getElementById('ingredientSearchResults');
    addIngredientConfirmBtn = document.getElementById('addIngredientConfirmBtn');
    cancelIngredientBtn = document.getElementById('cancelIngredientBtn');
    closeIngredientSearchBtn = document.getElementById('closeIngredientSearchBtn');
    modalTitle = document.getElementById('modalTitle');
  }

  function setupEventListeners() {
    // Week navigation
    if (prevWeekBtn) prevWeekBtn.addEventListener('click', previousWeek);
    if (nextWeekBtn) nextWeekBtn.addEventListener('click', nextWeek);

    // Action buttons
    if (groceryListBtn) groceryListBtn.addEventListener('click', showGroceryList);
    if (nutritionReportBtn) nutritionReportBtn.addEventListener('click', showNutritionReport);
    if (templatesBtn) templatesBtn.addEventListener('click', showTemplates);

    // Meal modal
    if (closeModalBtn) closeModalBtn.addEventListener('click', closeMealModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeMealModal);
    if (saveMealBtn) saveMealBtn.addEventListener('click', saveMeal);
    if (deleteBtn) deleteBtn.addEventListener('click', deleteCurrentMeal);
    if (addIngredientBtn) addIngredientBtn.addEventListener('click', openIngredientSearch);

    // Ingredient search modal
    if (closeIngredientSearchBtn) closeIngredientSearchBtn.addEventListener('click', closeIngredientSearch);
    if (cancelIngredientBtn) cancelIngredientBtn.addEventListener('click', closeIngredientSearch);
    if (searchIngredientBtn) searchIngredientBtn.addEventListener('click', searchIngredient);
    if (addIngredientConfirmBtn) addIngredientConfirmBtn.addEventListener('click', confirmAddIngredient);

    // Close modals on outside click
    if (mealModal) {
      mealModal.addEventListener('click', function(e) {
        if (e.target === mealModal) closeMealModal();
      });
    }
    if (ingredientSearchModal) {
      ingredientSearchModal.addEventListener('click', function(e) {
        if (e.target === ingredientSearchModal) closeIngredientSearch();
      });
    }

    // Close modals on Escape
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        closeMealModal();
        closeIngredientSearch();
      }
    });
  }

  function initializeMealsView() {
    // Set current week to Monday of this week
    if (!currentWeekStart) {
      currentWeekStart = window.mealsStorage.getMondayOfWeek(new Date().toISOString().split('T')[0]);
    }
    renderWeekGrid();
  }

  // ===== Week Navigation =====

  function previousWeek() {
    const date = new Date(currentWeekStart);
    date.setDate(date.getDate() - 7);
    currentWeekStart = date.toISOString().split('T')[0];
    renderWeekGrid();
  }

  function nextWeek() {
    const date = new Date(currentWeekStart);
    date.setDate(date.getDate() + 7);
    currentWeekStart = date.toISOString().split('T')[0];
    renderWeekGrid();
  }

  // ===== Grid Rendering =====

  function renderWeekGrid() {
    // Update week range display
    const startDate = new Date(currentWeekStart);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 6);

    const formatDate = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (weekRangeEl) {
      weekRangeEl.textContent = `${formatDate(startDate)} - ${formatDate(endDate)}`;
    }

    // Load meals for this week
    const weekMeals = window.mealsStorage.getMealsForWeek(currentWeekStart);

    // Populate grid cells
    document.querySelectorAll('.grid-cell[data-day][data-meal]').forEach(cell => {
      const day = cell.dataset.day;
      const mealType = cell.dataset.meal;
      const mealRef = weekMeals[day] && weekMeals[day][mealType];

      cell.innerHTML = '';

      if (mealRef) {
        const meal = window.mealsStorage.getMeal(mealRef.mealId);
        if (meal) {
          const btn = createMealButton(meal, day, mealType);
          cell.appendChild(btn);
        } else {
          // Meal not found, show placeholder
          const btn = createEmptyMealButton(day, mealType);
          cell.appendChild(btn);
        }
      } else {
        const btn = createEmptyMealButton(day, mealType);
        cell.appendChild(btn);
      }
    });
  }

  function createEmptyMealButton(day, mealType) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'meal-cell-button';
    btn.textContent = '+ Add meal';
    btn.addEventListener('click', () => openMealModal(null, day, mealType));
    return btn;
  }

  function createMealButton(meal, day, mealType) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'meal-cell-button has-meal';
    
    const title = document.createElement('div');
    title.className = 'meal-title';
    title.textContent = meal.title;

    const nutrition = meal.nutritionFacts || { calories: 0 };
    const preview = document.createElement('div');
    preview.className = 'meal-nutrition-preview';
    preview.textContent = `${nutrition.calories} cal`;

    btn.appendChild(title);
    btn.appendChild(preview);
    btn.addEventListener('click', () => openMealModal(meal, day, mealType));

    return btn;
  }

  // ===== Meal Modal =====

  function openMealModal(meal, day, mealType) {
    currentEditingMealId = meal ? meal.id : null;
    currentEditingDay = day;
    currentEditingMealType = mealType;
    currentIngredients = meal ? JSON.parse(JSON.stringify(meal.ingredients || [])) : [];

    // Set modal title
    if (modalTitle) {
      const dayName = day.charAt(0).toUpperCase() + day.slice(1);
      const mealLabel = mealType.charAt(0).toUpperCase() + mealType.slice(1);
      modalTitle.textContent = meal ? `Edit ${mealLabel}` : `Add ${mealLabel}`;
    }

    // Populate form
    if (mealNameInput) mealNameInput.value = meal ? meal.title : '';
    if (mealDescInput) mealDescInput.value = meal ? (meal.description || '') : '';
    
    // Populate ingredients
    renderIngredientsInModal();

    // Populate template checkbox
    const templateCheckbox = document.getElementById('saveAsTemplateCheckbox');
    if (templateCheckbox) {
      templateCheckbox.checked = meal ? meal.isTemplate : false;
    }

    // Show/hide delete button
    if (deleteBtn) {
      deleteBtn.style.display = meal ? 'block' : 'none';
    }

    // Show modal
    if (mealModal) {
      mealModal.classList.add('open');
      if (mealNameInput) mealNameInput.focus();
    }
  }

  function closeMealModal() {
    if (mealModal) mealModal.classList.remove('open');
    currentEditingMealId = null;
    currentIngredients = [];
    mealForm.reset();
  }

  function renderIngredientsInModal() {
    if (!ingredientsList) return;
    ingredientsList.innerHTML = '';

    if (currentIngredients.length === 0) {
      ingredientsList.textContent = 'No ingredients added yet';
      return;
    }

    currentIngredients.forEach((ing, idx) => {
      const ingDiv = document.createElement('div');
      ingDiv.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 8px; border-bottom: 1px solid #f0f0f0;';

      const info = document.createElement('div');
      info.style.cssText = 'flex: 1; font-size: 13px;';
      info.innerHTML = `
        <div style="font-weight: 500;">${ing.name}</div>
        <div style="color: #999; font-size: 12px;">${ing.quantity} ${ing.unit} (${Math.round(ing.caloriesPer100g * ing.quantity / 100)} cal)</div>
      `;

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.textContent = '✕';
      removeBtn.style.cssText = 'background: none; border: none; color: #dc3545; cursor: pointer; font-size: 16px; padding: 0 4px;';
      removeBtn.addEventListener('click', () => {
        currentIngredients.splice(idx, 1);
        renderIngredientsInModal();
        updateNutritionDisplay();
      });

      ingDiv.appendChild(info);
      ingDiv.appendChild(removeBtn);
      ingredientsList.appendChild(ingDiv);
    });
  }

  function updateNutritionDisplay() {
    let totals = { calories: 0, protein: 0, carbs: 0, fat: 0 };

    currentIngredients.forEach(ing => {
      if (!ing.quantity) return;
      let grams = ing.quantity;
      const unit = (ing.unit || 'g').toLowerCase();
      if (unit === 'oz') grams = ing.quantity * 28.35;
      else if (unit === 'cup') grams = ing.quantity * 240;
      else if (unit === 'tbsp') grams = ing.quantity * 15;
      else if (unit === 'tsp') grams = ing.quantity * 5;

      totals.calories += (ing.caloriesPer100g * grams) / 100;
      totals.protein += (ing.protein * grams) / 100;
      totals.carbs += (ing.carbs * grams) / 100;
      totals.fat += (ing.fat * grams) / 100;
    });

    // Round values
    totals.calories = Math.round(totals.calories);
    totals.protein = Math.round(totals.protein * 10) / 10;
    totals.carbs = Math.round(totals.carbs * 10) / 10;
    totals.fat = Math.round(totals.fat * 10) / 10;

    // Update display
    const calDisplay = document.getElementById('calDisplay');
    const proteinDisplay = document.getElementById('proteinDisplay');
    const carbsDisplay = document.getElementById('carbsDisplay');
    const fatDisplay = document.getElementById('fatDisplay');

    if (calDisplay) calDisplay.textContent = totals.calories;
    if (proteinDisplay) proteinDisplay.textContent = totals.protein + 'g';
    if (carbsDisplay) carbsDisplay.textContent = totals.carbs + 'g';
    if (fatDisplay) fatDisplay.textContent = totals.fat + 'g';
  }

  function saveMeal() {
    if (!mealNameInput || !mealNameInput.value.trim()) {
      showToast('Please enter a meal name', 'error');
      return;
    }

    if (currentIngredients.length === 0) {
      showToast('Please add at least one ingredient', 'error');
      return;
    }

    const meal = {
      id: currentEditingMealId || undefined,
      title: mealNameInput.value.trim(),
      description: mealDescInput ? mealDescInput.value.trim() : '',
      ingredients: currentIngredients,
      isTemplate: document.getElementById('saveAsTemplateCheckbox').checked,
      nutritionFacts: {} // Will be calculated by storage
    };

    // Save meal
    const savedMeal = window.mealsStorage.saveMeal(meal);

    // Add to weekly plan
    window.mealsStorage.addMealToWeek(
      currentWeekStart,
      currentEditingDay,
      currentEditingMealType,
      savedMeal.id,
      savedMeal.title
    );

    showToast(currentEditingMealId ? 'Meal updated' : 'Meal added', 'success');
    closeMealModal();
    renderWeekGrid();
  }

  function deleteCurrentMeal() {
    if (!currentEditingMealId) return;

    if (!confirm('Delete this meal?')) return;

    // Delete from weekly plan
    window.mealsStorage.removeMealFromWeek(currentWeekStart, currentEditingDay, currentEditingMealType);

    showToast('Meal removed from plan', 'success');
    closeMealModal();
    renderWeekGrid();
  }

  // ===== Ingredient Search Modal =====

  function openIngredientSearch() {
    if (ingredientSearchModal) {
      ingredientSearchModal.classList.add('open');
      if (ingredientSearchInput) ingredientSearchInput.focus();
    }
  }

  function closeIngredientSearch() {
    if (ingredientSearchModal) ingredientSearchModal.classList.remove('open');
    if (ingredientSearchInput) ingredientSearchInput.value = '';
    if (ingredientSearchResults) ingredientSearchResults.style.display = 'none';
  }

  async function searchIngredient() {
    const query = ingredientSearchInput.value.trim();
    if (!query) {
      showToast('Enter an ingredient name', 'error');
      return;
    }

    if (searchIngredientBtn) {
      searchIngredientBtn.innerHTML = '<span class="loading"></span> Searching...';
      searchIngredientBtn.disabled = true;
    }

    try {
      const result = await window.mealsAPI.searchIngredient(query);

      if (searchIngredientBtn) {
        searchIngredientBtn.innerHTML = 'Search Nutrition Database';
        searchIngredientBtn.disabled = false;
      }

      if (result) {
        displayIngredientResult(result);
      } else {
        showToast('Ingredient not found. Use manual entry below.', 'error');
        if (ingredientSearchResults) ingredientSearchResults.style.display = 'none';
      }
    } catch (err) {
      console.error('Ingredient search error:', err);
      showToast('Search failed. Try manual entry.', 'error');
      if (searchIngredientBtn) {
        searchIngredientBtn.innerHTML = 'Search Nutrition Database';
        searchIngredientBtn.disabled = false;
      }
    }
  }

  function displayIngredientResult(result) {
    if (!ingredientSearchResults) return;

    ingredientSearchResults.innerHTML = '';
    const resultDiv = document.createElement('div');
    resultDiv.style.cssText = 'padding: 12px; cursor: pointer; border-bottom: 1px solid #f0f0f0; transition: background 0.2s;';
    resultDiv.onmouseover = () => resultDiv.style.background = '#f9f9f9';
    resultDiv.onmouseout = () => resultDiv.style.background = 'white';

    resultDiv.innerHTML = `
      <div style="font-weight: 500; margin-bottom: 4px;">${result.name}</div>
      <div style="font-size: 12px; color: #666;">
        ${result.caloriesPer100g} cal · 
        ${result.protein}g protein · 
        ${result.carbs}g carbs · 
        ${result.fat}g fat
        <span style="color: #999; margin-left: 8px;">(per 100g)</span>
      </div>
    `;

    resultDiv.addEventListener('click', () => {
      // Populate manual entry fields
      document.getElementById('ingredientSearchInput').value = result.name;
      document.getElementById('ingredientQtyInput').value = '100';
      document.getElementById('ingredientUnitSelect').value = 'g';
      document.getElementById('ingredientCalInput').value = result.caloriesPer100g;
      document.getElementById('ingredientProteinInput').value = result.protein;
      document.getElementById('ingredientCarbsInput').value = result.carbs;
      document.getElementById('ingredientFatInput').value = result.fat;
      ingredientSearchResults.style.display = 'none';
    });

    ingredientSearchResults.appendChild(resultDiv);
    ingredientSearchResults.style.display = 'block';
  }

  function confirmAddIngredient() {
    const name = document.getElementById('ingredientSearchInput').value.trim();
    const qty = parseFloat(document.getElementById('ingredientQtyInput').value) || 0;
    const unit = document.getElementById('ingredientUnitSelect').value || 'g';
    const cal = parseFloat(document.getElementById('ingredientCalInput').value) || 0;
    const protein = parseFloat(document.getElementById('ingredientProteinInput').value) || 0;
    const carbs = parseFloat(document.getElementById('ingredientCarbsInput').value) || 0;
    const fat = parseFloat(document.getElementById('ingredientFatInput').value) || 0;

    if (!name) {
      showToast('Enter ingredient name', 'error');
      return;
    }

    if (qty <= 0) {
      showToast('Enter a valid quantity', 'error');
      return;
    }

    currentIngredients.push({
      name,
      quantity: qty,
      unit,
      caloriesPer100g: cal,
      protein,
      carbs,
      fat
    });

    showToast('Ingredient added', 'success');
    closeIngredientSearch();
    renderIngredientsInModal();
    updateNutritionDisplay();
  }

  // ===== Action Buttons (Stubs for Phase 5) =====

  function showGroceryList() {
    showToast('Grocery list feature coming in Phase 5', 'error');
  }

  function showNutritionReport() {
    showToast('Nutrition report feature coming in Phase 5', 'error');
  }

  function showTemplates() {
    showToast('Templates feature coming in Phase 4', 'error');
  }

  // ===== Toast Notifications =====

  function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 3000);
  }
})();
