import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Food } from "../types";
import FoodLogger from "./FoodLogger";

const loggerMocks = vi.hoisted(() => ({
  readFoods: vi.fn(),
}));

vi.mock("../lib/foodLogs", () => ({
  localDateKey: (value: Date) => value.toISOString().slice(0, 10),
  readFoods: loggerMocks.readFoods,
}));

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

describe("FoodLogger Gemini consent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loggerMocks.readFoods.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.unstubAllGlobals();
    if (originalCreateObjectURL) {
      Object.defineProperty(URL, "createObjectURL", { configurable: true, value: originalCreateObjectURL });
    } else {
      Reflect.deleteProperty(URL, "createObjectURL");
    }
    if (originalRevokeObjectURL) {
      Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: originalRevokeObjectURL });
    } else {
      Reflect.deleteProperty(URL, "revokeObjectURL");
    }
  });

  it("requires consent before allowing image selection and sending it for analysis", async () => {
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:preview") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        detected_item: { name: "Rice", calories: 200, protein: 4, carbs: 45, fat: 1 },
        confidence: 90,
        ai_advice: "ตรวจสอบ portion",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<FoodLogger foods={[]} onAddLog={vi.fn()} isAuthenticated />);
    fireEvent.click(screen.getByRole("button", { name: /สแกนรูป/ }));

    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();
    expect(fileInput?.disabled).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("checkbox"));
    expect(fileInput?.disabled).toBe(false);
    fireEvent.change(fileInput!, {
      target: { files: [new File(["jpeg"], "meal.jpg", { type: "image/jpeg" })] },
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(await screen.findByText("ตรวจพบอาหาร!")).toBeTruthy();
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "POST", credentials: "include" });
  });

  it("filters food, adjusts the serving and meal, and saves the selected entry", async () => {
    const food: Food = {
      id: 1, name: "Rice", nameTh: "ข้าว", category: "food",
      calories: 200, protein: 5, carbs: 40, fat: 2, sugar: 0, fiber: 1,
    };
    loggerMocks.readFoods.mockResolvedValueOnce([food]);
    const onAddLog = vi.fn().mockResolvedValue(undefined);
    render(<FoodLogger foods={[food]} onAddLog={onAddLog} isAuthenticated={false} />);

    fireEvent.change(screen.getByLabelText("ค้นหาอาหารภาษาไทยหรืออังกฤษ"), { target: { value: "ข้าว" } });
    fireEvent.click(await screen.findByRole("button", { name: /ข้าว/ }));
    expect(loggerMocks.readFoods).toHaveBeenCalledWith({ search: "ข้าว", category: "all", limit: 8 });
    fireEvent.click(screen.getByRole("button", { name: "เพิ่มจำนวนครึ่งหน่วย" }));
    fireEvent.click(screen.getByRole("button", { name: /เช้า/ }));
    fireEvent.click(screen.getByRole("button", { name: "บันทึกอาหาร" }));

    await waitFor(() => expect(onAddLog).toHaveBeenCalledOnce());
    expect(onAddLog.mock.calls[0][0]).toMatchObject({
      food, mealType: "breakfast", servings: 1.5,
    });
    expect(await screen.findByText("✓ เพิ่มเรียบร้อย!")).toBeTruthy();
  });

  it("validates serving limits and shows log-save errors", async () => {
    const food: Food = {
      id: 1, name: "Rice", nameTh: "ข้าว", category: "food",
      calories: 200, protein: 5, carbs: 40, fat: 2, sugar: 0, fiber: 1,
    };
    const onAddLog = vi.fn().mockRejectedValue(new Error("บันทึกไม่สำเร็จ"));
    render(<FoodLogger foods={[food]} onAddLog={onAddLog} isAuthenticated={false} />);

    fireEvent.click(screen.getByRole("button", { name: /ข้าว/ }));
    fireEvent.change(screen.getByLabelText("จำนวน (หน่วย)"), { target: { value: "101" } });
    expect((screen.getByRole("button", { name: "บันทึกอาหาร" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("จำนวน (หน่วย)"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกอาหาร" }));

    expect((await screen.findByRole("alert")).textContent).toContain("บันทึกไม่สำเร็จ");
  });
});
