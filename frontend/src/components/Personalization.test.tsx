import { useState } from "react";
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import MealComposer from "./MealComposer";
import CopyMealForm from "./CopyMealForm";
import WeightTracker from "./WeightTracker";
import FoodPreferenceButtons from "./FoodPreferenceButtons";
import type { Food, FoodLog } from "../types";

afterEach(cleanup);
const food: Food = { id: 1, name: "Rice", nameTh: "ข้าว", category: "food", calories: 200, protein: 4, carbs: 40, fat: 2, sugar: 0, fiber: 1, servingSize: 100, servingUnit: "g" };
const logs: FoodLog[] = [1, 2].map(id => ({ id: String(id), food, servings: 1, mealType: "lunch", loggedAt: new Date("2026-01-01T12:00:00") }));

it("submits edited portions and freezes an uncertain batch for an identical retry", async () => {
  const save = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(undefined);
  const done = vi.fn(), lock = vi.fn();
  function Form() { const [items, setItems] = useState([{ food, servings: 1 }]); return <MealComposer items={items} onChange={setItems} onSave={save} onDone={done} onLockChange={lock} initialDate="2026-01-01" initialMeal="lunch" />; }
  render(<Form />);
  fireEvent.change(screen.getByLabelText("ปริมาณชุด 1"), { target: { value: "150" } });
  fireEvent.change(screen.getByLabelText("มื้อของชุดอาหาร"), { target: { value: "dinner" } });
  fireEvent.click(screen.getByText("บันทึกชุดมื้อทั้งหมด"));
  await screen.findByText("offline");
  expect(save.mock.calls[0][0][0]).toMatchObject({ servings: 1.5, quantity: 150, mealType: "dinner" });
  expect((screen.getByLabelText("ปริมาณชุด 1") as HTMLInputElement).closest("fieldset")!.disabled).toBe(true);
  fireEvent.click(screen.getByText("บันทึกชุดมื้อทั้งหมด"));
  await waitFor(() => expect(done).toHaveBeenCalledOnce());
  expect(save.mock.calls[1]).toEqual(save.mock.calls[0]);
  expect(lock).toHaveBeenCalledWith(true);
});

it("unlocks definitive validation failures and permits removing a draft item", async () => {
  const change = vi.fn(), lock = vi.fn();
  render(<MealComposer items={[{ food, servings: 1 }]} onChange={change} onSave={vi.fn().mockRejectedValue(Object.assign(new Error("invalid"), { status: 422 }))} onDone={vi.fn()} onLockChange={lock} initialDate="2026-01-01" initialMeal="lunch" />);
  fireEvent.click(screen.getByText("บันทึกชุดมื้อทั้งหมด"));
  await screen.findByText("invalid");
  expect(lock).toHaveBeenLastCalledWith(false);
  fireEvent.click(screen.getByLabelText("นำ ข้าว ออกจากชุด"));
  expect(change).toHaveBeenCalledWith([]);
});

it("copies only selected records to the chosen meal and retries with the same identifier", async () => {
  const copy = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(undefined), done = vi.fn();
  render(<CopyMealForm items={logs} onCopy={copy} onDone={done} />);
  fireEvent.click(screen.getAllByRole("checkbox")[1]);
  fireEvent.change(screen.getByLabelText("วันที่ปลายทาง"), { target: { value: "2026-01-02" } });
  fireEvent.change(screen.getByLabelText("มื้อปลายทาง"), { target: { value: "breakfast" } });
  fireEvent.click(screen.getByText("ยืนยันคัดลอกมื้อ"));
  await screen.findByRole("alert");
  fireEvent.click(screen.getByText("ยืนยันคัดลอกมื้อ"));
  await waitFor(() => expect(done).toHaveBeenCalledWith("2026-01-02"));
  expect(copy.mock.calls[0].slice(0, 3)).toEqual([["1"], "2026-01-02", "breakfast"]);
  expect(copy.mock.calls[1]).toEqual(copy.mock.calls[0]);
});

it("saves and clears explicit preferences, displaying failures", async () => {
  const change = vi.fn().mockResolvedValue(undefined);
  const { rerender } = render(<FoodPreferenceButtons food={food} onChange={change} />);
  fireEvent.click(screen.getByText("ชอบ"));
  await waitFor(() => expect(change).toHaveBeenCalledWith(food, "like"));
  rerender(<FoodPreferenceButtons food={food} value="like" onChange={change} />);
  await waitFor(() => expect((screen.getByText("ชอบ") as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByText("ชอบ"));
  await waitFor(() => expect(change).toHaveBeenLastCalledWith(food, null));
  await waitFor(() => expect((screen.getByText("ชอบ") as HTMLButtonElement).disabled).toBe(false));
  change.mockRejectedValueOnce(new Error("failed"));
  fireEvent.click(screen.getByText("ไม่กินอาหารนี้"));
  await screen.findByText("failed");
});

it("filters weight history, edits a date and reports deletion failures", async () => {
  const save = vi.fn().mockResolvedValue(undefined), remove = vi.fn().mockRejectedValueOnce(new Error("delete failed")).mockResolvedValueOnce(undefined);
  render(<WeightTracker weights={[{ measuredOn: "2026-01-01", weightKg: 70 }, { measuredOn: "2026-01-02", weightKg: 69 }, { measuredOn: "2025-12-01", weightKg: 80 }]} start="2026-01-01" end="2026-01-31" onSave={save} onDelete={remove} />);
  expect(screen.queryByText(/80 กก/)).toBeNull();
  expect(screen.getByText(/เปลี่ยนแปลง -1.00/)).toBeTruthy();
  fireEvent.click(screen.getByText("แก้ไข 2026-01-02"));
  fireEvent.change(screen.getByLabelText("น้ำหนัก (กก.)"), { target: { value: "69.5" } });
  fireEvent.click(screen.getByText("บันทึกน้ำหนัก"));
  await screen.findByText("บันทึกน้ำหนักแล้ว");
  expect(save).toHaveBeenCalledWith({ measuredOn: "2026-01-02", weightKg: 69.5 });
  fireEvent.click(screen.getByText("ลบ 2026-01-02"));
  await screen.findByText("delete failed");
  fireEvent.click(screen.getByText("ลบ 2026-01-02"));
  await screen.findByText("ลบน้ำหนักแล้ว");
});
