import { useMemo, useState } from "react";
import type { Food, FoodLog, HealthProfile, MealType, FoodPreferences, FoodPreference, MealItem } from "../types";
import { recommendFoods, foodKey, buildMealPlan, type RecommendationMode } from "../lib/recommendations";
import FoodPreferenceButtons from "./FoodPreferenceButtons";
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
  const { foods, customFoods, logs, profile, date, meal, category, onMealChange, onSelect, preferences, onPreference, onPlan } = props;
  const result = useMemo(() => recommendFoods({ foods, customFoods, logs, profile, date, meal, category, mode, preferences }),
    [foods, customFoods, logs, profile, date, meal, category, mode, preferences]);
  const plan = buildMealPlan(result.recommendations, result.budget);
  const goalLabel = { lose_weight: "ลดน้ำหนัก", maintain: "รักษาน้ำหนัก", gain_muscle: "เพิ่มกล้ามเนื้อ" }[profile.goal];
  return <section aria-label="อาหารแนะนำสำหรับคุณ" className="my-4 space-y-3 rounded-[22px] border border-[#c5d8c7] bg-[#f3f8ef] p-4">
    <div>
      <h3 className="font-bold text-[#1a2820]">แนะนำสำหรับมื้อถัดไป</h3>
      <p className="mt-1 text-xs text-[#596c5c]">เลือกมื้อที่จะกิน • เป้าหมาย {goalLabel} • อิงวันที่ {date}</p>
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm text-[#1a2820]">มื้อที่ต้องการแนะนำ
        <select value={meal} onChange={e => onMealChange(e.target.value as MealType)} className="mt-1 w-full rounded-xl border border-[#c5d8c7] bg-white p-2">
          <option value="breakfast">มื้อเช้า</option><option value="lunch">มื้อกลางวัน</option><option value="dinner">มื้อเย็น</option><option value="snack">ของว่าง</option>
        </select>
      </label>
      <label className="text-sm text-[#1a2820]">แนวทางแนะนำ
        <select value={mode} onChange={e => setMode(e.target.value as RecommendationMode)} className="mt-1 w-full rounded-xl border border-[#c5d8c7] bg-white p-2">
          <option value="familiar">เน้นเมนูคุ้นเคย</option><option value="balanced">สมดุลความชอบและเป้าหมาย</option><option value="goal">เน้นตามเป้าหมาย</option>
        </select>
      </label>
    </div>
    {result.usableTargets ? <p className="text-sm text-[#2d6e3e]">เหลือตามเป้าวันที่เลือก {Math.round(result.remaining.calories)} kcal • กรอบมื้อที่เลือก {Math.round(result.budget)} kcal</p>
      : <p className="text-sm text-[#596c5c]">ตั้งเป้าพลังงานและสารอาหารในโปรไฟล์เพื่อใช้การแนะนำตามเป้าหมาย</p>}
    {result.usableTargets && result.budget <= 0 && <p className="text-sm text-[#596c5c]">บันทึกถึงกรอบพลังงานของวันหรือมื้อนี้แล้ว เลือกอาหารและปรับปริมาณได้ตามต้องการ</p>}
    {!result.hasHistory && <p className="text-xs text-[#596c5c]">ยังไม่มีประวัติสำหรับเรียนรู้ความชอบ เมื่อบันทึกอาหาร ระบบจะใช้ประวัติของคุณจัดอันดับครั้งถัดไป</p>}
    <div className="grid gap-2 sm:grid-cols-2">
      {result.recommendations.map(item => <div key={foodKey(item.food)} className="space-y-2 rounded-2xl border border-[#e5e2da] bg-white p-3"><button type="button" onClick={() => onSelect(item.food, item.servings)} className="w-full text-left">
        <span className="block font-semibold text-[#1a2820]">{item.food.nameTh || item.food.name}</span>
        <span className="block text-xs text-[#2d6e3e]">{consumedLabel(item.food, item.servings)} • {Math.round(item.food.calories * item.servings)} kcal</span>
        <span className="mt-1 block text-xs leading-relaxed text-[#596c5c]">{item.reasons.join(" · ")}</span>
      </button><FoodPreferenceButtons food={item.food} value={preferences?.[foodKey(item.food)!]} onChange={onPreference} /></div>)}
    </div>
    {!result.recommendations.length && <p className="text-sm text-[#596c5c]">ยังไม่มีรายการที่ประเมินได้ในเงื่อนไขนี้ ลองเปลี่ยนแนวทางหรือเลือกจากรายการอาหารด้านล่าง</p>}
    {onPlan && <div className="rounded-xl border border-[#c5d8c7] bg-white p-3">
      <h4 className="font-semibold">ไอเดียชุดมื้ออาหาร</h4>
      {plan.length ? <><ul className="my-2 space-y-1 text-sm">{plan.map(item => <li key={foodKey(item.food)}>{item.food.nameTh} · {consumedLabel(item.food, item.servings)}</li>)}</ul>
        <p className="text-sm">รวม {Math.round(plan.reduce((sum, item) => sum + item.food.calories * item.servings, 0))} kcal</p>
        <button type="button" onClick={() => onPlan(plan)} className="mt-2 rounded-xl bg-[#2d6e3e] px-3 py-2 text-sm text-white">เลือกชุดนี้และปรับปริมาณ</button></>
        : <p className="mt-1 text-xs text-[#596c5c]">ยังไม่มีอาหารที่ระบุหน่วยชัดเจนเพียงพอสำหรับจัดชุดตามกรอบนี้ คุณเลือกอาหารเข้าชุดเองได้</p>}
    </div>}
    <p className="text-xs leading-relaxed text-[#718078]">คำนวณจากรายการที่บันทึกและเป้าหมายในโปรไฟล์ ปริมาณเริ่มต้นใช้ที่เคยกินหรือหน่วยอ้างอิงของอาหาร เป็นตัวเลือกอาหาร ไม่ใช่ชุดอาหารครบมื้อ</p>
  </section>;
}
