import { describe, expect, it } from "vitest";
import { displayInteger, displayMeasurements, splitFoodName } from "./display";

describe("food presentation", () => {
  it("rounds output without modifying precise source values", () => {
    const value = 74.45;
    expect(displayInteger(value)).toBe("74");
    expect(displayInteger(74.5)).toBe("75");
    expect(displayInteger(0.5)).toBe("1");
    expect(value * 2).toBe(148.9);
    expect(displayMeasurements("หน่วย (28.35 กรัม)")).toBe("หน่วย (28 กรัม)");
  });
  it("separates only a balanced trailing source portion in legacy snapshots", () => {
    expect(splitFoodName("Milk (2%) (1 cup, 244 g)")).toEqual({ name: "Milk (2%)", sourcePortion: "1 cup, 244 g" });
    expect(splitFoodName("Chicken (1 meal (16.5 oz), 468 g)")).toEqual({ name: "Chicken", sourcePortion: "1 meal (16.5 oz), 468 g" });
    expect(splitFoodName("Milk (2%)")).toEqual({ name: "Milk (2%)" });
    expect(splitFoodName("Food (brand)")).toEqual({ name: "Food (brand)" });
  });
});
