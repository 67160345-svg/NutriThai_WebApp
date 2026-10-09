import { describe, expect, it } from "vitest";
import type { Food, FoodLog, HealthProfile, MealType } from "../types";
import { buildMealPlan, foodKey, hasKnownBasis, recommendFoods } from "./recommendations";

const profile: HealthProfile = { gender: "male", age: 30, weight: 70, height: 170, activityLevel: "moderate", goal: "maintain", bmr: 1500, tdee: 2000, calorieGoal: 2000, proteinGoal: 125, carbsGoal: 250, fatGoal: 56 };
const favorite: Food = { id: 1, name: "Favorite", nameTh: "อาหารคุ้นเคย", source: "catalog", category: "food", calories: 300, protein: 20, carbs: 40, fat: 8, sugar: 0, fiber: 2, servingSize: 1, servingUnit: "portion", servingLabel: "จาน" };
const matching: Food = { ...favorite, id: 2, name: "Meal", nameTh: "อาหารตามเป้า", calories: 700, protein: 40, carbs: 90, fat: 20 };
const log = (food: Food, day: string, mealType: MealType = "lunch", servings = 1): FoodLog => ({ id: `${food.id}-${day}-${mealType}`, food, servings, mealType, loggedAt: new Date(`${day}T12:00:00`) });
const options = { foods: [favorite, matching], customFoods: [] as Food[], logs: [] as FoodLog[], profile, date: "2026-10-09", meal: "lunch" as const, category: "all" as const, mode: "balanced" as const };
const history = Array.from({ length: 7 }, (_, i) => log(favorite, `2026-10-0${i + 1}`));

describe("personal food ranking", () => {
  it("prioritizes an explicit like and excludes hidden foods from singles and bundles", () => {
    const liked = recommendFoods({ ...options, mode: "familiar", preferences: { "catalog:2": "like" } });
    expect(liked.recommendations[0].food.id).toBe(2);
    for (const preference of ["avoid", "not_interested"] as const) {
      const hidden = recommendFoods({ ...options, preferences: { "catalog:2": preference } });
      expect(hidden.recommendations.map(row => row.food.id)).toEqual([1]);
      expect(buildMealPlan(hidden.recommendations, 700)).toEqual([]);
    }
    expect(recommendFoods(options).recommendations).toHaveLength(2);
  });
  it("builds bounded known-portion pairs and rejects insufficient meal budgets", () => {
    const recs = recommendFoods(options).recommendations;
    const plan = buildMealPlan(recs, 700);
    expect(plan).toHaveLength(2);
    expect(plan.reduce((sum, row) => sum + row.food.calories * row.servings, 0)).toBeLessThanOrEqual(701);
    expect(buildMealPlan(recs, 1)).toEqual([]);
    expect(buildMealPlan(recs, NaN)).toEqual([]);
    expect(buildMealPlan(recs.map(row => ({ ...row, knownBasis: false })), 700)).toEqual([]);
  });
  it("changes ranking between familiar and goal modes", () => {
    expect(recommendFoods({ ...options, logs: history, mode: "familiar" }).recommendations[0].food.id).toBe(1);
    expect(recommendFoods({ ...options, logs: history, mode: "goal" }).recommendations[0].food.id).toBe(2);
  });
  it("uses the selected date and accounts for quantities already logged in that meal", () => {
    const logs = [log(favorite, "2026-10-09", "lunch", 2), log(matching, "2026-10-08"), log(matching, "2026-10-10")];
    const result = recommendFoods({ ...options, logs });
    expect(result.remaining.calories).toBe(1400);
    expect(result.budget).toBe(100);
    expect(recommendFoods({ ...options, logs, date: "2026-10-08" }).remaining.calories).toBe(1300);
  });
  it("learns by distinct days and excludes future and older-than-90-day history", () => {
    const once = log(favorite, "2026-10-08");
    const a = recommendFoods({ ...options, logs: [once], mode: "familiar" });
    const b = recommendFoods({ ...options, logs: [once, once, log(favorite, "2026-10-10"), log(favorite, "2026-01-01")], mode: "familiar" });
    expect(a.recommendations[0].score).toBe(b.recommendations[0].score);
    expect(b.recommendations[0].reasons).toContain("บันทึก 1 วันในช่วง 90 วัน");
  });
  it("prefers more recent habits and habits for the selected meal", () => {
    const same = { ...favorite, id: 2 };
    const logs = [log(favorite, "2026-10-08", "breakfast"), log(same, "2026-10-08", "dinner")];
    expect(recommendFoods({ ...options, foods: [favorite, same], logs, meal: "dinner", mode: "familiar" }).recommendations[0].food.id).toBe(2);
    expect(recommendFoods({ ...options, foods: [favorite, same], logs: [log(favorite, "2026-08-01"), log(same, "2026-10-08")], mode: "familiar" }).recommendations[0].food.id).toBe(2);
  });
  it("keeps custom IDs separate and ignores AI or edited snapshots without reusable identity", () => {
    const custom = { ...favorite, id: 0, customId: "private", source: "custom" as const };
    expect(foodKey(custom)).toBe("custom:private");
    expect(foodKey({ ...favorite, source: "ai" })).toBeNull();
    expect(foodKey({ ...favorite, id: 0, source: "custom" })).toBeNull();
    const result = recommendFoods({ ...options, foods: [], customFoods: [custom], logs: [log(custom, "2026-10-08")] });
    expect(result.recommendations[0].food).toBe(custom);
    expect(recommendFoods({ ...options, foods: [], customFoods: [], logs: [log(custom, "2026-10-08")] }).recommendations).toEqual([]);
  });
  it("uses old units only for familiarity, never as nutritional fit", () => {
    const old = { ...favorite, servingLabel: "หน่วยเดิม (ไม่ระบุขนาด)" };
    expect(hasKnownBasis(old)).toBe(false);
    expect(recommendFoods({ ...options, foods: [old] }).recommendations).toEqual([]);
    const familiar = recommendFoods({ ...options, foods: [old], logs: [log(old, "2026-10-08")] });
    expect(familiar.recommendations[0].reasons).toContain("หน่วยยังไม่ชัดเจน แนะนำจากประวัติเท่านั้น");
    expect(recommendFoods({ ...options, foods: [old], logs: [log(old, "2026-10-08")], mode: "goal" }).recommendations).toEqual([]);
  });
  it("converts historic reference sizes without converting grams into milliliters", () => {
    const current = { ...favorite, servingSize: 200, servingUnit: "g" as const };
    const past = { ...current, servingSize: 100 };
    const logs = [log(past, "2026-10-08", "lunch", 1.5)];
    expect(recommendFoods({ ...options, foods: [current], logs }).recommendations[0].servings).toBe(0.75);
    expect(recommendFoods({ ...options, foods: [{ ...current, servingUnit: "ml" }], logs }).recommendations[0].servings).toBe(1);
  });
  it("reacts to the configured targets and macro deficits", () => {
    const lean = { ...favorite, id: 3, calories: 500, protein: 60, carbs: 0, fat: 0 };
    const carb = { ...lean, id: 4, protein: 0, carbs: 60 };
    const prior = { ...favorite, protein: 0, carbs: 250, fat: 56 };
    const result = recommendFoods({ ...options, foods: [carb, lean], logs: [log(prior, "2026-10-09", "breakfast")], mode: "goal" });
    expect(result.recommendations[0].food.id).toBe(3);
    expect(recommendFoods({ ...options, profile: { ...profile, goal: "lose_weight", calorieGoal: 1400 } }).budget).toBeCloseTo(490);
  });
  it("handles exhausted budgets, invalid dates, invalid targets and category filters", () => {
    expect(recommendFoods({ ...options, logs: [log(matching, "2026-10-09", "breakfast", 3)], mode: "goal" }).recommendations).toEqual([]);
    expect(recommendFoods({ ...options, date: "" }).recommendations).toEqual([]);
    expect(recommendFoods({ ...options, date: "2026-02-30" }).recommendations).toEqual([]);
    expect(recommendFoods({ ...options, profile: { ...profile, calorieGoal: NaN }, mode: "goal" }).recommendations).toEqual([]);
    expect(recommendFoods({ ...options, category: "drink" }).recommendations).toEqual([]);
    expect(recommendFoods({ ...options, foods: [{ ...favorite, calories: NaN }] }).recommendations).toEqual([]);
  });
  it("does not retain preference when another account's data replaces the inputs", () => {
    const a = recommendFoods({ ...options, logs: history, mode: "familiar" });
    const b = recommendFoods({ ...options, logs: [], mode: "familiar" });
    expect(a.hasHistory).toBe(true);
    expect(b.hasHistory).toBe(false);
    expect(b.recommendations.every(item => !item.reasons.some(reason => reason.startsWith("บันทึก ")))).toBe(true);
  });
});
