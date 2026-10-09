import type { Food, FoodUnit } from "../types";
import { availableUnits, basisLabel, toServings, unitNames, validServings } from "../lib/portions";
interface Props { food: Food; quantity: string; unit: FoodUnit; onChange: (quantity: string, unit: FoodUnit) => void; id?: string; }
export default function QuantityInput({food, quantity, unit, onChange, id = "serving-count"}: Props) {
  const multiplier = toServings(food, Number(quantity), unit);
  return <div className="space-y-3 rounded-xl bg-[#f8f5ef] p-4">
    <p className="text-sm text-[#596c5c]">ค่าโภชนาการต่อ {basisLabel(food)}</p>
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-sm" htmlFor={id}>จำนวน (หน่วย)
        <input id={id} type="number" min="0.001" step="any" value={quantity} onChange={e => onChange(e.target.value, unit)} className="mt-1 block w-28 rounded-lg border bg-white p-2" />
      </label>
      <label className="text-sm">หน่วยปริมาณ
        <select value={unit} onChange={e => { const next = e.target.value as FoodUnit; const baseAmount = (food.servingSize ?? 1) * (next === "g" && food.servingUnit !== "g" ? food.portionGrams ?? 1 : 1); onChange(String(Number(((validServings(multiplier) ? multiplier : 1) * baseAmount).toFixed(6))), next); }} className="mt-1 block max-w-52 rounded-lg border bg-white p-2">
          {availableUnits(food).map(u => <option key={u} value={u}>{u === "portion" ? food.servingLabel || unitNames[u] : unitNames[u]}</option>)}
        </select>
      </label>
      <button type="button" aria-label="ลดจำนวนครึ่งหน่วย" onClick={() => onChange(String(Math.max(0.5, Number(quantity) - 0.5)), unit)} className="rounded-lg border px-3 py-2">−</button>
      <button type="button" aria-label="เพิ่มจำนวนครึ่งหน่วย" onClick={() => onChange(String(Number(quantity) + 0.5), unit)} className="rounded-lg border px-3 py-2">+</button>
    </div>
    {validServings(multiplier) ? <div className="text-sm text-[#2d6e3e]">รวม {Math.round(food.calories * multiplier)} kcal · โปรตีน {(food.protein * multiplier).toFixed(1)} g · คาร์บ {(food.carbs * multiplier).toFixed(1)} g · ไขมัน {(food.fat * multiplier).toFixed(1)} g</div> : <div role="alert" className="text-sm text-rose-700">ปริมาณต้องเทียบเท่า 0.001–100 หน่วยข้อมูล</div>}
  </div>;
}
