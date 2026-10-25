import { cloneElement, isValidElement, useCallback, type ReactElement, type ReactNode } from "react";
import { useSettings } from "./settings";
import { english } from "./translations";

export function RawText({ children }: { children: ReactNode }) { return children; }

export function translateText(text: string, language: "th" | "en"): string {
  if (language === "th") return text;
  const key = text.trim().replace(/\s+/g, " ");
  const translated = english[key];
  if (translated) return text.replace(text.trim(), translated);
  if (/^[\d,.]+ จาก [\d,.]+ kcal$/.test(key)) return key.replace(" จาก ", " of ");
  if (key.startsWith("กราฟแคลอรีที่บันทึกใน 7 วัน: ")) return key.replace("กราฟแคลอรีที่บันทึกใน 7 วัน: ", "Calories logged over 7 days: ");
  const moreOptions = key.match(/^ดูตัวเลือกเพิ่มอีก (\d+) รายการ$/);
  if (moreOptions) return `Show ${moreOptions[1]} more options`;
  for (const prefix of ["ลบ ", "แก้ไข ", "เลือก ", "นำ ", "ปริมาณ "]) {
    if (text.startsWith(prefix)) return (english[prefix.trim()] || prefix.trim()) + " " + text.slice(prefix.length);
  }
  return text;
}

// Translate React output before reconciliation. No DOM mutation, HTML injection,
// input values, event handlers, IDs or API payloads are changed.
function localizeNode(node: ReactNode, language: "th" | "en"): ReactNode {
  if (typeof node === "string") return translateText(node, language);
  if (Array.isArray(node)) return node.map(child => localizeNode(child, language));
  if (!isValidElement(node)) return node;
  if (node.type === RawText) return node;
  const props = node.props as Record<string, unknown>;
  if (props["data-localize"] === "false") return node;
  const translated: Record<string, unknown> = {};
  if (typeof node.type === "string") {
    for (const attribute of ["placeholder", "aria-label", "title", "alt"]) {
      if (typeof props[attribute] === "string") translated[attribute] = translateText(props[attribute], language);
    }
  }
  if ("children" in props) translated.children = localizeNode(props.children as ReactNode, language);
  return cloneElement(node as ReactElement<Record<string, unknown>>, translated);
}

export function useLocalizedView() {
  const { settings } = useSettings();
  const language = settings.language;
  const view = useCallback(<T extends ReactNode,>(node: T): T =>
    language === "th" ? node : localizeNode(node, language) as T, [language]);
  return { view, language, locale: language === "th" ? "th-TH" : "en-US" };
}
