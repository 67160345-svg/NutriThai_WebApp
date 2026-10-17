import type { Food } from "../types";

export function hasThaiName(food: Pick<Food, "nameTh">): boolean {
  return /[\u0e01-\u0e2e]/.test(food.nameTh);
}

/** Preserve relevance/ranking inside each language group. Never hide untranslated foods. */
export function thaiFirst<T>(items: readonly T[], foodOf: (item: T) => Pick<Food, "nameTh">): T[] {
  return [...items.filter(item => hasThaiName(foodOf(item))), ...items.filter(item => !hasThaiName(foodOf(item)))];
}
