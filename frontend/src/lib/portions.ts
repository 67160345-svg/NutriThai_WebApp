import type { Food, FoodUnit } from "../types";
export const unitNames: Record<FoodUnit, string> = { portion: "หน่วยบริโภค", g: "กรัม", ml: "มิลลิลิตร" };
export function basisLabel(food: Food): string {
  return `${food.servingSize ?? 1} ${food.servingUnit === "g" ? "กรัม" : food.servingUnit === "ml" ? "มิลลิลิตร" : food.servingLabel || "หน่วยเดิม (ไม่ระบุขนาด)"}`;
}
export function availableUnits(food: Food): FoodUnit[] {
  const unit = food.servingUnit ?? "portion";
  return unit === "portion" && food.portionGrams ? ["portion", "g"] : [unit];
}
export function toServings(food: Food, quantity: number, unit: FoodUnit): number {
  const base = food.servingUnit ?? "portion";
  const size = food.servingSize ?? 1;
  if (!Number.isFinite(quantity) || quantity <= 0 || size <= 0) return NaN;
  if (base === unit) return quantity / size;
  if (base === "portion" && unit === "g" && food.portionGrams) return quantity / (food.portionGrams * size);
  return NaN;
}
export function validServings(value: number): boolean { return Number.isFinite(value) && value >= 0.001 && value <= 100; }
export function consumedLabel(food: Food, servings: number): string {
  const count = Number(((food.servingSize ?? 1) * servings).toFixed(3));
  const unit = food.servingUnit ?? "portion";
  return `${count} ${unit === "portion" ? food.servingLabel || "หน่วยเดิม (ไม่ระบุขนาด)" : unitNames[unit]}`;
}
