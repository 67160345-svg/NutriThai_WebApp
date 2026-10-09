import { useState } from "react";
import type { FoodLog, MealType } from "../types";
import { localDateKey } from "../lib/foodLogs";
import { consumedLabel } from "../lib/portions";

export default function CopyMealForm({ items, onCopy, onDone }: {
  items: FoodLog[]; onCopy: (ids: string[], date: string, meal: MealType, requestId: string) => Promise<void>; onDone: (date: string) => void;
}) {
  const [date, setDate] = useState(localDateKey(new Date()));
  const [meal, setMeal] = useState<MealType>(items[0].mealType);
  const [selected, setSelected] = useState(items.slice(0, 30).map(item => item.id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [id, setId] = useState<string | null>(null);
  return <section aria-label="คัดลอกมื้ออาหาร" className="my-3 space-y-3 rounded-xl border bg-[#f3f8ef] p-4">
    <h3 className="font-bold">เลือกอาหารและมื้อปลายทาง</h3>
    <fieldset disabled={busy || id !== null} className="space-y-2">
      {items.map(item => <label key={item.id} className="block text-sm"><input type="checkbox" checked={selected.includes(item.id)} onChange={e => setSelected(e.target.checked ? [...selected, item.id] : selected.filter(value => value !== item.id))} /> {item.food.nameTh} · {consumedLabel(item.food, item.servings)}</label>)}
      <label className="block">วันที่ปลายทาง<input type="date" value={date} max={localDateKey(new Date())} onChange={e => setDate(e.target.value)} className="ml-2 rounded border p-2" /></label>
      <label>มื้อปลายทาง<select value={meal} onChange={e => setMeal(e.target.value as MealType)} className="ml-2 rounded border p-2"><option value="breakfast">เช้า</option><option value="lunch">กลางวัน</option><option value="dinner">เย็น</option><option value="snack">ของว่าง</option></select></label>
    </fieldset>
    <p className="text-xs">คัดลอกโภชนาการและปริมาณจากบันทึกเดิม เพิ่มเป็นรายการใหม่ เลือกได้ไม่เกิน 30 รายการ</p>
    {error && <p role="alert" className="text-sm text-rose-700">{error} {id && "ลองชุดเดิมอีกครั้งเพื่อยืนยันผลโดยไม่เพิ่มซ้ำ"}</p>}
    <button type="button" disabled={busy || !date || date > localDateKey(new Date()) || !selected.length || selected.length > 30} className="rounded-xl bg-[#2d6e3e] px-4 py-2 text-white disabled:opacity-50" onClick={async () => {
      const requestId = id ?? crypto.randomUUID(); setId(requestId); setBusy(true); setError("");
      try { await onCopy(selected, date, meal, requestId); onDone(date); }
      catch (e) { setError(e instanceof Error ? e.message : "คัดลอกไม่สำเร็จ"); if (e instanceof Error && "status" in e && typeof e.status === "number" && [400, 401, 403, 404, 422].includes(e.status)) setId(null); }
      finally { setBusy(false); }
    }}>{busy ? "กำลังคัดลอก..." : "ยืนยันคัดลอกมื้อ"}</button>
  </section>;
}
