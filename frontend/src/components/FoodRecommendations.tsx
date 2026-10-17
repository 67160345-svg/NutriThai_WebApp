import { displayInteger } from "../lib/display";
import { useMemo, useState } from "react";
import type { Food, FoodLog, HealthProfile, MealType, FoodPreferences, FoodPreference, MealItem } from "../types";
import { recommendFoods, foodKey, buildMealPlan, type RecommendationMode, type NutritionFocus } from "../lib/recommendations";
import FoodPreferenceButtons from "./FoodPreferenceButtons";
import Icon from "./Icon";
import { consumedLabel } from "../lib/portions";

interface Props {
  preferences?: FoodPreferences;
  onPreference?: (food: Food, value: FoodPreference | null) => Promise<void>;
  onPlan?: (items: MealItem[]) => void;
  foods: Food[];
  customFoods: Food[];
  logs: FoodLog[];
  profile: HealthProfile;
  date: string;
  meal: MealType;
  category: "all" | Food["category"];
  onMealChange: (meal: MealType) => void;
  onSelect: (food: Food, servings: number) => void;
}

export default function FoodRecommendations(props: Props) {
  const [mode, setMode] = useState<RecommendationMode>("balanced");
  const [focus, setFocus] = useState<NutritionFocus>("balanced");
  const [showAll, setShowAll] = useState(false);
  const { foods, customFoods, logs, profile, date, meal, category, onMealChange, onSelect, preferences, onPreference, onPlan } = props;
  const activeFocus = mode === "familiar" ? "balanced" : focus;
  const result = useMemo(() => recommendFoods({ foods, customFoods, logs, profile, date, meal, category, mode, preferences, focus: activeFocus }),
    [foods, customFoods, logs, profile, date, meal, category, mode, preferences, activeFocus]);
  const plan = useMemo(() => mode === "meal" ? buildMealPlan(result.mealCandidates, result.budget, { remaining: result.remaining, focus: activeFocus }) : [], [mode, result, activeFocus]);
  const planTotals = plan.reduce((sum, item) => ({ calories: sum.calories + item.food.calories * item.servings,
    protein: sum.protein + item.food.protein * item.servings, carbs: sum.carbs + item.food.carbs * item.servings,
    fat: sum.fat + item.food.fat * item.servings }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
  const goalLabel = { lose_weight: "ลดน้ำหนัก", maintain: "รักษาน้ำหนัก", gain_muscle: "เพิ่มกล้ามเนื้อ" }[profile.goal];
  const visibleRecommendations = showAll ? result.recommendations : result.recommendations.slice(0, 3);
  return <section aria-label="อาหารแนะนำสำหรับคุณ" className="food-recommendations">
    <div className="recommendation-heading"><Icon name="leaf" /><div>
      <h3 className="font-bold text-[#1a2820]">แนะนำสำหรับมื้อถัดไป</h3>
      <p>ไอเดียที่เข้ากับเป้าหมายของคุณ เลือกแล้วปรับปริมาณได้</p>
    </div></div>
    <div className="recommendation-controls">
      <label className="text-sm text-[#1a2820]">มื้อที่ต้องการแนะนำ
        <select value={meal} onChange={e => onMealChange(e.target.value as MealType)} className="mt-1 w-full rounded-xl border border-[#c5d8c7] bg-white p-2">
          <option value="breakfast">มื้อเช้า</option><option value="lunch">มื้อกลางวัน</option><option value="dinner">มื้อเย็น</option><option value="snack">ของว่าง</option>
        </select>
      </label>
      <label className="text-sm text-[#1a2820]">แนวทางแนะนำ
        <select value={mode} onChange={e => { setMode(e.target.value as RecommendationMode); setShowAll(false); }} className="mt-1 w-full rounded-xl border border-[#c5d8c7] bg-white p-2">
          <option value="familiar">เน้นความชอบและประวัติ</option><option value="balanced">สมดุลความชอบและเป้าหมาย</option><option value="goal">เน้นสารอาหารและพลังงาน</option><option value="meal">จัดชุดมื้ออาหาร</option>
        </select>
      </label>
    {mode !== "familiar" && <label className="block text-sm text-[#1a2820]">สารอาหารที่ต้องการเน้น
      <select value={focus} onChange={e => setFocus(e.target.value as NutritionFocus)} className="mt-1 w-full rounded-xl border border-[#c5d8c7] bg-white p-2">
        <option value="balanced">สมดุลสารอาหาร</option><option value="protein">โปรตีน</option><option value="carbs">คาร์โบไฮเดรต</option><option value="fat">ไขมัน</option>
      </select>
    </label>}
    </div>
    {result.usableTargets && <div className="recommendation-budget"><Icon name="bowl" /><span>กรอบมื้อที่เลือก {Math.round(result.budget)} kcal</span><span className="recommendation-day-budget">เหลือทั้งวัน {Math.round(result.remaining.calories).toLocaleString()} kcal</span></div>}
    <details className="recommendation-explanation"><summary>ดูหลักการแนะนำและสารอาหารที่เหลือ</summary><div>
    <p>เป้าหมาย {goalLabel} · อิงวันที่ {date}</p>
    <p className="text-xs text-[#596c5c]">{mode === "familiar" ? "จัดอันดับจากอาหารที่กดชอบ ประวัติ และมื้อที่เคยกิน ใช้ปริมาณที่คุ้นเคย"
      : mode === "goal" ? "ปรับปริมาณตามกรอบมื้อ และเรียงตามสารอาหารที่เหลือจากเป้าของคุณ"
        : mode === "meal" ? "จับคู่สองรายการที่ต่างกัน โดยพิจารณาพลังงาน สารอาหาร และความชอบร่วมกัน"
          : "พิจารณาความชอบ ประวัติ และเป้าโภชนาการร่วมกัน โดยคงปริมาณที่คุ้นเคย"}</p>
    {result.usableTargets && <p className="text-xs text-[#596c5c]">สารอาหารที่เหลือทั้งวัน: โปรตีน {Math.round(result.remaining.protein)} กรัม · คาร์บ {Math.round(result.remaining.carbs)} กรัม · ไขมัน {Math.round(result.remaining.fat)} กรัม</p>}
    {!result.hasHistory && <p className="text-xs text-[#596c5c]">ยังไม่มีประวัติสำหรับเรียนรู้ความชอบ เมื่อบันทึกอาหาร ระบบจะใช้ประวัติของคุณจัดอันดับครั้งถัดไป</p>}
    </div></details>
    {!result.usableTargets && <p className="recommendation-notice">ตั้งเป้าพลังงานและสารอาหารในโปรไฟล์เพื่อใช้การแนะนำตามเป้าหมาย</p>}
    {result.usableTargets && result.budget <= 0 && <p className="recommendation-notice">บันทึกถึงกรอบพลังงานของวันหรือมื้อนี้แล้ว เลือกอาหารและปรับปริมาณได้ตามต้องการ</p>}
    {mode !== "meal" && <div className="recommendation-list">
      {visibleRecommendations.map((item, index) => <article key={foodKey(item.food)} className="recommendation-item">
        <div className="recommendation-item-top"><span className="recommendation-number">{String(index + 1).padStart(2, "0")}</span><span className="recommendation-kcal"><strong>{Math.round(item.food.calories * item.servings).toLocaleString()}</strong> kcal</span></div>
        <h4>{item.food.nameTh || item.food.name}</h4>
        <p className="recommendation-portion">{consumedLabel(item.food, item.servings)}</p>
        <button type="button" onClick={() => onSelect(item.food, item.servings)} className="recommendation-select" aria-label={`เลือก ${item.food.nameTh || item.food.name}`}>เลือกอาหารนี้ <Icon name="arrow" /></button>
        <details className="recommendation-food-details"><summary>โภชนาการและเหตุผลที่แนะนำ</summary><div>
          <p>โปรตีน {displayInteger(item.food.protein * item.servings)} · คาร์บ {displayInteger(item.food.carbs * item.servings)} · ไขมัน {displayInteger(item.food.fat * item.servings)} กรัม</p>
          <p>{item.reasons.join(" · ")}</p>
          <FoodPreferenceButtons food={item.food} value={preferences?.[foodKey(item.food)!]} onChange={onPreference} />
        </div></details>
      </article>)}
    </div>}
    {mode !== "meal" && result.recommendations.length > 3 && <button type="button" className="recommendation-show-more" aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>{showAll ? "แสดงน้อยลง" : `ดูตัวเลือกเพิ่มอีก ${result.recommendations.length - 3} รายการ`} <Icon name="arrow" /></button>}
    {mode !== "meal" && !result.recommendations.length && <p className="text-sm text-[#596c5c]">ยังไม่มีรายการที่ประเมินได้ในเงื่อนไขนี้ ลองเปลี่ยนแนวทางหรือเลือกจากรายการอาหารด้านล่าง</p>}
    {mode === "meal" && <div className="recommendation-meal rounded-xl border border-[#c5d8c7] bg-white p-3">
      <h4 className="font-semibold">ไอเดียชุดมื้ออาหาร</h4>
      {plan.length ? <><ul className="my-2 space-y-1 text-sm">{plan.map(item => <li key={foodKey(item.food)}>{item.food.nameTh || item.food.name} · {consumedLabel(item.food, item.servings)}</li>)}</ul>
        <p className="text-sm">รวม {Math.round(planTotals.calories)} kcal · โปรตีน {displayInteger(planTotals.protein)} · คาร์บ {displayInteger(planTotals.carbs)} · ไขมัน {displayInteger(planTotals.fat)} กรัม</p>
        <p className="mt-1 text-xs text-[#596c5c]">ปรับปริมาณก่อนบันทึกได้ ชุดนี้เป็นไอเดียจับคู่จากข้อมูลที่มี</p>
        {onPlan && <button type="button" onClick={() => onPlan(plan)} className="mt-2 rounded-xl bg-[#2d6e3e] px-3 py-2 text-sm text-white">เลือกชุดนี้และปรับปริมาณ</button>}</>
        : <p className="mt-1 text-xs text-[#596c5c]">ยังไม่มีคู่ที่เหมาะกับกรอบมื้อและหมวดที่เลือก ลองเปลี่ยนมื้อ หมวดอาหาร หรือแนวทางแนะนำ</p>}
    </div>}
    <p className="recommendation-footnote">ปริมาณเป็นจุดเริ่มต้น ปรับให้เหมาะกับคุณก่อนบันทึกได้</p>
  </section>;
}
