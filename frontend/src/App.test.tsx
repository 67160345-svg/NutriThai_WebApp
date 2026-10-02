import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Food, FoodLog, HealthProfile } from "./types";
import { computeHealthMetrics } from "./lib/health";

const appMocks = vi.hoisted(() => ({
  apiJson: vi.fn(),
  acceptAuthCallback: vi.fn(),
  signOut: vi.fn(),
  createFoodLog: vi.fn(),
  deleteFoodLog: vi.fn(),
  readFoodLogs: vi.fn(),
  readFoods: vi.fn(),
  readProfile: vi.fn(),
  saveProfile: vi.fn(),
  updateFoodLogServings: vi.fn(),
  profile: null as HealthProfile | null,
  foodLog: null as FoodLog | null,
  user: { id: "user-1", email: "user@example.com", username: "test-user" },
}));

vi.mock("./lib/api", () => ({
  apiJson: appMocks.apiJson,
  acceptAuthCallback: appMocks.acceptAuthCallback,
  signOut: appMocks.signOut,
}));

vi.mock("./lib/foodLogs", () => ({
  createFoodLog: appMocks.createFoodLog,
  deleteFoodLog: appMocks.deleteFoodLog,
  readFoodLogs: appMocks.readFoodLogs,
  readFoods: appMocks.readFoods,
  readProfile: appMocks.readProfile,
  saveProfile: appMocks.saveProfile,
  updateFoodLogServings: appMocks.updateFoodLogServings,
}));

vi.mock("./components/AuthPage", () => ({
  default: ({ onGuest, onAuthenticated }: { onGuest: (profile: HealthProfile) => void; onAuthenticated: (user: typeof appMocks.user) => void }) => (
    <section>
      <h1>Mock sign in</h1>
      <button onClick={() => onGuest(appMocks.profile!)}>Continue guest</button>
      <button onClick={() => onAuthenticated(appMocks.user)}>Authenticate</button>
    </section>
  ),
}));

vi.mock("./components/OnboardingModal", () => ({
  default: ({ onComplete }: { onComplete: (profile: HealthProfile, name: string) => void }) => (
    <section>
      <h1>Mock profile setup</h1>
      <button onClick={() => onComplete(appMocks.profile!, "Test display")}>Complete profile</button>
    </section>
  ),
}));

vi.mock("./components/Navbar", () => ({
  default: ({ onNavigate, onEditProfile, onSignOut }: { onNavigate: (page: string) => void; onEditProfile: () => void; onSignOut: () => void }) => (
    <nav>
      <button onClick={() => onNavigate("dashboard")}>Go dashboard</button>
      <button onClick={() => onNavigate("logger")}>Go logger</button>
      <button onClick={() => onNavigate("history")}>Go history</button>
      <button onClick={() => onNavigate("advice")}>Go insights</button>
      <button onClick={onEditProfile}>Edit profile</button>
      <button onClick={onSignOut}>Sign out</button>
    </nav>
  ),
}));

vi.mock("./components/Dashboard", () => ({
  default: ({ logs, username, onRemoveLog }: { logs: FoodLog[]; username: string; onRemoveLog: (id: string) => void }) => (
    <section>
      <h1>Dashboard {username}</h1>
      <p>Log count: {logs.length}</p>
      {logs.map((log) => <button key={log.id} onClick={() => onRemoveLog(log.id)}>Remove {log.id}</button>)}
    </section>
  ),
}));

vi.mock("./components/FoodLogger", () => ({
  default: ({ onAddLog, foods }: { onAddLog: (log: FoodLog) => Promise<void>; foods: Food[] }) => (
    <section><h1>Food logger</h1><p>Food catalog: {foods.length}</p><button onClick={() => void onAddLog(appMocks.foodLog!)}>Add log</button></section>
  ),
}));

vi.mock("./components/History", () => ({
  default: ({ onRemoveLog, onUpdateServings }: { onRemoveLog: (id: string) => void; onUpdateServings: (id: string, servings: number) => Promise<void> }) => (
    <section>
      <h1>History</h1>
      <button onClick={() => onRemoveLog("log-1")}>Remove history log</button>
      <button onClick={() => void onUpdateServings("log-1", 2)}>Update history log</button>
    </section>
  ),
}));

vi.mock("./components/AdviceCard", () => ({
  default: () => <h1>Insights</h1>,
}));

vi.mock("./components/PasswordRecovery", () => ({
  default: ({ onComplete }: { onComplete: () => void }) => <button onClick={onComplete}>Complete recovery</button>,
}));

import App from "./App";

const profile: HealthProfile = {
  gender: "male",
  weight: 65,
  height: 170,
  age: 25,
  activityLevel: "moderate",
  goal: "maintain",
  ...computeHealthMetrics("male", 65, 170, 25, "moderate", "maintain"),
};

const food: Food = {
  id: 1, name: "Rice", nameTh: "ข้าว", category: "food",
  calories: 200, protein: 5, carbs: 40, fat: 2, sugar: 0, fiber: 1,
};

const log: FoodLog = {
  id: "log-1", food, mealType: "lunch", servings: 1, loggedAt: new Date(),
};

describe("app session and navigation flows", () => {
  afterEach(cleanup);

  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, "", "/");
    vi.clearAllMocks();
    appMocks.profile = profile;
    appMocks.foodLog = log;
    appMocks.apiJson.mockRejectedValue(new Error("กรุณาเข้าสู่ระบบ"));
    appMocks.readProfile.mockResolvedValue(profile);
    appMocks.readFoodLogs.mockResolvedValue([]);
    appMocks.readFoods.mockResolvedValue([food]);
    appMocks.createFoodLog.mockResolvedValue(log);
    appMocks.deleteFoodLog.mockResolvedValue(undefined);
    appMocks.updateFoodLogServings.mockResolvedValue(undefined);
    appMocks.saveProfile.mockResolvedValue(profile);
    appMocks.createFoodLog.mockResolvedValue(log);
    appMocks.signOut.mockResolvedValue(undefined);
  });

  it("lets a guest finish onboarding, navigate, add and remove logs, and sign out", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: "Mock sign in" });
    fireEvent.click(screen.getByRole("button", { name: "Continue guest" }));
    fireEvent.click(await screen.findByRole("button", { name: "Complete profile" }));
    expect(await screen.findByRole("heading", { name: "Dashboard Test display" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Go logger" }));
    expect(screen.getByText("Food catalog: 1")).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: "Add log" }));
    fireEvent.click(screen.getByRole("button", { name: "Go dashboard" }));
    expect(await screen.findByText("Log count: 1")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Go history" }));
    fireEvent.click(screen.getByRole("button", { name: "Update history log" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "History" })).toBeTruthy());
    expect(appMocks.updateFoodLogServings).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Go dashboard" }));
    fireEvent.click(await screen.findByRole("button", { name: "Remove log-1" }));
    expect(await screen.findByText("Log count: 0")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Go insights" }));
    expect(await screen.findByRole("heading", { name: "Insights" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit profile" }));
    fireEvent.click(await screen.findByRole("button", { name: "Complete profile" }));
    await screen.findByRole("heading", { name: "Insights" });
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("heading", { name: "Mock sign in" })).toBeTruthy();
  });

  it("reports Supabase catalog errors rather than using local guest food data", async () => {
    appMocks.readFoods.mockRejectedValueOnce(new Error("Supabase unavailable"));
    render(<App />);
    await screen.findByRole("heading", { name: "Mock sign in" });

    fireEvent.click(screen.getByRole("button", { name: "Continue guest" }));
    expect((await screen.findByRole("alert")).textContent).toContain("โหลดรายการอาหารไม่สำเร็จ: Supabase unavailable");
    expect(screen.getByRole("heading", { name: "Mock sign in" })).toBeTruthy();
  });

  it("restores an authenticated session and handles API loading errors", async () => {
    appMocks.apiJson.mockResolvedValueOnce(appMocks.user);
    appMocks.readFoodLogs.mockRejectedValueOnce(new Error("database unavailable"));
    render(<App />);

    expect((await screen.findByRole("alert")).textContent).toContain("โหลดข้อมูลบัญชีไม่สำเร็จ: database unavailable");
    appMocks.signOut.mockRejectedValueOnce(new Error("logout unavailable"));
    fireEvent.click(screen.getByRole("button", { name: "ออกจากระบบ" }));
    expect((await screen.findByRole("alert")).textContent).toContain("ออกจากระบบไม่สำเร็จ: logout unavailable");
  });

  it("shows account data, supports API-backed log operations, and handles profile save failures", async () => {
    appMocks.apiJson.mockResolvedValueOnce(appMocks.user);
    appMocks.readProfile.mockResolvedValueOnce(null);
    appMocks.readFoodLogs.mockResolvedValueOnce([log]);
    appMocks.deleteFoodLog.mockRejectedValueOnce(new Error("database unavailable"));
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Complete profile" }));
    await waitFor(() => expect(appMocks.saveProfile).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "Go history" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove history log" }));
    expect((await screen.findByRole("alert")).textContent).toContain("database unavailable");
  });

  it("handles password recovery callbacks and completes the recovery screen", async () => {
    window.history.replaceState(null, "", "/#access_token=access&refresh_token=refresh&type=recovery&expires_in=3600");
    appMocks.acceptAuthCallback.mockResolvedValueOnce({ status: "ok" });
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Complete recovery" }));
    await screen.findByRole("heading", { name: "Mock sign in" });
    expect(appMocks.acceptAuthCallback).toHaveBeenCalledWith("access", "refresh", 3600);
  });
});
