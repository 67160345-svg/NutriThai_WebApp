import type { Food, FoodLog, HealthProfile, MealType, NutritionTotals, FoodPreferences, MealItem } from "../types";
import { localDateKey } from "./foodLogs";
import { getTotals } from "./health";
import { validServings } from "./portions";
import { hasThaiName } from "./foodOrdering";

export type RecommendationMode = "familiar" | "balanced" | "goal" | "meal";
export type NutritionFocus = "balanced" | "protein" | "carbs" | "fat";
// Product ranking weights, not clinical nutrition rules.
const preferenceWeights: Record<RecommendationMode, number> = { familiar: 0.85, balanced: 0.4, goal: 0.05, meal: 0.4 };
const mealShares: Record<MealType, number> = { breakfast: 0.25, lunch: 0.35, dinner: 0.3, snack: 0.1 };
const macros = ["protein", "carbs", "fat"] as const;
const macroLabels = { protein: "โปรตีน", carbs: "คาร์โบไฮเดรต", fat: "ไขมัน" };
const clamp = (value: number) => Math.max(0, Math.min(1, value));

// Allocate the remaining daily macros to this meal in proportion to its energy.
// These are product ranking heuristics; no new health targets are prescribed.
function mealMacroFit(totals: NutritionTotals, remaining: NutritionTotals, budget: number, focus: NutritionFocus): number {
  const share = remaining.calories > 0 ? Math.min(1, budget / remaining.calories) : 0;
  return macros.reduce((score, macro) => {
    const need = remaining[macro] * share;
    const fit = need > 0 ? clamp(1 - Math.abs(totals[macro] - need) / need) : (totals[macro] === 0 ? 1 : 0);
    const weight = focus === "balanced" ? 1 / 3 : (focus === macro ? 0.6 : 0.2);
    return score + fit * weight;
  }, 0);
}

function foodFamily(food: Food): string {
  return food.name.split(",")[0].replace(/\s*\([^)]*\)\s*$/, "").trim().toLowerCase();
}

function diversify(items: FoodRecommendation[], limit: number): FoodRecommendation[] {
  const pool = [...items];
  const selected: FoodRecommendation[] = [];
  const families = new Map<string, number>();
  while (pool.length && selected.length < limit) {
    let best = 0;
    const adjusted = (item: FoodRecommendation) => item.score - (families.get(foodFamily(item.food)) ?? 0) * 0.12;
    for (let i = 1; i < pool.length; i++) {
      const language = Number(hasThaiName(pool[i].food)) - Number(hasThaiName(pool[best].food));
      if (language > 0 || (language === 0 && adjusted(pool[i]) > adjusted(pool[best]))) best = i;
    }
    const [item] = pool.splice(best, 1);
    selected.push(item);
    const family = foodFamily(item.food);
    families.set(family, (families.get(family) ?? 0) + 1);
  }
  return selected;
}

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
  focus?: NutritionFocus;
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

export function recommendFoods({ foods, customFoods, logs, profile, date, meal, mode, category, preferences = {}, focus = "balanced" }: Options) {
  const end = new Date(`${date}T12:00:00`).getTime();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(end) || localDateKey(new Date(end)) !== date) {
    return { recommendations: [] as FoodRecommendation[], mealCandidates: [] as FoodRecommendation[], remaining: { calories: 0, protein: 0, carbs: 0, fat: 0 }, budget: 0, usableTargets: false, hasHistory: false };
  }
  const history = logs.filter(log => validLog(log) && localDateKey(log.loggedAt) <= date);
  const dayLogs = history.filter(log => localDateKey(log.loggedAt) === date);
  const totals = getTotals(dayLogs);
  const targets: NutritionTotals = { calories: profile.calorieGoal, protein: profile.proteinGoal, carbs: profile.carbsGoal, fat: profile.fatGoal };
  const usableTargets = Object.values(targets).every(n => Number.isFinite(n) && n > 0);
  const remaining: NutritionTotals = usableTargets ? {
    calories: Math.max(0, targets.calories - totals.calories),
    protein: Math.max(0, targets.protein - totals.protein),
    carbs: Math.max(0, targets.carbs - totals.carbs),
    fat: Math.max(0, targets.fat - totals.fat),
  } : { calories: 0, protein: 0, carbs: 0, fat: 0 };
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
    if (!knownBasis && ((!seen.length && preferences[key] !== "like") || mode === "goal" || mode === "meal")) continue;
    if ((mode === "goal" || mode === "meal") && (!usableTargets || budget <= 0)) continue;
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
    const observedServings = amounts.length ? amounts[Math.floor(amounts.length / 2)] : 1;
    // Keep familiar/balanced quantities, but fit goal suggestions to the meal.
    // A bundle needs room for a second item, so each starts at half its budget.
    const portionBudget = mode === "meal" ? budget / 2 : budget;
    const factor = (mode === "goal" || mode === "meal") && knownBasis && budget > 0
      ? Math.min(2, Math.max(0.5, portionBudget / (food.calories * observedServings))) : 1;
    const servings = Math.floor(observedServings * factor * 1000) / 1000;
    if (!validServings(servings)) continue;
    const calories = food.calories * servings;
    if ((mode === "goal" || mode === "meal") && calories > budget) continue;
    const reasons: string[] = [];
    if (preferences[key] === "like") reasons.push("คุณเลือกว่าชอบเมนูนี้");
    if (days.size) reasons.push(`บันทึก ${days.size} วันในช่วง 90 วัน`);
    if (mealDays.size) reasons.push("เคยเลือกในมื้อนี้");
    if (amounts.length) reasons.push(factor === 1 ? "ใช้ปริมาณที่เคยกินในมื้อนี้" : "อิงปริมาณที่เคยกินแล้วปรับตามกรอบมื้อ");
    else if (factor !== 1) reasons.push("ปรับปริมาณอ้างอิงให้เข้ากับกรอบมื้อ");
    let nutrition = 0;
    if (knownBasis && usableTargets && budget > 0) {
      const energyFit = clamp(1 - Math.abs(calories - budget) / budget);
      const amounts: NutritionTotals = { calories, protein: food.protein * servings, carbs: food.carbs * servings, fat: food.fat * servings };
      const macroFit = mealMacroFit(amounts, remaining, budget, focus);
      const mealFit = meal === "snack" || food.category === "food" ? 1 : 0.5;
      nutrition = (0.65 * energyFit + 0.35 * macroFit) * mealFit;
      if (calories <= budget) reasons.push("อยู่ในกรอบพลังงานมื้อนี้");
      else reasons.push("ปริมาณนี้เกินกรอบมื้อ ปรับลดได้ก่อนบันทึก");
      if (remaining[strongestDeficit] > 0 && food[strongestDeficit] * servings > 0
        && food[strongestDeficit] * servings <= remaining[strongestDeficit]) reasons.push(`ช่วยเติม${macroLabels[strongestDeficit]}ที่ยังขาดตามเป้า`);
      if (focus !== "balanced" && remaining[focus] > 0 && food[focus] > 0) reasons.push(`พิจารณา${macroLabels[focus]}ตามที่คุณเลือกเน้น`);
    } else if (!knownBasis) reasons.push("หน่วยยังไม่ชัดเจน แนะนำจากประวัติเท่านั้น");
    else reasons.push("แสดงเพื่อเลือกเอง ยังไม่ประเมินความเหมาะสมกับมื้อนี้");
    const repeatPenalty = dayLogs.some(log => foodKey(log.food) === key) ? 0.08 : 0;
    const weight = preferenceWeights[mode];
    const score = weight * Math.max(preference, preferences[key] === "like" ? 1 : 0) + (1 - weight) * nutrition - repeatPenalty;
    recommendations.push({ food, servings, score, reasons, knownBasis });
  }
  recommendations.sort((a, b) => Number(hasThaiName(b.food)) - Number(hasThaiName(a.food)) || b.score - a.score || (foodKey(a.food) ?? "").localeCompare(foodKey(b.food) ?? ""));
  return { recommendations: mode === "familiar" ? recommendations.slice(0, 6) : diversify(recommendations, 6),
    mealCandidates: diversify(recommendations.filter(item => item.knownBasis), 24),
    remaining, budget, usableTargets, hasHistory: habits.size > 0 };
}

// Only combine known portions. Bound changes to 0.5–2 times the suggested amount,
// so a low-calorie ingredient cannot expand to an implausibly large meal.
export function buildMealPlan(items: FoodRecommendation[], budget: number, context?: { remaining: NutritionTotals; focus: NutritionFocus }): MealItem[] {
  if (!Number.isFinite(budget) || budget <= 0) return [];
  const candidates = items.filter(item => item.knownBasis && Number.isFinite(item.food.calories) && item.food.calories > 0 && validServings(item.servings));
  let best: MealItem[] = [];
  let bestDistance = Infinity;
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const pair = [candidates[i], candidates[j]];
      if (foodKey(pair[0].food) === foodKey(pair[1].food) || foodFamily(pair[0].food) === foodFamily(pair[1].food)) continue;
      if (!pair.some(item => item.food.category === "food")) continue;
      const energyA = pair[0].food.calories * pair[0].servings;
      const energyB = pair[1].food.calories * pair[1].servings;
      const common = Math.min(2, Math.max(0.5, budget / (energyA + energyB)));
      for (const factorA of [common, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]) {
        const factorB = Math.min(2, Math.max(0.5, (budget - energyA * factorA) / energyB));
        const plan = pair.map((item, index) => ({ food: item.food,
          servings: Math.max(Math.ceil(item.servings * 0.5 * 1000) / 1000,
            Math.floor(item.servings * (index === 0 ? factorA : factorB) * 1000) / 1000) }));
        if (plan.some(item => !validServings(item.servings))) continue;
        const totals = plan.reduce((sum, item) => ({ calories: sum.calories + item.food.calories * item.servings,
          protein: sum.protein + item.food.protein * item.servings, carbs: sum.carbs + item.food.carbs * item.servings,
          fat: sum.fat + item.food.fat * item.servings }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
        if (totals.calories > budget) continue;
        const nutritionPenalty = context ? 0.35 * (1 - mealMacroFit(totals, context.remaining, budget, context.focus)) : 0;
        const distance = Math.abs(budget - totals.calories) / budget + nutritionPenalty - (pair[0].score + pair[1].score) * 0.05;
        if (distance < bestDistance) { best = plan; bestDistance = distance; }
      }
    }
  }
  return best;
}
