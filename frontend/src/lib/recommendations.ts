import type { Food, FoodLog, HealthProfile, MealType, NutritionTotals, FoodPreferences, MealItem } from "../types";
import { localDateKey } from "./foodLogs";
import { getTotals } from "./health";
import { validServings } from "./portions";

export type RecommendationMode = "familiar" | "balanced" | "goal";
// Product ranking weights, not clinical nutrition rules.
const preferenceWeights: Record<RecommendationMode, number> = { familiar: 0.85, balanced: 0.4, goal: 0.15 };
const mealShares: Record<MealType, number> = { breakfast: 0.25, lunch: 0.35, dinner: 0.3, snack: 0.1 };
const macros = ["protein", "carbs", "fat"] as const;
const macroLabels = { protein: "โปรตีน", carbs: "คาร์โบไฮเดรต", fat: "ไขมัน" };
const clamp = (value: number) => Math.max(0, Math.min(1, value));

export function foodKey(food: Food): string | null {
  if (food.customId) return `custom:${food.customId}`;
  if (food.id > 0 && (!food.source || food.source === "catalog")) return `catalog:${food.id}`;
  return null; // AI and edited snapshots do not identify a reusable catalog item.
}

export function hasKnownBasis(food: Food): boolean {
  return Number.isFinite(food.servingSize) && food.servingSize! > 0
    && (food.servingUnit === "g" || food.servingUnit === "ml"
      || (food.servingUnit === "portion" && Boolean(food.servingLabel?.trim()) && !food.servingLabel!.includes("ไม่ระบุ")));
}

export interface FoodRecommendation {
  food: Food;
  servings: number;
  score: number;
  reasons: string[];
  knownBasis: boolean;
}

interface Options {
  preferences?: FoodPreferences;
  foods: Food[];
  customFoods: Food[];
  logs: FoodLog[];
  profile: HealthProfile;
  date: string;
  meal: MealType;
  mode: RecommendationMode;
  category: "all" | Food["category"];
}

function validLog(log: FoodLog): boolean {
  return Number.isFinite(log.loggedAt.getTime()) && validServings(log.servings)
    && [log.food.calories, log.food.protein, log.food.carbs, log.food.fat].every(n => Number.isFinite(n) && n >= 0);
}

export function recommendFoods({ foods, customFoods, logs, profile, date, meal, mode, category, preferences = {} }: Options) {
  const end = new Date(`${date}T12:00:00`).getTime();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(end) || localDateKey(new Date(end)) !== date) {
    return { recommendations: [] as FoodRecommendation[], remaining: { calories: 0, protein: 0, carbs: 0, fat: 0 }, budget: 0, usableTargets: false, hasHistory: false };
  }
  const history = logs.filter(log => validLog(log) && localDateKey(log.loggedAt) <= date);
  const dayLogs = history.filter(log => localDateKey(log.loggedAt) === date);
  const totals = getTotals(dayLogs);
  const targets: NutritionTotals = { calories: profile.calorieGoal, protein: profile.proteinGoal, carbs: profile.carbsGoal, fat: profile.fatGoal };
  const usableTargets = Object.values(targets).every(n => Number.isFinite(n) && n > 0);
  const remaining: NutritionTotals = {
    calories: Math.max(0, targets.calories - totals.calories),
    protein: Math.max(0, targets.protein - totals.protein),
    carbs: Math.max(0, targets.carbs - totals.carbs),
    fat: Math.max(0, targets.fat - totals.fat),
  };
  const mealCalories = getTotals(dayLogs.filter(log => log.mealType === meal)).calories;
  // A configurable-product heuristic: don't allocate an entire remaining day to one item.
  const budget = usableTargets ? Math.max(0, Math.min(remaining.calories, targets.calories * mealShares[meal] - mealCalories)) : 0;
  const strongestDeficit = [...macros].sort((a, b) => remaining[b] / targets[b] - remaining[a] / targets[a])[0];
  const habits = new Map<string, FoodLog[]>();
  for (const log of history) {
    const age = (end - new Date(`${localDateKey(log.loggedAt)}T12:00:00`).getTime()) / 86400000;
    const key = foodKey(log.food);
    if (key && age >= 0 && age <= 90) habits.set(key, [...(habits.get(key) ?? []), log]);
  }
  const candidates = new Map<string, Food>();
  for (const food of [...foods, ...customFoods]) {
    const key = foodKey(food);
    if (key && (category === "all" || food.category === category)) candidates.set(key, food);
  }
  const recommendations: FoodRecommendation[] = [];
  for (const [key, food] of candidates) {
    if (preferences[key] === "avoid" || preferences[key] === "not_interested") continue;
    if (![food.calories, food.protein, food.carbs, food.fat].every(n => Number.isFinite(n) && n >= 0) || food.calories <= 0) continue;
    const seen = habits.get(key) ?? [];
    const knownBasis = hasKnownBasis(food);
    if (!knownBasis && ((!seen.length && preferences[key] !== "like") || mode === "goal")) continue;
    if (mode === "goal" && (!usableTargets || budget <= 0)) continue;
    const days = new Set(seen.map(log => localDateKey(log.loggedAt)));
    const mealDays = new Set(seen.filter(log => log.mealType === meal).map(log => localDateKey(log.loggedAt)));
    const last = seen.length ? Math.max(...seen.map(log => new Date(`${localDateKey(log.loggedAt)}T12:00:00`).getTime())) : 0;
    const recency = seen.length ? Math.exp(-(end - last) / (30 * 86400000)) : 0;
    const preference = 0.5 * Math.min(days.size / 7, 1) + 0.3 * Math.min(mealDays.size / 4, 1) + 0.2 * recency;
    // Reuse an observed amount only if its units can be compared to today's catalog.
    const amounts = seen.filter(log => log.mealType === meal && hasKnownBasis(log.food) && knownBasis
      && log.food.servingUnit === food.servingUnit
      && (food.servingUnit !== "portion" || (log.food.servingLabel === food.servingLabel && log.food.portionGrams === food.portionGrams)))
      .map(log => log.servings * log.food.servingSize! / food.servingSize!)
      .filter(validServings).sort((a, b) => a - b);
    const servings = amounts.length ? amounts[Math.floor(amounts.length / 2)] : 1;
    const calories = food.calories * servings;
    const reasons: string[] = [];
    if (preferences[key] === "like") reasons.push("คุณเลือกว่าชอบเมนูนี้");
    if (days.size) reasons.push(`บันทึก ${days.size} วันในช่วง 90 วัน`);
    if (mealDays.size) reasons.push("เคยเลือกในมื้อนี้");
    if (amounts.length) reasons.push("ใช้ปริมาณที่เคยกินในมื้อนี้");
    let nutrition = 0;
    if (knownBasis && usableTargets && budget > 0) {
      const energyFit = clamp(1 - Math.abs(calories - budget) / budget);
      // Compare candidate amounts to remaining macros, penalizing oversupply.
      const macroFit = macros.reduce((sum, macro) => {
        const amount = food[macro] * servings;
        const need = remaining[macro];
        return sum + (need > 0 ? clamp(1 - Math.abs(amount - need) / need) : (amount === 0 ? 1 : 0));
      }, 0) / macros.length;
      const mealFit = meal === "snack" || food.category === "food" ? 1 : 0.5;
      nutrition = (0.65 * energyFit + 0.35 * macroFit) * mealFit;
      if (calories <= budget) reasons.push("อยู่ในกรอบพลังงานมื้อนี้");
      else reasons.push("ปริมาณนี้เกินกรอบมื้อ ปรับลดได้ก่อนบันทึก");
      if (remaining[strongestDeficit] > 0 && food[strongestDeficit] * servings > 0
        && food[strongestDeficit] * servings <= remaining[strongestDeficit]) reasons.push(`ช่วยเติม${macroLabels[strongestDeficit]}ที่ยังขาดตามเป้า`);
    } else if (!knownBasis) reasons.push("หน่วยยังไม่ชัดเจน แนะนำจากประวัติเท่านั้น");
    else reasons.push("แสดงเพื่อเลือกเอง ยังไม่ประเมินความเหมาะสมกับมื้อนี้");
    const repeatPenalty = dayLogs.some(log => foodKey(log.food) === key) ? 0.08 : 0;
    const weight = preferenceWeights[mode];
    const score = weight * Math.max(preference, preferences[key] === "like" ? 1 : 0) + (1 - weight) * nutrition - repeatPenalty;
    recommendations.push({ food, servings, score, reasons, knownBasis });
  }
  recommendations.sort((a, b) => b.score - a.score || (foodKey(a.food) ?? "").localeCompare(foodKey(b.food) ?? ""));
  return { recommendations: recommendations.slice(0, 6), remaining, budget, usableTargets, hasHistory: habits.size > 0 };
}

// Only combine known portions. Bound changes to 0.5–2 times the suggested amount,
// so a low-calorie ingredient cannot expand to an implausibly large meal.
export function buildMealPlan(items: FoodRecommendation[], budget: number): MealItem[] {
  if (!Number.isFinite(budget) || budget <= 0) return [];
  const candidates = items.filter(item => item.knownBasis && item.food.calories > 0);
  let best: MealItem[] = [];
  let bestDistance = Infinity;
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const pair = [candidates[i], candidates[j]];
      if (!pair.some(item => item.food.category === "food")) continue;
      const total = pair.reduce((sum, item) => sum + item.food.calories * item.servings, 0);
      const factor = Math.min(2, Math.max(0.5, budget / total));
      const plan = pair.map(item => ({ food: item.food, servings: Math.round(item.servings * factor * 1000) / 1000 }));
      if (plan.some(item => !validServings(item.servings))) continue;
      const energy = plan.reduce((sum, item) => sum + item.food.calories * item.servings, 0);
      if (energy > budget + 1) continue;
      const distance = Math.abs(budget - energy) / budget - (pair[0].score + pair[1].score) * 0.05;
      if (distance < bestDistance) { best = plan; bestDistance = distance; }
    }
  }
  return best;
}
