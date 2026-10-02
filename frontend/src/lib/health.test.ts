import { describe, expect, it } from "vitest";
import { computeHealthMetrics, getTotals } from "./health";
import type { FoodLog } from "../types";
import { localDateKey } from "./foodLogs";

describe("health calculations", () => {
  it("calculates matching daily targets for a maintenance profile", () => {
    expect(computeHealthMetrics("male", 70, 175, 25, "sedentary", "maintain")).toEqual({
      bmr: 1674,
      tdee: 2009,
      calorieGoal: 2009,
      proteinGoal: 126,
      carbsGoal: 251,
      fatGoal: 56,
    });
  });

  it("applies the minimum calorie target for weight loss", () => {
    expect(computeHealthMetrics("female", 45, 150, 80, "sedentary", "lose_weight").calorieGoal).toBe(1200);
  });

  it("sums nutrition totals using serving amounts", () => {
    const logs: FoodLog[] = [{
      id: "log-1",
      food: {
        id: 1, name: "Meal", nameTh: "อาหาร", category: "food",
        calories: 200, protein: 10, carbs: 20, fat: 5, sugar: 2, fiber: 1,
      },
      mealType: "lunch",
      servings: 1.5,
      loggedAt: new Date(2026, 0, 2, 12),
    }];

    expect(getTotals(logs)).toEqual({ calories: 300, protein: 15, carbs: 30, fat: 7.5 });
  });

  it("formats a local calendar date without converting to UTC", () => {
    expect(localDateKey(new Date(2026, 0, 2, 0, 30))).toBe("2026-01-02");
  });
});
