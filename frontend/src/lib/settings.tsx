import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from "react";

export interface Settings {
  theme: "system" | "light" | "dark";
  language: "th" | "en";
  textSize: "normal" | "large" | "largest";
  motion: "system" | "full" | "reduced";
}
export const defaultSettings: Settings = { theme: "system", language: "th", textSize: "normal", motion: "system" };
const storageKey = "nutrithai_settings_v1";
export function readSettings(): Settings {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || "null");
    if (!value || typeof value !== "object") return { ...defaultSettings };
    return {
      theme: ["system", "light", "dark"].includes(value.theme) ? value.theme : "system",
      language: value.language === "en" ? "en" : "th",
      textSize: ["normal", "large", "largest"].includes(value.textSize) ? value.textSize : "normal",
      motion: ["system", "full", "reduced"].includes(value.motion) ? value.motion : "system",
    };
  } catch { return { ...defaultSettings }; }
}
const SettingsContext = createContext({ settings: defaultSettings,
  update: (_patch: Partial<Settings>) => {}, reset: () => {}, storageError: false });

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(readSettings);
  const [storageError, setStorageError] = useState(false);
  useLayoutEffect(() => {
    const root = document.documentElement;
    const query = window.matchMedia?.("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      root.dataset.theme = settings.theme === "system" ? (query?.matches ? "dark" : "light") : settings.theme;
      root.style.colorScheme = root.dataset.theme;
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", root.dataset.theme === "dark" ? "#14201b" : "#2d6e3e");
    };
    applyTheme(); query?.addEventListener?.("change", applyTheme);
    root.lang = settings.language;
    root.dataset.textSize = settings.textSize;
    root.dataset.motion = settings.motion;
    root.style.setProperty("--text-scale", String({ normal: 1, large: 1.125, largest: 1.25 }[settings.textSize]));
    document.title = settings.language === "th" ? "NutriThai — บันทึกอาหารและดูแลสุขภาพ" : "NutriThai — Food & nutrition tracker";
    try { localStorage.setItem(storageKey, JSON.stringify(settings)); setStorageError(false); }
    catch { setStorageError(true); }
    return () => query?.removeEventListener?.("change", applyTheme);
  }, [settings]);
  return <SettingsContext.Provider value={{ settings, storageError,
    update: patch => setSettings(previous => ({ ...previous, ...patch })), reset: () => setSettings({ ...defaultSettings }),
  }}>{children}</SettingsContext.Provider>;
}
export function useSettings() { return useContext(SettingsContext); }
