import { useId, type ReactNode } from "react";
import { defaultSettings, useSettings, type Settings } from "../lib/settings";
import Icon from "./Icon";

export default function SettingsPage({ section = "general" }: { section?: "theme" | "language" | "general" }) {
  const { settings, update, storageError } = useSettings();
  const id = useId();
  const text = (th: string, en: string) => settings.language === "en" ? en : th;
  function choices<K extends keyof Settings>(key: K, options: { value: Settings[K]; label: string; description?: string; icon?: ReactNode }[]) {
    return <div className="settings-choices" role="group" aria-label={text({ theme: "ธีม", language: "ภาษา", textSize: "ขนาดตัวอักษร", motion: "การเคลื่อนไหว" }[key], { theme: "Theme", language: "Language", textSize: "Text size", motion: "Motion" }[key])}>
      {options.map(option => <button key={option.value} type="button" aria-label={option.label} aria-describedby={option.description ? `${id}-${key}-${option.value}` : undefined} aria-pressed={settings[key] === option.value} onClick={() => update({ [key]: option.value })} className="settings-choice">
        {option.icon}<strong>{option.label}</strong>{option.description && <small id={`${id}-${key}-${option.value}`}>{option.description}</small>}
        <span className="settings-check" aria-hidden="true">{settings[key] === option.value ? "✓" : ""}</span>
      </button>)}
    </div>;
  }
  return <div className="settings-page">
    <header className="settings-heading"><div><p className="eyebrow">MAKE YOURSELF AT HOME</p><h1><Icon name={section === "theme" ? "sun" : section === "language" ? "language" : "settings"} />{section === "theme" ? text("ธีม", "Theme") : section === "language" ? text("ภาษา", "Language") : text("ตั้งค่า", "Settings")}</h1><p>{text("ปรับให้เป็นแบบคุณ เปลี่ยนแล้วเห็นผลทันที", "Make it yours. Every change takes effect instantly.")}</p></div>
      <span role="status" aria-live="polite" className={storageError ? "settings-save-error" : "settings-save-status"}>{storageError ? text("ใช้ได้รอบนี้ แต่ยังจำค่าลงเครื่องไม่ได้", "Applied for now. Unable to save on this device.") : text("✓ จำการตั้งค่าให้อัตโนมัติ", "✓ Preferences saved automatically")}</span>
    </header>
    {section === "theme" && <section className="settings-card"><h2>{text("หน้าตาและธีม", "Appearance & theme")}</h2><p>{text("เลือกบรรยากาศที่อ่านสบาย หรือเปลี่ยนตามอุปกรณ์", "Choose a comfortable look or follow your device.")}</p>
      {choices("theme", (["light", "dark", "system"] as const).map((value, i) => ({ value, label: text(["สว่าง", "มืด", "ตามระบบ"][i], ["Light", "Dark", "System"][i]), icon: <span className={`theme-preview theme-preview-${value}`} aria-hidden="true"><i /><b /><b /></span> })))}
    </section>}
    {section === "language" && <section className="settings-card"><h2>{text("ภาษา", "Language")}</h2><p>{text("เปลี่ยนภาษาเมนูและรูปแบบวันที่ได้ทันที", "Switch the interface language and date format instantly.")}</p>
      {choices("language", [{ value: "th", label: "ไทย", description: "ภาษาไทย" }, { value: "en", label: "English", description: "English" }])}
    </section>}
    {section === "general" && <><section className="settings-card"><h2>{text("ขนาดตัวอักษร", "Text size")}</h2><p>{text("ขยายให้อ่านง่ายขึ้น โดยยังปรับตามขนาดหน้าจอ", "Choose larger text while keeping the layout responsive.")}</p>
      {choices("textSize", [{ value: "normal", label: text("ปกติ", "Default"), description: "100%" }, { value: "large", label: text("ใหญ่", "Large"), description: "112.5%" }, { value: "largest", label: text("ใหญ่มาก", "Extra large"), description: "125%" }])}
      <div className="settings-reading-preview"><strong>{text("ทีละมื้อ ทีละวัน", "One meal, one day at a time")}</strong><p>{text("ทุกมื้อดี เริ่มที่การเลือก บันทึกอาหารและดูแลเป้าหมายของคุณในทุกวัน", "Every good meal starts with a choice. Track your food and look after your daily goals.")}</p></div>
    </section>
    <section className="settings-card"><h2>{text("การเคลื่อนไหว", "Motion")}</h2><p>{text("เลือกระดับการเคลื่อนไหวที่คุณรู้สึกสบาย", "Choose the amount of movement that feels comfortable.")}</p>
      {choices("motion", [{ value: "system", label: text("ตามระบบ", "System"), description: text("ใช้การตั้งค่าของอุปกรณ์", "Follow device preferences") }, { value: "full", label: text("เปิดอนิเมชัน", "Animations on"), description: text("แสดงเอฟเฟกต์การเคลื่อนไหว", "Show movement effects") }, { value: "reduced", label: text("ลดการเคลื่อนไหว", "Reduce motion"), description: text("แสดงผลทันทีโดยไม่ขยับ", "Instant changes, no animation") }])}
    </section></>}
    <footer className="settings-footer"><p>{text("จำค่าเฉพาะเบราว์เซอร์เครื่องนี้ การตั้งค่าไม่เปลี่ยนข้อมูลบัญชีหรือประวัติอาหาร", "Preferences are saved in this browser. They do not change your account or food history.")}</p>{section === "general" && <button type="button" onClick={() => update({ textSize: defaultSettings.textSize, motion: defaultSettings.motion })}>{text("คืนค่าขนาดตัวอักษรและการเคลื่อนไหว", "Reset text size and motion")}</button>}</footer>
  </div>;
}
