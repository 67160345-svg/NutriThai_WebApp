import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Food, FoodLog, HealthProfile } from "../types";
import AdviceCard from "./AdviceCard";
import Dashboard from "./Dashboard";
import History from "./History";
import Navbar from "./Navbar";
import { computeHealthMetrics } from "../lib/health";
import { localDateKey } from "../lib/foodLogs";

afterEach(cleanup);

const profile: HealthProfile = {
  gender: "male",
  weight: 70,
  height: 175,
  age: 25,
  activityLevel: "moderate",
  goal: "maintain",
  ...computeHealthMetrics("male", 70, 175, 25, "moderate", "maintain"),
};

const food: Food = {
  id: 1,
  name: "Rice",
  nameTh: "ข้าว",
  category: "food",
  servingSize: 100, servingUnit: "g", servingLabel: "กรัม",
  calories: 200,
  protein: 8,
  carbs: 35,
  fat: 4,
  sugar: 1,
  fiber: 2,
};

function makeLog(overrides: Partial<FoodLog> = {}): FoodLog {
  return {
    id: "log-1",
    food,
    mealType: "lunch",
    servings: 1,
    loggedAt: new Date(),
    ...overrides,
  };
}

describe("nutrition screens", () => {
  it("renders dashboard nutrition and navigates to history and the food logger", () => {
    const onNavigate = vi.fn();
    const onRemoveLog = vi.fn();
    render(<Dashboard healthProfile={profile} logs={[makeLog()]} onRemoveLog={onRemoveLog} onNavigate={onNavigate} username="อรุณ" />);

    expect(screen.getByText(/สวัสดี อรุณ/)).toBeTruthy();
    expect(screen.getByText("200")).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "โปรตีน" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /ดูประวัติ/ }));
    expect(onNavigate).toHaveBeenCalledWith("history");
    fireEvent.click(screen.getByRole("button", { name: /เพิ่มกลางวัน/ }));
    expect(onNavigate).toHaveBeenCalledWith("logger");
    fireEvent.click(screen.getByRole("button", { name: /ลบ ข้าว/ }));
    expect(onRemoveLog).toHaveBeenCalledWith("log-1");
  });

  it("updates serving counts in history and navigates between valid dates", async () => {
    const onRemoveLog = vi.fn();
    const onUpdateServings = vi.fn().mockResolvedValue(undefined);
    render(<History logs={[makeLog()]} onRemoveLog={onRemoveLog} onUpdateServings={onUpdateServings} />);

    expect(screen.getByText("ประวัติอาหาร")).toBeTruthy();
    expect(screen.getAllByText("ข้าว").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "แก้ไข ข้าว" }));
    fireEvent.change(screen.getByLabelText("จำนวน serving"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึก" }));
    await waitFor(() => expect(onUpdateServings).toHaveBeenCalledWith("log-1", 2));

    fireEvent.click(screen.getByRole("button", { name: "วันก่อนหน้า" }));
    expect(screen.getByText("ไม่มีรายการอาหารในวันนี้")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("วันที่บันทึก"), { target: { value: localDateKey(new Date()) } });
    expect(screen.getAllByText("ข้าว").length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole("button", { name: "ลบ ข้าว" }).at(-1)!);
    expect(onRemoveLog).toHaveBeenCalledWith("log-1");
  });

  it("shows weekly insights for recorded days and a useful empty state", () => {
    const alternatives = [
      { ...food, id: 2, name: "Soup", nameTh: "ต้มจืด", calories: 90 },
    ];
    const { rerender } = render(<AdviceCard healthProfile={profile} logs={[]} foods={alternatives} />);
    expect(screen.getByText("ข้อมูลเชิงลึก")).toBeTruthy();
    expect(screen.getByText(/ยังไม่มีข้อมูลเพียงพอ/)).toBeTruthy();

    rerender(<AdviceCard healthProfile={profile} logs={[makeLog()]} foods={alternatives} />);
    expect(screen.getByText("ความสม่ำเสมอในการบันทึก")).toBeTruthy();
    expect(screen.getByText("ไอเดียเมนูไทยสำหรับมื้อถัดไป")).toBeTruthy();
    expect(screen.getByText("ต้มจืด")).toBeTruthy();
    rerender(<AdviceCard healthProfile={profile} logs={[makeLog()]} foods={[{...alternatives[0], servingUnit: "ml"}]} />);
    expect(screen.queryByText("ไอเดียเมนูไทยสำหรับมื้อถัดไป")).toBeNull();
    rerender(<AdviceCard healthProfile={profile} logs={[makeLog({food:{...food,servingUnit:undefined}})]} foods={alternatives} />);
    expect(screen.queryByText("ไอเดียเมนูไทยสำหรับมื้อถัดไป")).toBeNull();
  });

  it("renders the five navigation choices and calls profile/sign-out actions", () => {
    const onNavigate = vi.fn();
    const onEditProfile = vi.fn();
    const onSignOut = vi.fn();
    render(
      <Navbar
        page="dashboard"
        onNavigate={onNavigate}
        username="อรุณ"
        isGuest
        onEditProfile={onEditProfile}
        onSignOut={onSignOut}
      />,
    );

    const navigation = screen.getAllByRole("navigation", { name: "เมนูหลัก" })[0];
    expect(navigation.querySelectorAll("button")).toHaveLength(5);
    fireEvent.click(screen.getAllByRole("button", { name: "ประวัติอาหาร" })[0]);
    expect(onNavigate).toHaveBeenCalledWith("history");
    fireEvent.click(screen.getAllByRole("button", { name: /แก้ไขโปรไฟล์/ })[0]);
    expect(onEditProfile).toHaveBeenCalledOnce();
    fireEvent.click(screen.getAllByRole("button", { name: /ออกจากโหมดผู้เยี่ยมชม/ })[0]);
    expect(onSignOut).toHaveBeenCalledOnce();
  });
});
