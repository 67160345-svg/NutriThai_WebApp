import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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

describe("profile setup", () => {
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
