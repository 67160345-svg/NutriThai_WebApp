import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import OnboardingModal from "./OnboardingModal";
import { computeHealthMetrics } from "../lib/health";
import type { HealthProfile } from "../types";

const profile: HealthProfile = {
  gender: "male",
  weight: 65,
  height: 170,
  age: 25,
  activityLevel: "moderate",
  goal: "maintain",
  ...computeHealthMetrics("male", 65, 170, 25, "moderate", "maintain"),
};

afterEach(cleanup);

describe("profile setup", () => {
  it("edits all profile sections together and saves recalculated targets", async () => {
    const save = vi.fn();
    render(<OnboardingModal editing initialProfile={profile} initialName="อรุณ" onComplete={save} />);
    fireEvent.change(screen.getByLabelText(/น้ำหนัก \(กก\.\)/), { target: { value: "72.5" } });
    fireEvent.click(screen.getByRole("button", { name: /ลดน้ำหนัก/ }));
    fireEvent.click(screen.getByRole("button", { name: /สูงออกกำลังกาย 6–7 วัน/ }));
    expect(screen.getByLabelText(/ชื่อของคุณ/)).toBeTruthy();
    expect(screen.getByLabelText(/ส่วนสูง \(ซม\.\)/)).toBeTruthy();
    const expected = computeHealthMetrics("male", 72.5, 170, 25, "active", "lose_weight");
    expect(screen.getByText(expected.calorieGoal.toLocaleString())).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "บันทึกการเปลี่ยนแปลง" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith({ ...profile, weight: 72.5, goal: "lose_weight", activityLevel: "active", ...expected }, "อรุณ"));
  });

  it("keeps unsaved edits local and lets the user return without saving", () => {
    const save = vi.fn();
    const cancel = vi.fn();
    render(<OnboardingModal editing initialProfile={profile} initialName="อรุณ" onComplete={save} onCancel={cancel} />);
    fireEvent.change(screen.getByLabelText(/ชื่อของคุณ/), { target: { value: "ชื่อใหม่" } });
    fireEvent.click(screen.getByRole("button", { name: /กลับไปหน้าเดิม/ }));
    expect(cancel).toHaveBeenCalledOnce();
    expect(save).not.toHaveBeenCalled();
    expect(profile.weight).toBe(65);
  });
  it("collects profile details across three steps and completes with the selected targets", async () => {
    const onComplete = vi.fn();
    render(<OnboardingModal initialProfile={profile} initialName="อรุณ" onComplete={onComplete} />);

    expect(screen.getByText("1 / 3")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /ถัดไป/ }));
    expect(screen.getByText("2 / 3")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /ลดน้ำหนัก/ }));
    fireEvent.click(screen.getByRole("button", { name: /ถัดไป/ }));
    expect(screen.getByText("3 / 3")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /สูงออกกำลังกาย 6–7 วัน/ }));
    fireEvent.click(screen.getByRole("button", { name: "เริ่มต้นใช้งาน" }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledOnce());
    const expected = computeHealthMetrics("male", 65, 170, 25, "active", "lose_weight");
    expect(onComplete).toHaveBeenCalledWith({
      ...profile,
      activityLevel: "active",
      goal: "lose_weight",
      ...expected,
    }, "อรุณ");
  });
});
