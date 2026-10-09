import { beforeEach, expect, it, vi } from "vitest";
import type { Food } from "../types";
const { apiJson } = vi.hoisted(() => ({ apiJson: vi.fn() }));
vi.mock("./api", () => ({ apiJson }));
import { readPreferences, savePreference, readWeights, saveWeight, deleteWeight } from "./personalization";
import { insightDates, rollingStart } from "./insights";
beforeEach(() => apiJson.mockReset());
const food = { id: 7, source: "catalog" } as Food;
it("maps preference identities and sends only the chosen food reference", async () => {
  apiJson.mockResolvedValueOnce([{ food_key: "catalog:7", preference: "like" }]);
  expect(await readPreferences()).toEqual({ "catalog:7": "like" });
  await savePreference(food, "avoid");
  expect(JSON.parse(apiJson.mock.calls[1][1].body)).toEqual({ food_id: 7, custom_food_id: null, preference: "avoid" });
  await savePreference({ ...food, source: "custom", customId: "abc" }, "like");
  expect(JSON.parse(apiJson.mock.calls[2][1].body).food_id).toBeNull();
  await savePreference(food, null);
  expect(apiJson).toHaveBeenLastCalledWith("/api/v1/food-preferences/catalog%3A7", { method: "DELETE" });
  await expect(savePreference({ ...food, source: "ai" }, "like")).rejects.toThrow();
});
it("maps database weights and supports upsert and deletion", async () => {
  apiJson.mockResolvedValueOnce([{ measured_on: "2026-01-01", weight_kg: "70.25" }]);
  expect(await readWeights()).toEqual([{ measuredOn: "2026-01-01", weightKg: 70.25 }]);
  apiJson.mockResolvedValueOnce({ measured_on: "2026-01-01", weight_kg: 71 });
  expect(await saveWeight({ measuredOn: "2026-01-01", weightKg: 71 })).toEqual({ measuredOn: "2026-01-01", weightKg: 71 });
  expect(JSON.parse(apiJson.mock.calls[1][1].body)).toEqual({ measured_on: "2026-01-01", weight_kg: 71 });
  await deleteWeight("2026-01-01");
  expect(apiJson).toHaveBeenLastCalledWith("/api/v1/weight-logs/2026-01-01", { method: "DELETE" });
});
it("includes empty days across months and rejects invalid or oversized ranges", () => {
  expect(rollingStart("2026-03-01", 7)).toBe("2026-02-23");
  expect(insightDates("2026-02-27", "2026-03-01")).toEqual(["2026-02-27", "2026-02-28", "2026-03-01"]);
  for (const [start, end] of [["2026-02-30", "2026-03-01"], ["2026-03-01", "2026-02-28"], ["bad", "bad"], ["2025-01-01", "2026-10-01"]]) expect(insightDates(start, end)).toEqual([]);
});
