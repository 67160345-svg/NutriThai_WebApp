import { apiJson } from "./api";
import type { Food, FoodPreference, FoodPreferences, WeightLog } from "../types";
import { foodKey } from "./recommendations";

export async function readPreferences(): Promise<FoodPreferences> {
  const rows = await apiJson<{food_key: string; preference: FoodPreference}[]>("/api/v1/food-preferences");
  return Object.fromEntries(rows.map(row => [row.food_key, row.preference]));
}
export async function savePreference(food: Food, preference: FoodPreference | null): Promise<void> {
  const key = foodKey(food);
  if (!key) throw new Error("บันทึกอาหารนี้เป็นอาหารส่วนตัวก่อนตั้งความชอบ");
  if (!preference) {
    await apiJson(`/api/v1/food-preferences/${encodeURIComponent(key)}`, { method: "DELETE" });
  } else {
    await apiJson("/api/v1/food-preferences", { method: "PUT", body: JSON.stringify({
      food_id: food.customId ? null : food.id, custom_food_id: food.customId ?? null, preference,
    }) });
  }
}
type WeightRow = { measured_on: string; weight_kg: number };
const mapWeight = (row: WeightRow): WeightLog => ({ measuredOn: row.measured_on, weightKg: Number(row.weight_kg) });
export async function readWeights(): Promise<WeightLog[]> {
  return (await apiJson<WeightRow[]>("/api/v1/weight-logs")).map(mapWeight);
}
export async function saveWeight(weight: WeightLog): Promise<WeightLog> {
  return mapWeight(await apiJson<WeightRow>("/api/v1/weight-logs", { method: "PUT", body: JSON.stringify({ measured_on: weight.measuredOn, weight_kg: weight.weightKg }) }));
}
export async function deleteWeight(date: string): Promise<void> {
  await apiJson(`/api/v1/weight-logs/${encodeURIComponent(date)}`, { method: "DELETE" });
}
