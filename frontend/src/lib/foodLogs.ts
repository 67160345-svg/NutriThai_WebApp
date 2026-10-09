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
  serving_size?: number;
  serving_unit?: Food["servingUnit"];
  serving_label?: string;
  portion_grams?: number | null;
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
  custom_food_id?: string | null;
  category?: Food["category"];
  serving_size?: number;
  serving_unit?: Food["servingUnit"];
  serving_label?: string;
  portion_grams?: number | null;
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
    category: row.category ?? "food",
    source: row.source,
    customId: row.custom_food_id ?? undefined,
    ...mapBasis(row),
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

export function logPayload(log: FoodLog) {
  return {
    food_id: log.food.id > 0 ? log.food.id : null,
    custom_food_id: log.food.customId ?? null,
    source: log.food.source ?? (log.food.id > 0 ? "catalog" : "ai"),
    category: log.food.category,
    food_name: log.food.name,
    food_name_th: log.food.nameTh,
    meal_type: log.mealType,
    servings: log.servings,
    quantity: log.quantity,
    quantity_unit: log.quantityUnit,
    replace_food: log.replaceFood ?? false,
    ...basisPayload(log.food),
    calories_per_serving: log.food.calories,
    protein_per_serving: log.food.protein,
    carbs_per_serving: log.food.carbs,
    fat_per_serving: log.food.fat,
    sugar_per_serving: log.food.sugar,
    fiber_per_serving: log.food.fiber,
    meal_date: localDateKey(log.loggedAt),
    logged_at: log.loggedAt.toISOString(),
  };
}

export async function createFoodLog(log: FoodLog) {
  const data = await apiJson<FoodLogRow>("/api/v1/food-logs", {
    method: "POST", body: JSON.stringify(logPayload(log)),
  });
  return mapLog(data);
}

export async function updateFoodLog(log: FoodLog) {
  const data = await apiJson<FoodLogRow>(`/api/v1/food-logs/${encodeURIComponent(log.id)}`, {
    method: "PUT", body: JSON.stringify(logPayload(log)),
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
    source: "catalog",
    ...mapBasis(row),
    calories: Number(row.calories),
    protein: Number(row.protein),
    carbs: Number(row.carbs),
    fat: Number(row.fat),
    sugar: Number(row.sugar),
    fiber: Number(row.fiber),
  }));
}

function mapBasis(row: { serving_size?: number; serving_unit?: Food["servingUnit"]; serving_label?: string; portion_grams?: number | null }) {
  return { servingSize: Number(row.serving_size ?? 1), servingUnit: row.serving_unit ?? "portion",
    servingLabel: row.serving_label ?? "หน่วยเดิม (ไม่ระบุขนาด)",
    portionGrams: row.portion_grams == null ? null : Number(row.portion_grams) };
}

function basisPayload(food: Food) {
  return { serving_size: food.servingSize ?? 1, serving_unit: food.servingUnit ?? "portion",
    serving_label: food.servingLabel ?? "หน่วยเดิม (ไม่ระบุขนาด)", portion_grams: food.portionGrams ?? null };
}

type CustomRow = Omit<FoodRow, "id"> & { id: string };
function mapCustom(row: CustomRow): Food {
  return { id: 0, customId: row.id, source: "custom", name: row.name, nameTh: row.name,
    category: row.category, calories: Number(row.calories), protein: Number(row.protein),
    carbs: Number(row.carbs), fat: Number(row.fat), sugar: Number(row.sugar), fiber: Number(row.fiber), ...mapBasis(row) };
}
export async function readCustomFoods(): Promise<Food[]> {
  return (await apiJson<CustomRow[]>("/api/v1/custom-foods")).map(mapCustom);
}
export async function createCustomFood(food: Food): Promise<Food> {
  const row = await apiJson<CustomRow>("/api/v1/custom-foods", {
    method: "POST", body: JSON.stringify({ name: food.nameTh, category: food.category,
      calories: food.calories, protein: food.protein, carbs: food.carbs, fat: food.fat,
      sugar: food.sugar, fiber: food.fiber, ...basisPayload(food) }),
  });
  return mapCustom(row);
}
