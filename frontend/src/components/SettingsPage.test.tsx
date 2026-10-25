import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SettingsProvider, readSettings } from "../lib/settings";
import SettingsPage from "./SettingsPage";
import CustomFoodForm from "./CustomFoodForm";

beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const renderSettings = () => render(<SettingsProvider><SettingsPage section="theme" /><SettingsPage section="language" /><SettingsPage /><CustomFoodForm onSave={vi.fn()} /></SettingsProvider>);

it("applies preferences immediately, preserves an entered food name when switching language, and restores after reload", () => {
  renderSettings();
  fireEvent.change(screen.getByLabelText("ชื่ออาหาร"), { target: { value: "อาหารส่วนตัวของฉัน" } });
  fireEvent.click(screen.getByRole("button", { name: "มืด" }));
  expect(document.documentElement.dataset.theme).toBe("dark");
  fireEvent.click(screen.getByRole("button", { name: "English" }));
  expect(screen.getByRole("heading", { name: "Settings" })).toBeTruthy();
  expect((screen.getByLabelText("Food name") as HTMLInputElement).value).toBe("อาหารส่วนตัวของฉัน");
  expect(document.documentElement.lang).toBe("en");
  fireEvent.click(screen.getByRole("button", { name: "Extra large" }));
  fireEvent.click(screen.getByRole("button", { name: "Reduce motion" }));
  expect(document.documentElement.dataset.textSize).toBe("largest");
  expect(document.documentElement.dataset.motion).toBe("reduced");
  cleanup(); renderSettings();
  expect(screen.getByRole("heading", { name: "Settings" })).toBeTruthy();
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(document.documentElement.dataset.textSize).toBe("largest");
  expect(readSettings().motion).toBe("reduced");
});

it("resets text size and motion while keeping theme and guest food data", () => {
  localStorage.setItem("nutrithai_guest_v1", "guest-data");
  renderSettings();
  fireEvent.click(screen.getByRole("button", { name: "มืด" }));
  fireEvent.click(screen.getByRole("button", { name: "ใหญ่มาก" }));
  fireEvent.click(screen.getByRole("button", { name: "คืนค่าขนาดตัวอักษรและการเคลื่อนไหว" }));
  expect(readSettings().theme).toBe("dark");
  expect(readSettings().textSize).toBe("normal");
  expect(localStorage.getItem("nutrithai_guest_v1")).toBe("guest-data");
});

it("follows device theme changes in system mode", () => {
  let change: (() => void) | undefined;
  const media = { matches: true, addEventListener: vi.fn((_type, listener) => { change = listener; }), removeEventListener: vi.fn() };
  vi.stubGlobal("matchMedia", () => media);
  renderSettings();
  expect(document.documentElement.dataset.theme).toBe("dark");
  media.matches = false; change?.();
  expect(document.documentElement.dataset.theme).toBe("light");
});

it("keeps changes usable when browser storage is unavailable and rejects invalid saved options", () => {
  localStorage.setItem("nutrithai_settings_v1", JSON.stringify({ theme: "bad", language: "fr", textSize: "bad", motion: "bad" }));
  expect(readSettings()).toEqual({ theme: "system", language: "th", textSize: "normal", motion: "system" });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("storage full"); });
  renderSettings();
  fireEvent.click(screen.getByRole("button", { name: "มืด" }));
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(screen.getAllByText("ใช้ได้รอบนี้ แต่ยังจำค่าลงเครื่องไม่ได้").length).toBeGreaterThan(0);
});
