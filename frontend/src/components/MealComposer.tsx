import { useState } from "react";
import type { FoodLog, MealItem, MealType } from "../types";
import { localDateKey } from "../lib/foodLogs";
import { consumedLabel, validServings } from "../lib/portions";

export default function MealComposer({ items, onChange, onSave, onDone, initialDate, initialMeal, onLockChange }: {
  items: MealItem[]; onChange: (items: MealItem[]) => void;
  onSave: (logs: FoodLog[], requestId: string) => Promise<void>; onDone: () => void;
  initialDate: string; initialMeal: MealType;
  onLockChange?: (locked: boolean) => void;
}) {
  const [date, setDate] = useState(initialDate);
  const [meal, setMeal] = useState(initialMeal);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [requestId, setRequestId] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<FoodLog[] | null>(null);
  const locked = busy || submitted !== null;
  const total = items.reduce((sum, item) => sum + item.food.calories * item.servings, 0);
  const valid = items.length > 0 && items.length <= 30 && items.every(item => validServings(item.servings)) && date && date <= localDateKey(new Date());
  return <section aria-label="ชุดมื้ออาหาร" className="my-4 space-y-3 rounded-2xl border border-[#b7cdb9] bg-white p-4">
    <h3 className="font-bold">ชุดมื้ออาหาร ({items.length}/30)</h3>
    <fieldset disabled={locked} className="space-y-3 disabled:opacity-60">
      <div className="flex flex-wrap gap-3">
        <label>วันที่ของชุดมื้อ<input type="date" value={date} max={localDateKey(new Date())} onChange={e => setDate(e.target.value)} className="block rounded-lg border p-2" /></label>
        <label>มื้อของชุดอาหาร<select value={meal} onChange={e => setMeal(e.target.value as MealType)} className="block rounded-lg border p-2"><option value="breakfast">เช้า</option><option value="lunch">กลางวัน</option><option value="dinner">เย็น</option><option value="snack">ของว่าง</option></select></label>
      </div>
      {items.map((item, index) => <div key={index} className="flex flex-wrap items-center gap-2 rounded-xl bg-[#f8f5ef] p-3">
        <div className="min-w-0 flex-1"><span className="block font-medium">{item.food.nameTh}</span><span className="text-xs">{consumedLabel(item.food, item.servings)} · {Math.round(item.food.calories * item.servings)} kcal</span></div>
        <label className="text-xs">ปริมาณ {item.food.nameTh}<input aria-label={`ปริมาณชุด ${index + 1}`} type="number" step="any" min="0.001" value={Number.isFinite(item.servings) ? Number((item.servings * (item.food.servingSize ?? 1)).toFixed(3)) : ""} onChange={e => onChange(items.map((row, i) => i === index ? { ...row, servings: Number(e.target.value) / (row.food.servingSize ?? 1) } : row))} className="block w-24 rounded border p-2" /></label>
        <button type="button" aria-label={`นำ ${item.food.nameTh} ออกจากชุด`} onClick={() => onChange(items.filter((_, i) => i !== index))}>นำออก</button>
      </div>)}
    </fieldset>
    <p className="font-semibold">รวมชุด {Number.isFinite(total) ? Math.round(total) : 0} kcal · โปรตีน {items.reduce((sum, item) => sum + item.food.protein * item.servings, 0).toFixed(1)} g</p>
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    {submitted && !busy && <p className="text-sm">ลองบันทึกชุดเดิมอีกครั้งเพื่อยืนยันผล ระบบใช้รหัสเดิมป้องกันการเพิ่มซ้ำ</p>}
    <button type="button" disabled={busy || !valid} className="w-full rounded-xl bg-[#2d6e3e] p-3 font-semibold text-white disabled:opacity-50" onClick={async () => {
      const id = requestId ?? crypto.randomUUID();
      const rows = submitted ?? items.map((item, i) => ({ id: `${id}-${i}`, food: item.food, servings: item.servings, quantity: item.servings * (item.food.servingSize ?? 1), quantityUnit: item.food.servingUnit ?? "portion", mealType: meal, loggedAt: new Date(`${date}T12:00:00`) }));
      setRequestId(id); setSubmitted(rows); setBusy(true); setError(""); onLockChange?.(true);
      try { await onSave(rows, id); onDone(); }
      catch (e) {
        setError(e instanceof Error ? e.message : "บันทึกชุดมื้อไม่สำเร็จ");
        if (e instanceof Error && "status" in e && typeof e.status === "number" && [400, 401, 403, 404, 422].includes(e.status)) { setSubmitted(null); setRequestId(null); onLockChange?.(false); }
      } finally { setBusy(false); }
    }}>{busy ? "กำลังบันทึกชุดมื้อ..." : "บันทึกชุดมื้อทั้งหมด"}</button>
  </section>;
}
