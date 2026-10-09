import { useEffect, useState } from "react";
import type { Food, FoodLog, FoodUnit, MealType } from "../types";
import { localDateKey, readFoods } from "../lib/foodLogs";
import { basisLabel, toServings, validServings } from "../lib/portions";
import QuantityInput from "./QuantityInput";
import CustomFoodForm from "./CustomFoodForm";
interface Props { log: FoodLog; customFoods: Food[]; onSave: (log: FoodLog) => Promise<void>; onCancel: () => void; }
export default function FoodLogEditor({ log, customFoods, onSave, onCancel }: Props) {
  const [food, setFood] = useState(log.food);
  const [replaceFood, setReplaceFood] = useState(false);
  const [date, setDate] = useState(localDateKey(log.loggedAt));
  const [meal, setMeal] = useState<MealType>(log.mealType);
  const [quantity, setQuantity] = useState(String(log.servings * (log.food.servingSize ?? 1)));
  const [unit, setUnit] = useState<FoodUnit>(log.food.servingUnit ?? "portion");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Food[]>([]);
  const [manual, setManual] = useState(false);
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [searchError, setSearchError] = useState("");
  useEffect(() => {
    let active = true;
    setResults([]); setSearchError(""); setSearching(Boolean(query.trim()));
    if (!query.trim()) return;
    const timer = window.setTimeout(() => {
      void readFoods({search: query.trim(), limit: 8}).then(foods => { if (active) setResults(foods); })
        .catch(err => { if (active) setSearchError(err instanceof Error ? err.message : "ค้นหาไม่สำเร็จ"); })
        .finally(() => { if (active) setSearching(false); });
    }, 250);
    return () => {active = false; window.clearTimeout(timer);};
  }, [query]);
  const selectFood = (next: Food) => {
    setFood(next); setReplaceFood(true); setQuantity(String(next.servingSize ?? 1));
    setUnit(next.servingUnit ?? "portion"); setQuery(""); setManual(false); setError("");
  };
  const multiplier = toServings(food, Number(quantity), unit);
  return <section aria-label="แก้ไขรายการอาหาร" className="mb-5 space-y-4 rounded-2xl border border-[#b7cdb9] bg-white p-4 sm:p-6">
    <h2 className="text-lg font-bold">แก้ไขรายการอาหาร</h2>
    <fieldset disabled={busy} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">วันที่รับประทาน<input type="date" required max={localDateKey(new Date())} value={date} onChange={e => setDate(e.target.value)} className="mt-1 block w-full rounded-lg border p-2" /></label>
        <label className="text-sm">มื้ออาหาร<select value={meal} onChange={e => setMeal(e.target.value as MealType)} className="mt-1 block w-full rounded-lg border p-2"><option value="breakfast">เช้า</option><option value="lunch">กลางวัน</option><option value="dinner">เย็น</option><option value="snack">ของว่าง</option></select></label>
      </div>
      <p className="font-semibold">{food.nameTh} <span className="text-xs font-normal text-[#596c5c]">{food.calories} kcal / {basisLabel(food)}</span></p>
      <QuantityInput id="edit-log-quantity" food={food} quantity={quantity} unit={unit} onChange={(q, u) => {setQuantity(q);setUnit(u);}} />
      <details><summary className="cursor-pointer text-sm font-semibold text-[#2d6e3e]">เปลี่ยนอาหาร / แก้ชื่อและค่าโภชนาการ</summary>
        <div className="mt-3 space-y-3">
          <label className="block text-sm">ค้นหาอาหารใหม่<input value={query} onChange={e => setQuery(e.target.value)} className="mt-1 block w-full rounded-lg border p-2" /></label>
          {searching && <p role="status" className="text-sm">กำลังค้นหา...</p>}
          {searchError && <p role="alert" className="text-sm text-rose-700">{searchError}</p>}
          {query.trim() && !searching && !searchError && !results.length && <p className="text-sm">ไม่พบอาหาร</p>}
          {results.map(item => <button type="button" key={item.id} onClick={() => selectFood(item)} className="block w-full rounded-lg border p-2 text-left text-sm">{item.nameTh} · {item.calories} kcal / {basisLabel(item)}</button>)}
          {customFoods.length > 0 && <label className="block text-sm">เลือกอาหารส่วนตัว<select value="" onChange={e => {const next = customFoods.find(item => item.customId === e.target.value); if (next) selectFood(next);}} className="mt-1 block w-full rounded-lg border p-2"><option value="">เลือกอาหารของฉัน</option>{customFoods.map(item => <option key={item.customId} value={item.customId}>{item.nameTh}</option>)}</select></label>}
          <button type="button" onClick={() => setManual(value => !value)} className="text-sm font-semibold text-[#2d6e3e]">กรอกหรือแก้ข้อมูลเฉพาะรายการนี้</button>
          {manual && <CustomFoodForm initialFood={food} submitLabel="ใช้ข้อมูลนี้กับรายการ" onSave={async next => selectFood(next)} />}
          <p className="text-xs text-[#596c5c]">การกรอกเองจะเปลี่ยนเฉพาะบันทึกนี้ ไม่แก้รายการอาหารต้นฉบับ</p>
        </div>
      </details>
      <div className="flex gap-3">
        <button type="button" disabled={manual || !validServings(multiplier) || !date || date > localDateKey(new Date())} onClick={async () => {
          setBusy(true);setError("");
          try {await onSave({...log, food, mealType: meal, loggedAt: new Date(`${date}T12:00:00`), servings: multiplier, quantity: Number(quantity), quantityUnit: unit, replaceFood});}
          catch (err) {setError(err instanceof Error ? err.message : "แก้ไขรายการไม่สำเร็จ");}
          finally {setBusy(false);}
        }} className="rounded-xl bg-[#2d6e3e] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}</button>
        <button type="button" onClick={onCancel} className="rounded-xl border px-4 py-3 text-sm">ยกเลิก</button>
      </div>
    </fieldset>
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
  </section>;
}
