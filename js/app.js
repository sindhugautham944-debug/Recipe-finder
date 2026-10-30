const STORAGE_KEY = "good-measure-data-v1";
const SLOTS = ["Breakfast", "Lunch", "Dinner", "Snack"];
const DIETS = ["vegetarian", "vegan", "gluten-free", "dairy-free", "nut-free"];
const app = document.querySelector("#app");
const dialog = document.querySelector("#recipe-dialog");
let recipes = [];
let visibleCount = 8;
let searchTimer;
let plannerOffset = 0;
let mobileDayOffset = 0;

const defaultState = () => ({
  schemaVersion: 1,
  favorites: [],
  customRecipes: [],
  plan: {},
  grocery: [],
  preferences: { diets: [], excluded: [], householdSize: 2, units: "metric", theme: "system" },
  recentSearches: []
});

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || saved.schemaVersion !== 1) return defaultState();
    const fresh = defaultState();
    return {
      ...fresh,
      ...saved,
      preferences: { ...fresh.preferences, ...(saved.preferences || {}) },
      favorites: Array.isArray(saved.favorites) ? saved.favorites : [],
      customRecipes: Array.isArray(saved.customRecipes) ? saved.customRecipes : [],
      grocery: Array.isArray(saved.grocery) ? saved.grocery : [],
      plan: saved.plan && typeof saved.plan === "object" ? saved.plan : {}
    };
  } catch {
    return defaultState();
  }
}

let state = loadState();
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  updateNavCount();
}
function allRecipes() { return [...recipes, ...state.customRecipes]; }
function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
function safeUrl(value) {
  try {
    const url = new URL(value, window.location.href);
    return url.protocol === "https:" ? url.href : "";
  } catch { return ""; }
}
function todayISO() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function dateISO(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function parseISO(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}
function addDays(date, amount) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + amount);
  return copy;
}
function mondayOf(date) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  result.setDate(result.getDate() - ((result.getDay() + 6) % 7));
  return result;
}
function dateLabel(date, options = { month: "short", day: "numeric" }) {
  return new Intl.DateTimeFormat(undefined, options).format(date);
}
function currentRoute() {
  const route = location.hash.replace(/^#\/?/, "");
  return route.split("/")[0] || "home";
}
function toast(message) {
  const region = document.querySelector("#toast-region");
  const item = document.createElement("div");
  item.className = "toast";
  item.textContent = message;
  region.append(item);
  window.setTimeout(() => item.remove(), 2600);
}
function updateNavCount() {
  const count = state.grocery.filter(item => !item.checked).length;
  const badge = document.querySelector("#grocery-count");
  if (badge) badge.textContent = count;
}
function routeTo(route) { location.hash = `/${route}`; }

function recipeImage(recipe, className = "") {
  const url = safeUrl(recipe.image || "");
  return url
    ? `<img class="${className}" src="${escapeHtml(url)}" alt="${escapeHtml(recipe.title)}" loading="lazy" width="640" height="448">`
    : `<span class="food-emoji" role="img" aria-label="${escapeHtml(recipe.title)}">${escapeHtml(recipe.emoji || "🍽️")}</span>`;
}
function recipeCard(recipe) {
  const saved = state.favorites.includes(recipe.id);
  return `<article class="recipe-card">
    <div class="recipe-image">${recipeImage(recipe)}<button class="card-heart" type="button" data-favorite="${escapeHtml(recipe.id)}" aria-label="${saved ? "Remove" : "Save"} ${escapeHtml(recipe.title)}" aria-pressed="${saved}">${saved ? "♥" : "♡"}</button></div>
    <div class="recipe-card-body">
      <div class="recipe-meta"><span>${escapeHtml(recipe.category || "Recipe")}</span><span>${recipe.timeMinutes ? `${recipe.timeMinutes} min` : "Flexible"}</span></div>
      <h3 class="recipe-title"><button type="button" data-open-recipe="${escapeHtml(recipe.id)}">${escapeHtml(recipe.title)}</button></h3>
      <div class="recipe-tags">${(recipe.tags || []).slice(0, 3).map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>
      <div class="card-actions"><span class="recipe-meta">${escapeHtml(recipe.cuisine || "Home cooking")}</span><button class="button secondary small" type="button" data-open-recipe="${escapeHtml(recipe.id)}">View recipe <span aria-hidden="true">↗</span></button></div>
    </div>
  </article>`;
}
function renderCards(list, limit = 24) {
  if (!list.length) return `<div class="empty-state"><span class="empty-icon" aria-hidden="true">⌕</span><h2>Nothing on the menu yet</h2><p>Try a different search or loosen a filter.</p><button class="button secondary" type="button" data-clear-filters>Clear filters</button></div>`;
  const shown = list.slice(0, limit);
  return `<div class="recipe-grid">${shown.map(recipeCard).join("")}</div>${list.length > limit ? `<button class="button secondary load-more" type="button" data-load-more>Show more recipes</button>` : ""}`;
}

function renderHome() {
  const all = allRecipes();
  const todayRecipe = all[Math.floor(new Date().getDate() % Math.max(all.length, 1))] || all[0];
  const planned = Object.values(state.plan).flatMap(day => Object.values(day || {})).filter(Boolean).length;
  app.innerHTML = `<section class="home-hero" aria-labelledby="home-title">
    <div class="home-hero-copy"><p class="eyebrow">A little more delicious, every day</p><h1 id="home-title">What sounds good today?</h1><p class="subhead">Find your next favorite, make a plan that fits real life, and shop from one simple list.</p>
      <form class="search-form" id="home-search"><span class="search-icon" aria-hidden="true">⌕</span><label class="visually-hidden" for="home-query">Search recipes or ingredients</label><input id="home-query" name="q" placeholder="Try pasta, chickpeas, or salmon" autocomplete="off"><button type="submit">Find a recipe</button></form><p class="hero-note">A small, local recipe collection. No account, no fuss.</p>
    </div><div class="hero-art" aria-hidden="true"><span class="hero-spark one">✳</span><div class="plate"><div class="plate-inner">🥗</div></div><span class="hero-spark two">✦</span></div>
  </section>
  <section aria-labelledby="shortcuts-title"><div class="section-heading"><div><p class="eyebrow">Pick a direction</p><h2 id="shortcuts-title">What are you in the mood for?</h2></div><a class="text-link" href="#/search">Browse all recipes →</a></div>
    <div class="shortcut-grid">${[["Breakfast","☀","A fresh start"],["Lunch","🥬","A midday reset"],["Dinner","♨","Something satisfying"],["Snack","✿","A little something"]].map(([category, icon, note]) => `<a class="shortcut" href="#/search?category=${encodeURIComponent(category)}"><span class="shortcut-icon" aria-hidden="true">${icon}</span><span><strong>${category}</strong><small>${note}</small></span></a>`).join("")}</div>
  </section>
  <section aria-labelledby="today-pick-title"><div class="section-heading"><div><p class="eyebrow">The daily pick</p><h2 id="today-pick-title">A good place to start</h2></div><a class="text-link" href="#/search">See all →</a></div>${todayRecipe ? `<div class="recipe-grid">${recipeCard(todayRecipe)}</div>` : ""}</section>
  <section aria-label="Your week"><div class="section-heading"><div><p class="eyebrow">Your week, your way</p><h2>Make room for good food</h2></div></div><div class="week-strip"><div><h3>${planned ? `${planned} meal${planned === 1 ? "" : "s"} on the calendar` : "A plan can start with one meal"}</h3><p>${planned ? "Your shopping list is ready whenever you are." : "Choose a few recipes and let the shopping list come together."}</p></div><a class="button" href="#/planner">Open meal planner <span aria-hidden="true">→</span></a></div></section>`;
}

function searchRecipes() {
  const params = new URLSearchParams(location.hash.split("?")[1] || "");
  const query = (document.querySelector("#recipe-search")?.value || params.get("q") || "").trim().toLowerCase();
  const category = document.querySelector("#filter-category")?.value || params.get("category") || "";
  const cuisine = document.querySelector("#filter-cuisine")?.value || "";
  const maxTime = document.querySelector("#filter-time")?.value || "";
  const checkedDiets = [...document.querySelectorAll("[data-diet-filter]:checked")].map(input => input.value);
  const excluded = state.preferences.excluded.map(value => value.toLowerCase()).filter(Boolean);
  return allRecipes().filter(recipe => {
    const text = `${recipe.title} ${recipe.category} ${recipe.cuisine} ${(recipe.ingredients || []).map(item => item.name).join(" ")}`.toLowerCase();
    return (!query || text.includes(query)) && (!category || recipe.category === category) && (!cuisine || recipe.cuisine === cuisine) &&
      (!maxTime || (recipe.timeMinutes || 999) <= Number(maxTime)) && [...state.preferences.diets, ...checkedDiets].every(diet => (recipe.tags || []).includes(diet)) &&
      !excluded.some(term => text.includes(term));
  });
}
function renderSearch() {
  const params = new URLSearchParams(location.hash.split("?")[1] || "");
  const currentQuery = params.get("q") || "";
  const currentCategory = params.get("category") || "";
  app.innerHTML = `<header class="page-head"><div><p class="eyebrow">Find your next favorite</p><h1>Recipe shelf</h1><p class="subhead">A thoughtful little collection, ready for whatever you have in mind.</p></div></header>
    <div class="search-layout"><aside class="filters" aria-label="Recipe filters"><div class="filter-title"><strong>Filter recipes</strong><button class="button ghost small" type="button" data-clear-filters>Clear</button></div><div class="filter-content">
      <div class="filter-group"><label class="group-label" for="filter-category">Meal type</label><select id="filter-category"><option value="">All types</option>${[...new Set(allRecipes().map(r => r.category).filter(Boolean))].sort().map(value => `<option ${currentCategory === value ? "selected" : ""}>${escapeHtml(value)}</option>`).join("")}</select></div>
      <div class="filter-group"><label class="group-label" for="filter-cuisine">Cuisine</label><select id="filter-cuisine"><option value="">All cuisines</option>${[...new Set(allRecipes().map(r => r.cuisine).filter(Boolean))].sort().map(value => `<option>${escapeHtml(value)}</option>`).join("")}</select></div>
      <div class="filter-group"><label class="group-label" for="filter-time">Ready in</label><select id="filter-time"><option value="">Any time</option><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">60 minutes</option></select></div>
      <div class="filter-group"><span class="group-label">Dietary tags</span>${DIETS.map(diet => `<label class="check-row"><input type="checkbox" value="${diet}" data-diet-filter>${diet.replace("-", " ")}</label>`).join("")}</div>
    </div></aside><section aria-label="Recipe results"><div class="search-toolbar"><div class="search-inline"><span aria-hidden="true">⌕</span><label class="visually-hidden" for="recipe-search">Search recipes, ingredients, or cuisine</label><input id="recipe-search" type="search" value="${escapeHtml(currentQuery)}" placeholder="Recipe, ingredient, cuisine..."></div><span class="results-count" id="results-count" aria-live="polite"></span></div><div id="results"></div></section></div>`;
  const refresh = () => {
    const results = searchRecipes();
    visibleCount = Math.min(visibleCount, 24);
    document.querySelector("#results-count").textContent = `${results.length} ${results.length === 1 ? "recipe" : "recipes"}`;
    document.querySelector("#results").innerHTML = renderCards(results, visibleCount);
  };
  const input = document.querySelector("#recipe-search");
  input.addEventListener("input", () => { window.clearTimeout(searchTimer); searchTimer = window.setTimeout(refresh, 300); });
  document.querySelectorAll("#filter-category, #filter-cuisine, #filter-time, [data-diet-filter]").forEach(control => control.addEventListener("change", refresh));
  refresh();
}

function getWeekDates() {
  const start = mondayOf(addDays(new Date(), plannerOffset * 7));
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}
function slotMarkup(date, slot) {
  const day = state.plan[date] || {};
  const entry = day[slot.toLowerCase()];
  const recipe = entry && allRecipes().find(item => item.id === entry.recipeId);
  return `<div class="meal-slot"><div class="meal-slot-label">${slot}</div>${recipe ? `<span class="slot-recipe">${escapeHtml(recipe.title)}</span><span class="slot-serving">${entry.servings || state.preferences.householdSize} servings</span><div class="slot-buttons"><button type="button" data-plan-action="edit" data-date="${date}" data-slot="${slot.toLowerCase()}">Replace</button><button type="button" data-plan-action="servings" data-date="${date}" data-slot="${slot.toLowerCase()}">Servings</button><button type="button" data-plan-action="remove" data-date="${date}" data-slot="${slot.toLowerCase()}">Remove</button></div>` : `<button class="add-slot" type="button" data-plan-action="add" data-date="${date}" data-slot="${slot.toLowerCase()}">+ Add meal</button>`}</div>`;
}
function renderPlanner() {
  const dates = getWeekDates();
  const start = dates[0];
  const end = dates[6];
  const weekText = `${dateLabel(start)} – ${dateLabel(end, { month: "short", day: "numeric", year: start.getFullYear() !== end.getFullYear() ? "numeric" : undefined })}`;
  const selectedIndex = Math.max(0, Math.min(6, mobileDayOffset));
  const selectedDate = dates[selectedIndex];
  app.innerHTML = `<header class="page-head"><div><p class="eyebrow">Make a little plan</p><h1>Meal planner</h1><p class="subhead">A week of ideas, with plenty of room to change your mind.</p></div><button class="button secondary" type="button" data-today>Jump to this week</button></header>
    <div class="planner-top"><div class="week-controls"><button class="icon-button" type="button" data-week="-1" aria-label="Previous week">←</button><strong class="week-label">${weekText}</strong><button class="icon-button" type="button" data-week="1" aria-label="Next week">→</button></div><a class="button" href="#/grocery">Build shopping list <span aria-hidden="true">→</span></a></div>
    <div class="planner-grid" aria-label="Weekly meal plan">${dates.map(date => { const iso = dateISO(date); return `<section class="day-column ${iso === todayISO() ? "today" : ""}"><div class="day-head"><strong>${dateLabel(date, { weekday: "short" })}${iso === todayISO() ? " · Today" : ""}</strong><small>${dateLabel(date)}</small></div>${SLOTS.map(slot => slotMarkup(iso, slot)).join("")}</section>`; }).join("")}</div>
    <section class="planner-mobile-day"><div class="planner-top"><div class="week-controls"><button class="icon-button" type="button" data-day="-1" aria-label="Previous day">←</button><strong class="week-label">${dateLabel(selectedDate, { weekday: "long", month: "short", day: "numeric" })}</strong><button class="icon-button" type="button" data-day="1" aria-label="Next day">→</button></div></div>${SLOTS.map(slot => slotMarkup(dateISO(selectedDate), slot)).join("")}</section>
    <p class="subhead" style="margin-top:16px;font-size:12px">Your household size is ${state.preferences.householdSize}. Change it anytime in <a class="text-link" href="#/settings">settings</a>.</p>`;
}

function weekRange() {
  const start = mondayOf(new Date());
  return { start: dateISO(start), end: dateISO(addDays(start, 6)) };
}
function groceryKey(name, unit) { return `${name.trim().toLowerCase()}|${(unit || "").trim().toLowerCase()}`; }
function categorizeIngredient(name) {
  const value = name.toLowerCase();
  if (/spinach|lettuce|tomato|onion|garlic|carrot|pepper|cucumber|lemon|lime|herb|potato|cabbage|avocado|apple|pear|cauliflower|pea|peach|basil|leek/.test(value)) return "Produce";
  if (/milk|cheese|yogurt|ricotta|parmesan|butter|cream|egg/.test(value)) return "Dairy & eggs";
  if (/salmon|chicken|beef|pork|fish|turkey/.test(value)) return "Meat & fish";
  if (/oil|pasta|rice|bean|lentil|oat|flour|sugar|stock|spice|cumin|paprika|sauce|tortilla|noodle|chickpea|coconut|tahini|walnut|granola|seed|orzo|bread|curry|harissa|quinoa/.test(value)) return "Pantry";
  return "Other";
}
function generateGroceries(start, end) {
  const merged = new Map();
  for (const [date, day] of Object.entries(state.plan)) {
    if (date < start || date > end) continue;
    for (const entry of Object.values(day || {})) {
      if (!entry) continue;
      const recipe = allRecipes().find(item => item.id === entry.recipeId);
      if (!recipe) continue;
      const factor = (Number(entry.servings) || state.preferences.householdSize) / (Number(recipe.servings) || 1);
      for (const ingredient of recipe.ingredients || []) {
        const key = groceryKey(ingredient.name, ingredient.unit);
        const old = merged.get(key);
        const quantity = ingredient.quantity == null ? null : Number(ingredient.quantity) * factor;
        if (old && old.quantity != null && quantity != null) old.quantity += quantity;
        else if (!old) merged.set(key, { id: `plan-${key}`, name: ingredient.name, quantity, unit: ingredient.unit || "", category: categorizeIngredient(ingredient.name), checked: false, manual: false });
      }
    }
  }
  const manual = state.grocery.filter(item => item.manual);
  state.grocery = [...merged.values(), ...manual];
  saveState();
}
function quantityText(item) {
  if (item.quantity == null) return "";
  const rounded = Math.round(item.quantity * 10) / 10;
  return `${rounded} ${item.unit || ""}`.trim();
}
function renderGrocery() {
  const range = weekRange();
  const unchecked = state.grocery.filter(item => !item.checked);
  const checked = state.grocery.filter(item => item.checked);
  const ordered = [...unchecked, ...checked];
  const groups = ["Produce", "Dairy & eggs", "Meat & fish", "Pantry", "Other"];
  const groupHTML = groups.map(group => {
    const items = ordered.filter(item => (item.category || "Other") === group);
    return items.length ? `<section class="grocery-group"><h3>${group} <span>(${items.length})</span></h3>${items.map(item => `<div class="grocery-item ${item.checked ? "checked" : ""}"><input type="checkbox" data-grocery-check="${escapeHtml(item.id)}" ${item.checked ? "checked" : ""} aria-label="Mark ${escapeHtml(item.name)} ${item.checked ? "not bought" : "bought"}"><span class="grocery-item-name">${escapeHtml(item.name)}</span><span class="grocery-quantity">${escapeHtml(quantityText(item))}</span><button class="delete-item" type="button" data-grocery-delete="${escapeHtml(item.id)}" aria-label="Remove ${escapeHtml(item.name)}">×</button></div>`).join("")}</section>` : "";
  }).join("");
  const plannedCount = Object.entries(state.plan).filter(([date]) => date >= range.start && date <= range.end).reduce((sum, [, day]) => sum + Object.values(day || {}).filter(Boolean).length, 0);
  app.innerHTML = `<header class="page-head"><div><p class="eyebrow">One list, less backtracking</p><h1>Shopping list</h1><p class="subhead">Ingredients from your plan, grouped for an easier shop.</p></div></header>
    <div class="grocery-layout"><section><div class="grocery-toolbar"><div><strong>${state.grocery.length} items</strong><div class="date-range"><label for="grocery-start">From</label><input id="grocery-start" type="date" value="${range.start}"><label for="grocery-end">to</label><input id="grocery-end" type="date" value="${range.end}"></div></div><button class="button" type="button" data-generate-list>Update from plan</button></div>
      ${state.grocery.length ? groupHTML : `<div class="empty-state"><span class="empty-icon" aria-hidden="true">☷</span><h2>Your list is ready to fill</h2><p>${plannedCount ? "Pull ingredients from your planned meals or add a few items yourself." : "Add meals to your week, then build your shopping list."}</p><a class="button secondary" href="#/planner">Open meal planner</a></div>`}</section>
      <aside class="grocery-aside"><h3>Something missing?</h3><p>Add any extra bits you need. They stay on your list when you update it from the plan.</p><form class="manual-form" id="manual-item-form"><label class="visually-hidden" for="manual-item">Add an item</label><input id="manual-item" maxlength="80" placeholder="e.g. coffee"><button class="button" type="submit" aria-label="Add item">+</button></form><div class="grocery-actions"><button class="button secondary small" type="button" data-copy-list>Copy list</button><button class="button secondary small" type="button" data-print>Print</button></div><p style="margin:14px 0 0">${unchecked.length} left to pick up</p></aside>
    </div>`;
}

function renderFavorites() {
  const favorites = state.favorites.map(id => allRecipes().find(recipe => recipe.id === id)).filter(Boolean);
  app.innerHTML = `<header class="page-head"><div><p class="eyebrow">Keep the good ones close</p><h1>Saved recipes</h1><p class="subhead">Your personal shortlist, always here in this browser.</p></div><a class="button secondary" href="#/search">Find more recipes</a></header>${renderCards(favorites)}`;
}
function renderSettings() {
  const pref = state.preferences;
  app.innerHTML = `<header class="page-head"><div><p class="eyebrow">Make it yours</p><h1>Settings</h1><p class="subhead">A few preferences make your recipe shelf feel more like home.</p></div></header>
    <div class="settings-grid"><section class="settings-panel"><h2>Food preferences</h2><p>Recipes that don't match these diets or exclusions are hidden from search.</p><div class="field"><span class="group-label">Dietary needs</span>${DIETS.map(diet => `<label class="check-row"><input type="checkbox" data-setting-diet="${diet}" ${pref.diets.includes(diet) ? "checked" : ""}>${diet.replace("-", " ")}</label>`).join("")}</div><div class="field"><label for="excluded-ingredients">Ingredients to exclude</label><textarea id="excluded-ingredients" maxlength="500" placeholder="e.g. mushrooms, cilantro">${escapeHtml(pref.excluded.join(", "))}</textarea><small>Separate ingredients with commas.</small></div></section>
    <section class="settings-panel"><h2>Your kitchen</h2><p>Use your household size to set servings for new plan entries.</p><div class="field"><label for="household-size">Default servings</label><input id="household-size" type="number" min="1" max="12" value="${pref.householdSize}"></div><div class="field"><label for="theme-select">Appearance</label><select id="theme-select"><option value="system" ${pref.theme === "system" ? "selected" : ""}>Use device setting</option><option value="light" ${pref.theme === "light" ? "selected" : ""}>Light</option><option value="dark" ${pref.theme === "dark" ? "selected" : ""}>Dark</option></select></div><div class="field"><label for="units-select">Units</label><select id="units-select"><option value="metric" ${pref.units === "metric" ? "selected" : ""}>Metric</option><option value="imperial" ${pref.units === "imperial" ? "selected" : ""}>Imperial</option></select><small>Unit conversion will be available in a later release.</small></div></section>
    <section class="settings-panel full"><h2>Your data</h2><p>Everything is stored in this browser. Export a backup before clearing site data or changing devices.</p><div class="setting-actions"><button class="button secondary" type="button" data-export>Export backup</button><label class="button secondary" for="import-file">Import backup</label><input class="visually-hidden" id="import-file" type="file" accept="application/json,.json"><button class="button danger" type="button" data-clear-data>Clear all data</button></div></section>
    <p class="notice settings-panel full">Dietary labels are informational. Always check ingredient packaging and labels for allergens.</p></div>`;
}

function render() {
  const route = currentRoute();
  document.querySelectorAll("[data-route]").forEach(link => {
    const active = link.dataset.route === route || (route === "recipe" && link.dataset.route === "search");
    if (active) link.setAttribute("aria-current", "page"); else link.removeAttribute("aria-current");
  });
  document.documentElement.dataset.theme = state.preferences.theme === "system"
    ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : state.preferences.theme;
  updateNavCount();
  if (route === "home") renderHome();
  else if (route === "search") renderSearch();
  else if (route === "planner") renderPlanner();
  else if (route === "grocery") renderGrocery();
  else if (route === "favorites") renderFavorites();
  else if (route === "settings") renderSettings();
  else if (route === "recipe") openRecipe(decodeURIComponent(location.hash.split("/")[2] || ""));
  else renderHome();
}

function openRecipe(id) {
  const recipe = allRecipes().find(item => item.id === id);
  if (!recipe) { toast("That recipe couldn't be found."); return; }
  const saved = state.favorites.includes(id);
  const servings = Number(recipe.servings) || 2;
  dialog.innerHTML = `<div class="dialog-image">${recipeImage(recipe)}<button class="dialog-close" type="button" data-close-dialog aria-label="Close recipe">×</button></div><div class="dialog-content"><p class="eyebrow">${escapeHtml(recipe.category || "Recipe")} · ${escapeHtml(recipe.cuisine || "Home cooking")}</p><h2 id="dialog-title">${escapeHtml(recipe.title)}</h2><div class="detail-meta"><span>◷ ${recipe.timeMinutes || "—"} min</span><span>${servings} servings</span><span>${(recipe.tags || []).map(escapeHtml).join(" · ")}</span></div>
    <div class="detail-actions"><button class="button ${saved ? "secondary" : ""}" type="button" data-favorite="${escapeHtml(recipe.id)}" aria-pressed="${saved}">${saved ? "♥ Saved" : "♡ Save recipe"}</button><button class="button secondary" type="button" data-dialog-plan="${escapeHtml(recipe.id)}">Add to plan</button><div class="servings-control"><label for="serving-scale">Serves</label><input id="serving-scale" type="number" min="1" max="12" value="${servings}"></div></div>
    <div class="detail-columns"><section><h3>Ingredients</h3><ul class="ingredient-list" id="detail-ingredients">${(recipe.ingredients || []).map((item, index) => `<li data-ingredient-index="${index}"></li>`).join("")}</ul></section><section><h3>Let's cook</h3><ol class="steps-list">${(recipe.steps || []).map(step => `<li>${escapeHtml(step)}</li>`).join("")}</ol></section></div>${safeUrl(recipe.sourceUrl) ? `<p style="margin:20px 0 0"><a class="source-link" href="${escapeHtml(safeUrl(recipe.sourceUrl))}" target="_blank" rel="noopener noreferrer">Original recipe ↗</a></p>` : ""}</div>`;
  const updateIngredients = () => {
    const amount = Math.max(1, Math.min(12, Number(document.querySelector("#serving-scale").value) || servings));
    document.querySelectorAll("[data-ingredient-index]").forEach(element => {
      const item = recipe.ingredients[Number(element.dataset.ingredientIndex)];
      const quantity = item.quantity == null ? "" : `${formatQuantity(item.quantity * amount / servings)} ${item.unit || ""} `;
      element.textContent = `${quantity}${item.name}`;
    });
  };
  dialog.querySelector("#serving-scale").addEventListener("input", updateIngredients);
  updateIngredients();
  if (!dialog.open) dialog.showModal();
}
function formatQuantity(value) {
  const rounded = Math.round(value * 4) / 4;
  if (rounded % 1 === 0) return String(rounded);
  if (rounded % 1 === 0.25) return `${Math.floor(rounded)}¼`.replace(/^0¼$/, "¼");
  if (rounded % 1 === 0.5) return `${Math.floor(rounded)}½`.replace(/^0½$/, "½");
  if (rounded % 1 === 0.75) return `${Math.floor(rounded)}¾`.replace(/^0¾$/, "¾");
  return String(Math.round(value * 10) / 10);
}
function toggleFavorite(id) {
  if (state.favorites.includes(id)) {
    state.favorites = state.favorites.filter(item => item !== id);
    toast("Removed from saved recipes.");
  } else {
    state.favorites.push(id);
    toast("Saved for later.");
  }
  saveState();
  render();
  if (dialog.open) openRecipe(id);
}
function promptPlan(date, slot, recipeId = "") {
  const options = allRecipes().map(recipe => `<option value="${escapeHtml(recipe.id)}" ${recipe.id === recipeId ? "selected" : ""}>${escapeHtml(recipe.title)}</option>`).join("");
  const chosen = window.prompt(`Choose a recipe for ${slot} on ${dateLabel(parseISO(date), { weekday: "long", month: "short", day: "numeric" })}. Enter a number:\n${allRecipes().map((recipe, index) => `${index + 1}. ${recipe.title}`).join("\n")}`, recipeId ? String(Math.max(0, allRecipes().findIndex(item => item.id === recipeId) + 1)) : "");
  if (chosen === null) return;
  const index = Number(chosen) - 1;
  const recipe = allRecipes()[index] || allRecipes().find(item => item.id === chosen) || allRecipes().find(item => item.title.toLowerCase() === chosen.toLowerCase());
  if (!recipe) { toast("Enter a recipe number from the list."); return; }
  const day = state.plan[date] || {};
  day[slot] = { recipeId: recipe.id, title: recipe.title, image: recipe.image || "", servings: Number(day[slot]?.servings) || Number(state.preferences.householdSize) || 2 };
  state.plan[date] = day;
  saveState();
  render();
  toast("Meal added to your plan.");
  void options;
}
function adjustPlanServings(date, slot) {
  const entry = state.plan[date]?.[slot];
  if (!entry) return;
  const servings = window.prompt("How many servings? (1–12)", String(entry.servings || state.preferences.householdSize));
  if (servings === null) return;
  const value = Number(servings);
  if (!Number.isInteger(value) || value < 1 || value > 12) { toast("Choose between 1 and 12 servings."); return; }
  entry.servings = value;
  saveState();
  render();
}
function addRecipeIngredients(recipe) {
  for (const ingredient of recipe.ingredients || []) {
    const existing = state.grocery.find(item => groceryKey(item.name, item.unit) === groceryKey(ingredient.name, ingredient.unit) && item.manual);
    if (existing && existing.quantity != null && ingredient.quantity != null) existing.quantity += ingredient.quantity;
    else state.grocery.push({ id: `manual-${Date.now()}-${Math.random().toString(16).slice(2)}`, name: ingredient.name, quantity: ingredient.quantity, unit: ingredient.unit || "", category: categorizeIngredient(ingredient.name), checked: false, manual: true });
  }
  saveState();
  toast("Ingredients added to your list.");
}
function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `good-measure-backup-${todayISO()}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}
function validateImport(data) {
  if (!data || typeof data !== "object" || data.schemaVersion !== 1) return false;
  if (!Array.isArray(data.favorites) || !Array.isArray(data.grocery) || !Array.isArray(data.customRecipes) || !data.plan || typeof data.plan !== "object" || !data.preferences || typeof data.preferences !== "object") return false;
  if (data.favorites.some(id => typeof id !== "string" || id.length > 120)) return false;
  if (data.grocery.some(item => !item || typeof item.name !== "string" || item.name.length > 120 || typeof item.id !== "string")) return false;
  if (data.customRecipes.some(recipe => !recipe || typeof recipe.id !== "string" || typeof recipe.title !== "string" || !Array.isArray(recipe.ingredients) || !Array.isArray(recipe.steps))) return false;
  return true;
}
function handleClick(event) {
  const target = event.target.closest("button, a, label");
  if (!target) return;
  if (target.matches("[data-favorite]")) { event.preventDefault(); toggleFavorite(target.dataset.favorite); }
  else if (target.matches("[data-open-recipe]")) { event.preventDefault(); openRecipe(target.dataset.openRecipe); }
  else if (target.matches("[data-load-more]")) { visibleCount = Math.min(visibleCount + 8, 24); const results = searchRecipes(); document.querySelector("#results").innerHTML = renderCards(results, visibleCount); }
  else if (target.matches("[data-clear-filters]")) { if (location.hash.startsWith("#/search")) { location.hash = "/search"; renderSearch(); } }
  else if (target.matches("[data-week]")) { plannerOffset += Number(target.dataset.week); mobileDayOffset = Math.min(mobileDayOffset, 6); renderPlanner(); }
  else if (target.matches("[data-day]")) { mobileDayOffset = Math.max(0, Math.min(6, mobileDayOffset + Number(target.dataset.day))); renderPlanner(); }
  else if (target.matches("[data-today]")) { plannerOffset = 0; mobileDayOffset = Math.max(0, Math.min(6, (new Date().getDay() + 6) % 7)); renderPlanner(); }
  else if (target.matches("[data-plan-action]")) {
    const { date, slot, planAction } = target.dataset;
    if (planAction === "add" || planAction === "edit") promptPlan(date, slot, state.plan[date]?.[slot]?.recipeId || "");
    if (planAction === "remove") { delete state.plan[date][slot]; saveState(); renderPlanner(); toast("Meal removed from your plan."); }
    if (planAction === "servings") adjustPlanServings(date, slot);
  }
  else if (target.matches("[data-dialog-plan]")) {
    const date = window.prompt("Which date? Use YYYY-MM-DD.", todayISO());
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parseISO(date).getTime())) return;
    const slot = window.prompt(`Which meal? ${SLOTS.join(", ")}`, "Dinner");
    if (!slot || !SLOTS.map(item => item.toLowerCase()).includes(slot.toLowerCase())) { toast("Choose breakfast, lunch, dinner, or snack."); return; }
    const recipe = allRecipes().find(item => item.id === target.dataset.dialogPlan);
    const day = state.plan[date] || {};
    day[slot.toLowerCase()] = { recipeId: recipe.id, title: recipe.title, image: recipe.image || "", servings: Number(state.preferences.householdSize) || 2 };
    state.plan[date] = day; saveState(); toast("Meal added to your plan."); dialog.close();
  }
  else if (target.matches("[data-close-dialog]")) dialog.close();
  else if (target.matches("[data-generate-list]")) {
    const start = document.querySelector("#grocery-start").value;
    const end = document.querySelector("#grocery-end").value;
    if (!start || !end || start > end) { toast("Choose a valid date range."); return; }
    generateGroceries(start, end); renderGrocery(); toast("Shopping list updated from your plan.");
  }
  else if (target.matches("[data-grocery-delete]")) { state.grocery = state.grocery.filter(item => item.id !== target.dataset.groceryDelete); saveState(); renderGrocery(); }
  else if (target.matches("[data-copy-list]")) {
    const text = state.grocery.map(item => `${item.checked ? "[x]" : "[ ]"} ${quantityText(item)} ${item.name}`.trim()).join("\n");
    navigator.clipboard?.writeText(text).then(() => toast("Shopping list copied.")).catch(() => toast("Couldn't copy the list here."));
  }
  else if (target.matches("[data-print]")) window.print();
  else if (target.matches("[data-export]")) exportData();
  else if (target.matches("[data-clear-data]")) {
    if (window.confirm("Clear your saved recipes, meal plan, shopping list, and preferences from this browser? This cannot be undone.")) {
      state = defaultState(); saveState(); renderSettings(); toast("Your local data has been cleared.");
    }
  }
}
function handleChange(event) {
  const target = event.target;
  if (target.matches("[data-grocery-check]")) {
    const item = state.grocery.find(entry => entry.id === target.dataset.groceryCheck);
    if (item) item.checked = target.checked;
    saveState(); renderGrocery();
  } else if (target.matches("[data-setting-diet]")) {
    const diet = target.dataset.settingDiet;
    state.preferences.diets = target.checked ? [...new Set([...state.preferences.diets, diet])] : state.preferences.diets.filter(item => item !== diet);
    saveState();
  } else if (target.matches("#household-size")) {
    state.preferences.householdSize = Math.max(1, Math.min(12, Number(target.value) || 2)); saveState();
  } else if (target.matches("#theme-select")) { state.preferences.theme = target.value; saveState(); render(); }
  else if (target.matches("#units-select")) { state.preferences.units = target.value; saveState(); }
  else if (target.matches("#import-file")) {
    const file = target.files?.[0];
    if (!file) return;
    if (file.size > 1_000_000) { toast("Backup file is too large (maximum 1 MB)."); target.value = ""; return; }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (!validateImport(data)) throw new Error("Invalid backup format");
        state = { ...defaultState(), ...data, preferences: { ...defaultState().preferences, ...data.preferences } };
        saveState(); renderSettings(); toast("Backup imported successfully.");
      } catch { toast("That backup file isn't valid. Your data was not changed."); }
      target.value = "";
    };
    reader.readAsText(file);
  }
}
function handleSubmit(event) {
  if (event.target.matches("#home-search")) {
    event.preventDefault();
    const query = document.querySelector("#home-query").value.trim();
    if (query) {
      state.recentSearches = [query, ...state.recentSearches.filter(item => item.toLowerCase() !== query.toLowerCase())].slice(0, 8);
      saveState();
    }
    location.hash = `/search${query ? `?q=${encodeURIComponent(query)}` : ""}`;
  } else if (event.target.matches("#manual-item-form")) {
    event.preventDefault();
    const input = document.querySelector("#manual-item");
    const name = input.value.trim();
    if (!name) return;
    state.grocery.push({ id: `manual-${Date.now()}-${Math.random().toString(16).slice(2)}`, name, quantity: null, unit: "", category: categorizeIngredient(name), checked: false, manual: true });
    saveState(); renderGrocery(); toast("Added to your shopping list.");
  }
}
function handleInput(event) {
  if (event.target.matches("#excluded-ingredients")) {
    state.preferences.excluded = event.target.value.split(",").map(item => item.trim()).filter(Boolean).slice(0, 30);
    saveState();
  }
}
function initialize() {
  document.addEventListener("click", handleClick);
  document.addEventListener("change", handleChange);
  document.addEventListener("submit", handleSubmit);
  document.addEventListener("input", handleInput);
  window.addEventListener("hashchange", render);
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => { if (state.preferences.theme === "system") render(); });
  dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
  fetch("data/recipes.json").then(response => {
    if (!response.ok) throw new Error("Recipe data could not be loaded");
    return response.json();
  }).then(data => {
    recipes = Array.isArray(data) ? data : [];
    render();
  }).catch(() => {
    app.innerHTML = `<div class="empty-state"><span class="empty-icon" aria-hidden="true">⌁</span><h2>We couldn't load the recipe shelf</h2><p>Check that you're running the app from its project folder, then try again.</p><button class="button" type="button" onclick="location.reload()">Try again</button></div>`;
  });
}

initialize();