import { afterEach, expect, it, vi } from "vitest";
import { readGuest, saveGuest, deactivateGuest, type GuestData } from "./guestStorage";
import { computeHealthMetrics } from "./health";

afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });
const food = { id: 1, name: "Rice", nameTh: "ข้าว", category: "food" as const, calories: 100, protein: 2, carbs: 20, fat: 1, sugar: 0, fiber: 1 };
const data: GuestData = { version: 1, active: true, onboarded: true,
  profile: { gender: "male", weight: 65, height: 170, age: 25, activityLevel: "moderate", goal: "maintain", ...computeHealthMetrics("male", 65, 170, 25, "moderate", "maintain") },
  logs: [{ id: "a", food, servings: 1, mealType: "lunch", loggedAt: new Date("2026-10-25T12:00:00+07:00") }],
  customFoods: [food], preferences: { "catalog:1": "like" }, weights: [{ measuredOn: "2026-10-25", weightKg: 65 }] };

it("restores all guest data including Date objects and keeps data after sign-out", () => {
  expect(saveGuest(data)).toBe(true);
  expect(readGuest()).toEqual(data);
  expect(readGuest()!.logs[0].loggedAt.getTime()).toBe(data.logs[0].loggedAt.getTime());
  deactivateGuest();
  expect(readGuest()).toEqual({ ...data, active: false });
});
it("ignores malformed storage and reports storage failures", () => {
  localStorage.setItem("nutrithai_guest_v1", "broken");
  expect(readGuest()).toBeNull();
  localStorage.setItem("nutrithai_guest_v1", JSON.stringify({ ...data, logs: [{ ...data.logs[0], loggedAt: "invalid" }] }));
  expect(readGuest()).toBeNull();
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Quota exceeded"); });
  expect(saveGuest(data)).toBe(false);
});
