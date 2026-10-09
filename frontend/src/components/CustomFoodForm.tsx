import { useState } from "react";
import type { Food, FoodUnit } from "../types";
interface Props { onSave: (food: Food) => Promise<void>; submitLabel?: string; initialFood?: Food; }
const nutrients = [["calories", "พลังงาน (kcal)"], ["protein", "โปรตีน (g)"], ["carbs", "คาร์โบไฮเดรต (g)"], ["fat", "ไขมัน (g)"], ["sugar", "น้ำตาล (g)"], ["fiber", "ใยอาหาร (g)"]] as const;
export default function CustomFoodForm({ onSave, submitLabel = "บันทึกอาหารส่วนตัว", initialFood }: Props) {
  const [name, setName] = useState(initialFood?.nameTh ?? "");
  const [category, setCategory] = useState<Food["category"]>(initialFood?.category ?? "food");
  const [unit, setUnit] = useState<FoodUnit>(initialFood?.servingUnit ?? "g");
  const [size, setSize] = useState(String(initialFood?.servingSize ?? 100));
  const [label, setLabel] = useState(initialFood?.servingLabel ?? "จาน");
  const [grams, setGrams] = useState(initialFood?.portionGrams ? String(initialFood.portionGrams) : "");
  const [values, setValues] = useState(Object.fromEntries(nutrients.map(([key]) => [key, String(initialFood?.[key] ?? 0)])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <form className="space-y-4 rounded-2xl border bg-white p-4" onSubmit={async event => {
    event.preventDefault(); setError("");
    if (!name.trim() || !label.trim() || !Number.isFinite(Number(size)) || Number(size) <= 0 || Number(size) > 10000 ||
      (grams !== "" && (!Number.isFinite(Number(grams)) || Number(grams) <= 0 || Number(grams) > 10000)) ||
      nutrients.some(([key]) => !Number.isFinite(Number(values[key])) || Number(values[key]) < 0 || Number(values[key]) > (key === "calories" ? 10000 : 1000))) {
      setError("กรุณาตรวจสอบชื่อ ขนาดหน่วย และค่าโภชนาการ"); return;
    }
    setBusy(true);
    try { await onSave({id: 0, source: "custom", name: name.trim(), nameTh: name.trim(), category,
      servingSize: Number(size), servingUnit: unit, servingLabel: unit === "portion" ? label.trim() : unit === "g" ? "กรัม" : "มิลลิลิตร",
      portionGrams: unit === "portion" && grams ? Number(grams) : null,
      calories: Number(values.calories), protein: Number(values.protein), carbs: Number(values.carbs), fat: Number(values.fat), sugar: Number(values.sugar), fiber: Number(values.fiber)});
    } catch (err) { setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ"); } finally { setBusy(false); }
  }}>
    <h3 className="font-semibold">ข้อมูลอาหารจากฉลากหรือแหล่งที่คุณตรวจสอบ</h3>
    <fieldset disabled={busy} className="space-y-3">
      <label className="block text-sm">ชื่ออาหาร<input required maxLength={200} value={name} onChange={e => setName(e.target.value)} className="mt-1 block w-full rounded-lg border p-2" /></label>
      <label className="block text-sm">หมวดหมู่<select value={category} onChange={e => setCategory(e.target.value as Food["category"])} className="mt-1 block w-full rounded-lg border p-2"><option value="food">อาหาร</option><option value="drink">เครื่องดื่ม</option><option value="dessert">ของหวาน</option></select></label>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">ค่าบนฉลากต่อจำนวน<input required type="number" min="0.001" max="10000" step="any" value={size} onChange={e => setSize(e.target.value)} className="mt-1 block w-full rounded-lg border p-2" /></label>
        <label className="text-sm">หน่วยอ้างอิง<select value={unit} onChange={e => {const u = e.target.value as FoodUnit; setUnit(u); setSize(u === "portion" ? "1" : "100");}} className="mt-1 block w-full rounded-lg border p-2"><option value="g">กรัม</option><option value="ml">มิลลิลิตร</option><option value="portion">จาน / แก้ว / หน่วยอื่น</option></select></label>
      </div>
      {unit === "portion" && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-sm">ชื่อหน่วย<input required maxLength={100} value={label} onChange={e => setLabel(e.target.value)} className="mt-1 block w-full rounded-lg border p-2" /></label>
        <label className="text-sm">กรัมต่อ 1 หน่วย (ถ้าทราบ)<input type="number" min="0.001" max="10000" step="any" value={grams} onChange={e => setGrams(e.target.value)} className="mt-1 block w-full rounded-lg border p-2" /></label>
      </div>}
      <p className="text-xs text-[#596c5c]">กรอกสารอาหารทั้งหมดสำหรับจำนวนอ้างอิงข้างต้น ระบบจะคำนวณตามปริมาณที่รับประทาน</p>
      <div className="grid grid-cols-2 gap-3">{nutrients.map(([key,title]) => <label key={key} className="text-sm">{title}<input required type="number" min="0" max={key === "calories" ? 10000 : 1000} step="any" value={values[key]} onChange={e => setValues({...values, [key]: e.target.value})} className="mt-1 block w-full rounded-lg border p-2" /></label>)}</div>
      <button type="submit" className="w-full rounded-xl bg-[#2d6e3e] p-3 font-semibold text-white">{busy ? "กำลังบันทึก..." : submitLabel}</button>
    </fieldset>
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
  </form>;
}
