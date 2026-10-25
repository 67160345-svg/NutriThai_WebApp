import type { Food, FoodLog, FoodPreferences, HealthProfile, WeightLog } from "../types";

const KEY = "nutrithai_guest_v1";
export interface GuestData {
  version: 1;
  active: boolean;
  onboarded: boolean;
  profile: HealthProfile;
  logs: FoodLog[];
  customFoods: Food[];
  preferences: FoodPreferences;
  weights: WeightLog[];
}

function isFood(value: Food): boolean {
  return Boolean(value && typeof value.name === "string" && typeof value.nameTh === "string"
    && ["food", "drink", "dessert"].includes(value.category)
    && [value.calories, value.protein, value.carbs, value.fat, value.sugar, value.fiber].every(n => Number.isFinite(n) && n >= 0));
}

export function readGuest(): GuestData | null {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) || "null") as GuestData | null;
    if (!data || data.version !== 1 || typeof data.active !== "boolean" || typeof data.onboarded !== "boolean"
      || !data.profile || !["male", "female"].includes(data.profile.gender)
      || !["sedentary", "light", "moderate", "active"].includes(data.profile.activityLevel)
      || !["lose_weight", "maintain", "gain_muscle"].includes(data.profile.goal) || !Array.isArray(data.logs)
      || !Array.isArray(data.customFoods) || !Array.isArray(data.weights) || !data.preferences
      || typeof data.preferences !== "object" || Array.isArray(data.preferences)
      || ![data.profile.weight, data.profile.height, data.profile.age, data.profile.calorieGoal,
        data.profile.proteinGoal, data.profile.carbsGoal, data.profile.fatGoal, data.profile.bmr, data.profile.tdee].every(Number.isFinite)) return null;
    if (!data.customFoods.every(isFood) || !data.logs.every(log => log && typeof log.id === "string" && isFood(log.food)
      && ["breakfast", "lunch", "dinner", "snack"].includes(log.mealType)
      && Number.isFinite(log.servings) && log.servings >= 0.001 && log.servings <= 100
      && Number.isFinite(new Date(log.loggedAt).getTime()))
      || !Object.values(data.preferences).every(v => ["like", "not_interested", "avoid"].includes(v))
      || !data.weights.every(w => w && /^\d{4}-\d{2}-\d{2}$/.test(w.measuredOn) && Number.isFinite(w.weightKg) && w.weightKg > 0)) return null;
    return { ...data, logs: data.logs.map(log => ({ ...log, loggedAt: new Date(log.loggedAt) })) };
  } catch { return null; }
}

export function saveGuest(data: GuestData): boolean {
  try { localStorage.setItem(KEY, JSON.stringify(data)); return true; }
  catch { return false; }
}

export function deactivateGuest() {
  const data = readGuest();
  if (data) saveGuest({ ...data, active: false });
}
