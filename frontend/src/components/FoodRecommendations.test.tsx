import { cleanup, fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Food, FoodLog, HealthProfile } from "../types";
import FoodLogger from "./FoodLogger";
import FoodRecommendations from "./FoodRecommendations";
import { localDateKey } from "../lib/foodLogs";

const profile: HealthProfile = { gender: "male", age: 30, weight: 70, height: 170, activityLevel: "moderate", goal: "maintain", bmr: 1500, tdee: 2000, calorieGoal: 2000, proteinGoal: 125, carbsGoal: 250, fatGoal: 56 };
const food: Food = { id: 1, name: "Rice", nameTh: "ข้าวทดสอบ", source: "catalog", category: "food", calories: 130, protein: 3, carbs: 28, fat: 1, sugar: 0, fiber: 1, servingSize: 100, servingUnit: "g", servingLabel: "กรัม" };
const date = localDateKey(new Date());
const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
const log: FoodLog = { id: "past", food, servings: 1.5, loggedAt: yesterday, mealType: "dinner" };
afterEach(cleanup);

describe("recommendations in add-food flow", () => {
  it("selects a recommended meal and quantity and saves through the existing handler", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    render(<FoodLogger foods={[food]} logs={[log]} healthProfile={profile} onAddLog={save} isAuthenticated />);
    const section = screen.getByRole("region", { name: "อาหารแนะนำสำหรับคุณ" });
    fireEvent.change(within(section).getByLabelText("มื้อที่ต้องการแนะนำ"), { target: { value: "dinner" } });
    fireEvent.click(within(section).getByRole("button", { name: /ข้าวทดสอบ/ }));
    expect((screen.getByLabelText("จำนวน (หน่วย)") as HTMLInputElement).value).toBe("150");
    fireEvent.click(screen.getByRole("button", { name: "บันทึกอาหาร" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0][0]).toMatchObject({ mealType: "dinner", quantity: 150, quantityUnit: "g", servings: 1.5 });
  });
  it("updates budget after new logs, changes mode, and clears habits when account data changes", () => {
    const props = { foods: [food], customFoods: [], logs: [log], profile, date, meal: "lunch" as const, category: "all" as const, onMealChange: vi.fn(), onSelect: vi.fn() };
    const view = render(<FoodRecommendations {...props} />);
    expect(screen.getByText(/กรอบมื้อที่เลือก 700 kcal/)).toBeTruthy();
    const today = { ...log, loggedAt: new Date(), mealType: "lunch" as const, servings: 2 };
    view.rerender(<FoodRecommendations {...props} logs={[log, today]} />);
    expect(screen.getByText(/กรอบมื้อที่เลือก 440 kcal/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("แนวทางแนะนำ"), { target: { value: "goal" } });
    expect((screen.getByLabelText("แนวทางแนะนำ") as HTMLSelectElement).value).toBe("goal");
    view.rerender(<FoodRecommendations {...props} logs={[]} />);
    expect(screen.getByText(/ยังไม่มีประวัติสำหรับเรียนรู้ความชอบ/)).toBeTruthy();
    expect(screen.queryByText(/บันทึก 2 วัน/)).toBeNull();
  });
  it("explains unavailable recommendations and exhausted targets without blocking manual food selection", () => {
    render(<FoodLogger foods={[{ ...food, servingUnit: undefined }]} logs={[{ ...log, loggedAt: new Date(), servings: 20 }]} healthProfile={profile} onAddLog={vi.fn()} isAuthenticated={false} />);
    fireEvent.change(screen.getByLabelText("แนวทางแนะนำ"), { target: { value: "goal" } });
    expect(screen.getByText(/บันทึกถึงกรอบพลังงาน/)).toBeTruthy();
    expect(screen.getByText(/ยังไม่มีรายการที่ประเมินได้/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /ข้าวทดสอบ/ }));
    expect(screen.getByLabelText("จำนวน (หน่วย)")).toBeTruthy();
  });
});
