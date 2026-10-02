import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FoodLog, HealthProfile } from "../types";

const { apiJson } = vi.hoisted(() => ({ apiJson: vi.fn() }));
vi.mock("./api", () => ({ apiJson }));

import {
  createFoodLog,
  deleteFoodLog,
  mapProfile,
  readFoodLogs,
  readFoods,
  readProfile,
  saveProfile,
  updateFoodLogServings,
} from "./foodLogs";

const profile: HealthProfile = {
  gender: "female",
  weight: 60,
  height: 165,
  age: 30,
  activityLevel: "moderate",
  goal: "maintain",
  bmr: 0,
  tdee: 0,
  calorieGoal: 0,
  proteinGoal: 0,
  carbsGoal: 0,
  fatGoal: 0,
};

const foodLog: FoodLog = {
  id: "client-id",
  food: {
    id: 3,
    name: "Rice",
    nameTh: "ข้าว",
    category: "food",
    calories: 130,
    protein: 3,
    carbs: 28,
    fat: 1,
    sugar: 0,
    fiber: 1,
  },
  mealType: "lunch",
  servings: 1.5,
  loggedAt: new Date(2026, 0, 2, 12),
};

const savedLogRow = {
  id: "saved-id",
  food_id: 3,
  source: "catalog" as const,
  food_name: "Rice",
  food_name_th: "ข้าว",
  meal_type: "lunch" as const,
  servings: 1.5,
  calories_per_serving: 130,
  protein_per_serving: 3,
  carbs_per_serving: 28,
  fat_per_serving: 1,
  sugar_per_serving: 0,
  fiber_per_serving: 1,
  meal_date: "2026-01-02",
  logged_at: "2026-01-02T05:00:00.000Z",
};

beforeEach(() => apiJson.mockReset());

describe("API-backed profile and food-log data access", () => {
  it("uses health targets calculated by the backend", () => {
    const mapped = mapProfile({
      username: "test-user",
      gender: "female",
      weight_kg: 60,
      height_cm: 165,
      age: 30,
      activity_level: "moderate",
      goal: "maintain",
      bmr: 1300,
      tdee: 2015,
      calorieGoal: 2015,
      proteinGoal: 126,
      carbsGoal: 252,
      fatGoal: 56,
    });
    expect(mapped.weight).toBe(60);
    expect(mapped.calorieGoal).toBeGreaterThan(0);
  });

  it("reads an optional profile from the backend", async () => {
    apiJson.mockResolvedValueOnce(null);
    await expect(readProfile()).resolves.toBeNull();
    expect(apiJson).toHaveBeenCalledWith("/api/v1/profile");
  });

  it("sends only editable profile fields to the backend", async () => {
    apiJson.mockResolvedValueOnce({
      username: "test-user",
      gender: "female",
      weight_kg: 60,
      height_cm: 165,
      age: 30,
      activity_level: "moderate",
      goal: "maintain",
      bmr: 1300,
      tdee: 2015,
      calorieGoal: 2015,
      proteinGoal: 126,
      carbsGoal: 252,
      fatGoal: 56,
    });
    await expect(saveProfile(profile)).resolves.toMatchObject({ calorieGoal: 2015 });
    expect(apiJson).toHaveBeenCalledWith("/api/v1/profile", {
      method: "PUT",
      body: JSON.stringify({
        gender: "female",
        weight_kg: 60,
        height_cm: 165,
        age: 30,
        activity_level: "moderate",
        goal: "maintain",
      }),
    });
  });

  it("reads and maps food logs returned by the backend", async () => {
    apiJson.mockResolvedValueOnce([savedLogRow]);
    const rows = await readFoodLogs();
    expect(rows[0].food.nameTh).toBe("ข้าว");
    expect(rows[0].loggedAt.getHours()).toBe(12);
  });

  it("creates catalog and scanned-food logs through the backend", async () => {
    apiJson.mockResolvedValueOnce(savedLogRow);
    const created = await createFoodLog(foodLog);
    expect(created.id).toBe("saved-id");
    expect(apiJson).toHaveBeenCalledWith("/api/v1/food-logs", expect.objectContaining({
      method: "POST",
      body: expect.stringContaining('"food_id":3'),
    }));

    apiJson.mockResolvedValueOnce({ ...savedLogRow, food_id: null });
    await createFoodLog({ ...foodLog, food: { ...foodLog.food, id: 0 } });
    expect(apiJson.mock.calls[1][1].body).toContain('"food_id":null');
  });

  it("delegates log deletion and serving validation to the API boundary", async () => {
    apiJson.mockResolvedValueOnce({ status: "ok" });
    await expect(deleteFoodLog("log/id")).resolves.toBeUndefined();
    expect(apiJson).toHaveBeenCalledWith("/api/v1/food-logs/log%2Fid", { method: "DELETE" });

    apiJson.mockResolvedValueOnce({ status: "ok" });
    await expect(updateFoodLogServings("saved-id", 2)).resolves.toBeUndefined();
    expect(apiJson).toHaveBeenCalledWith("/api/v1/food-logs/saved-id/servings", {
      method: "PATCH",
      body: JSON.stringify({ servings: 2 }),
    });
    await expect(updateFoodLogServings("saved-id", -1)).rejects.toThrow("ต้องมากกว่า 0");
  });

  it("maps the backend food catalog", async () => {
    apiJson.mockResolvedValueOnce([{
      id: 1, name: "ข้าว", english_name: "Rice", category: "food",
      calories: 130, protein: 3, carbs: 28, fat: 1, sugar: 0, fiber: 1,
    }]);
    await expect(readFoods()).resolves.toMatchObject([
      { name: "Rice", nameTh: "ข้าว", calories: 130 },
    ]);
    expect(apiJson).toHaveBeenCalledWith("/api/v1/foods");
  });

  it("requests indexed food searches with optional category and result limit", async () => {
    apiJson.mockResolvedValueOnce([{
      id: 9, name: "Fried rice", english_name: "Fried rice", category: "food",
      calories: 420, protein: 12, carbs: 60, fat: 10, sugar: 2, fiber: 3,
    }]);

    await expect(readFoods({ search: " rice ", category: "food", limit: 8 })).resolves.toMatchObject([
      { id: 9, name: "Fried rice", nameTh: "Fried rice" },
    ]);
    expect(apiJson).toHaveBeenCalledWith("/api/v1/foods?search=rice&category=food&limit=8");
  });

  it("prefers the optional Thai catalog column when it is added", async () => {
    apiJson.mockResolvedValueOnce([{
      id: 10, name: "Abalone", english_name: "Abalone", name_th: "หอยเป๋าฮื้อ", category: "food",
      calories: 100, protein: 10, carbs: 0, fat: 2, sugar: 0, fiber: 0,
    }]);

    await expect(readFoods({ search: "Abalone" })).resolves.toMatchObject([
      { name: "Abalone", nameTh: "หอยเป๋าฮื้อ" },
    ]);
  });

  it("surfaces API errors and maps empty food catalogs", async () => {
    const failure = new Error("API unavailable");
    apiJson.mockRejectedValueOnce(failure);
    await expect(readFoods()).rejects.toBe(failure);
    apiJson.mockResolvedValueOnce([]);
    await expect(readFoods()).resolves.toEqual([]);
  });
});
