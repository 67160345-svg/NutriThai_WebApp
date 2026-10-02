import type { Food, FoodLog, HealthProfile, MealType } from "../types";
import { apiJson } from "./api";

type ProfileRow = {
  username: string;
  gender: HealthProfile["gender"];
  weight_kg: number;
  height_cm: number;
  age: number;
  activity_level: HealthProfile["activityLevel"];
  goal: HealthProfile["goal"];
  bmr: number;
  tdee: number;
  calorieGoal: number;
  proteinGoal: number;
  carbsGoal: number;
  fatGoal: number;
};

type FoodRow = {
  id: number;
  name: string;
  english_name: string | null;
  name_th?: string | null;
  category: Food["category"];
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  sugar: number;
  fiber: number;
};

type FoodLogRow = {
  id: string;
  food_id: number | null;
  source: "catalog" | "ai" | "custom";
  food_name: string;
  food_name_th: string | null;
  meal_type: MealType;
  servings: number;
  calories_per_serving: number;
  protein_per_serving: number;
  carbs_per_serving: number;
  fat_per_serving: number;
  sugar_per_serving: number;
  fiber_per_serving: number;
  meal_date: string;
  logged_at: string;
};

export function mapProfile(row: ProfileRow): HealthProfile {
  return {
    gender: row.gender,
    weight: Number(row.weight_kg),
    height: Number(row.height_cm),
    age: row.age,
    activityLevel: row.activity_level,
    goal: row.goal,
    bmr: Number(row.bmr),
    tdee: Number(row.tdee),
    calorieGoal: Number(row.calorieGoal),
    proteinGoal: Number(row.proteinGoal),
    carbsGoal: Number(row.carbsGoal),
    fatGoal: Number(row.fatGoal),
  };
}

function mapLog(row: FoodLogRow): FoodLog {
  const food: Food = {
    id: row.food_id ?? 0,
    name: row.food_name,
    nameTh: row.food_name_th ?? row.food_name,
    category: "food",
    calories: Number(row.calories_per_serving),
    protein: Number(row.protein_per_serving),
    carbs: Number(row.carbs_per_serving),
    fat: Number(row.fat_per_serving),
    sugar: Number(row.sugar_per_serving),
    fiber: Number(row.fiber_per_serving),
  };
  return {
    id: row.id,
    food,
    mealType: row.meal_type,
    servings: Number(row.servings),
    loggedAt: new Date(`${row.meal_date}T12:00:00`),
  };
}

export function localDateKey(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function readProfile() {
  const data = await apiJson<ProfileRow | null>("/api/v1/profile");
  return data ? mapProfile(data) : null;
}

export async function saveProfile(profile: HealthProfile) {
  const row = await apiJson<ProfileRow>("/api/v1/profile", {
    method: "PUT",
    body: JSON.stringify({
      gender: profile.gender,
      weight_kg: profile.weight,
      height_cm: profile.height,
      age: profile.age,
      activity_level: profile.activityLevel,
      goal: profile.goal,
    }),
  });
  return mapProfile(row);
}

export async function readFoodLogs(): Promise<FoodLog[]> {
  const data = await apiJson<FoodLogRow[]>("/api/v1/food-logs");
  return data.map(mapLog);
}

export async function createFoodLog(log: FoodLog) {
  const catalogFoodId = log.food.id > 0 ? log.food.id : null;
  const data = await apiJson<FoodLogRow>("/api/v1/food-logs", {
    method: "POST",
    body: JSON.stringify({
      food_id: catalogFoodId,
      food_name: log.food.name,
      food_name_th: log.food.nameTh,
      meal_type: log.mealType,
      servings: log.servings,
      calories_per_serving: log.food.calories,
      protein_per_serving: log.food.protein,
      carbs_per_serving: log.food.carbs,
      fat_per_serving: log.food.fat,
      sugar_per_serving: log.food.sugar,
      fiber_per_serving: log.food.fiber,
      meal_date: localDateKey(log.loggedAt),
      logged_at: log.loggedAt.toISOString(),
    }),
  });
  return mapLog(data);
}

export async function deleteFoodLog(logId: string) {
  await apiJson(`/api/v1/food-logs/${encodeURIComponent(logId)}`, { method: "DELETE" });
}

export async function updateFoodLogServings(logId: string, servings: number) {
  if (!Number.isFinite(servings) || servings <= 0 || servings > 100) {
    throw new Error("จำนวน serving ต้องมากกว่า 0 และไม่เกิน 100");
  }
  await apiJson(`/api/v1/food-logs/${encodeURIComponent(logId)}/servings`, {
    method: "PATCH",
    body: JSON.stringify({ servings }),
  });
}

export interface ReadFoodsOptions {
  search?: string;
  category?: Food["category"] | "all";
  limit?: number;
}

export async function readFoods(options: ReadFoodsOptions = {}): Promise<Food[]> {
  const params = new URLSearchParams();
  if (options.search?.trim()) params.set("search", options.search.trim());
  if (options.category && options.category !== "all") params.set("category", options.category);
  if (options.limit !== undefined) params.set("limit", String(options.limit));
  const query = params.size ? `?${params.toString()}` : "";
  const rows = await apiJson<FoodRow[]>(`/api/v1/foods${query}`);
  return rows.map((row) => ({
    id: row.id,
    name: row.english_name ?? row.name,
    nameTh: row.name_th ?? row.name,
    category: row.category,
    calories: Number(row.calories),
    protein: Number(row.protein),
    carbs: Number(row.carbs),
    fat: Number(row.fat),
    sugar: Number(row.sugar),
    fiber: Number(row.fiber),
  }));
}
