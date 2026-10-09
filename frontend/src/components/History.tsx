import FoodLogEditor from "./FoodLogEditor";
import { consumedLabel } from "../lib/portions";
import { useMemo, useState } from "react";
import { Food, FoodLog, MealType } from "../types";
import { getTotals } from "../lib/health";
import { localDateKey } from "../lib/foodLogs";

interface Props {
  onUpdateLog?: (log: FoodLog) => Promise<void>;
  customFoods?: Food[];
  logs: FoodLog[];
  onRemoveLog: (id: string) => void;
  onUpdateServings: (id: string, servings: number) => Promise<void>;
}

const mealGroups: { id: MealType; label: string; icon: string }[] = [
  { id: "breakfast", label: "มื้อเช้า", icon: "☼" },
  { id: "lunch", label: "มื้อกลางวัน", icon: "☀" },
  { id: "dinner", label: "มื้อเย็น", icon: "◉" },
  { id: "snack", label: "ของว่าง", icon: "♧" },
];

const formatDate = (value: string) =>
  new Date(`${value}T12:00:00`).toLocaleDateString("th-TH", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

export default function History({ logs, onRemoveLog, onUpdateServings, onUpdateLog, customFoods = [] }: Props) {
  const availableDates = useMemo(
    () => Array.from(new Set(logs.map((log) => localDateKey(new Date(log.loggedAt))))).sort(),
    [logs],
  );
  const [selectedDate, setSelectedDate] = useState(() => localDateKey(new Date()));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editedServings, setEditedServings] = useState("");
  const [editError, setEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const selectedLogs = logs.filter((log) => localDateKey(new Date(log.loggedAt)) === selectedDate);
  const totals = getTotals(selectedLogs);
  const maxDate = localDateKey(new Date());

  return (
    <div className="mx-auto w-full max-w-[1160px] px-4 py-7 sm:px-8">
      <h1 className="mb-5 text-2xl font-bold text-[#1a2820]">ประวัติอาหาร</h1>
      {editingId && onUpdateLog && logs.find(log => log.id === editingId) && <FoodLogEditor
        key={editingId} log={logs.find(log => log.id === editingId)!} customFoods={customFoods}
        onCancel={() => setEditingId(null)} onSave={async next => {
          await onUpdateLog(next); setSelectedDate(localDateKey(next.loggedAt)); setEditingId(null);
        }} />}


      <div className="mb-5 flex items-end gap-3">
        <button
          type="button"
          aria-label="วันก่อนหน้า"
          onClick={() => setSelectedDate((date) => shiftDate(date, -1))}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-xl text-[#596c5c] hover:bg-white disabled:opacity-30"
        >
          ‹
        </button>
        <div className="min-w-0 flex-1">
          <label className="mb-2 block text-sm font-medium text-[#596c5c]" htmlFor="history-date">วันที่บันทึก</label>
          <input
            id="history-date"
            type="date"
            value={selectedDate}
            max={maxDate}
            onChange={(event) => setSelectedDate(event.target.value)}
            className="min-h-12 w-full rounded-xl border border-[#e5e2da] bg-white px-3.5 text-sm text-[#1a2820]"
          />
        </div>
        <button
          type="button"
          aria-label="วันถัดไป"
          disabled={selectedDate >= maxDate}
          onClick={() => setSelectedDate((date) => shiftDate(date, 1))}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-xl text-[#596c5c] hover:bg-white disabled:opacity-30"
        >
          ›
        </button>
      </div>
      <div className="mb-6 flex gap-2 overflow-x-auto pb-1">
        {availableDates.slice(-7).reverse().map((date) => (
          <button
            key={date}
            type="button"
            aria-pressed={date === selectedDate}
            onClick={() => setSelectedDate(date)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold ${date === selectedDate ? "border-[#2d6e3e] bg-[#2d6e3e] text-white" : "border-[#e5e2da] bg-white text-[#596c5c]"}`}
          >
            {new Date(`${date}T12:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}
          </button>
        ))}
      </div>

      <section className="mb-5 rounded-[22px] border border-[#e5e2da] bg-white p-5 shadow-sm" aria-label="สรุปโภชนาการ">
        <h2 className="mb-4 text-sm font-semibold text-[#596c5c]">สรุปโภชนาการ</h2>
        <div className="grid grid-cols-2 gap-4 text-center sm:grid-cols-4">
          {[
            { label: "แคลอรี", value: Math.round(totals.calories), unit: "kcal", color: "text-[#2d6e3e]" },
            { label: "โปรตีน", value: Math.round(totals.protein), unit: "g", color: "text-[#4f84a8]" },
            { label: "คาร์บ", value: Math.round(totals.carbs), unit: "g", color: "text-[#a46616]" },
            { label: "ไขมัน", value: Math.round(totals.fat), unit: "g", color: "text-[#66845d]" },
          ].map((item) => (
            <div key={item.label}>
              <div className={`text-xl font-extrabold ${item.color}`}>{item.value}</div>
              <div className="text-xs text-[#718078]">{item.unit}</div>
              <div className="text-xs text-[#596c5c]">{item.label}</div>
            </div>
          ))}
        </div>
      </section>

      <h2 className="mb-4 text-base font-semibold text-[#1a2820]">{formatDate(selectedDate)}</h2>
      {mealGroups.map((meal) => {
        const items = selectedLogs.filter((log) => log.mealType === meal.id);
        if (!items.length) return null;
        const mealCalories = Math.round(items.reduce((sum, item) => sum + item.food.calories * item.servings, 0));
        return (
          <section key={meal.id} className="mb-3 overflow-hidden rounded-[20px] border border-[#e5e2da] bg-white shadow-sm">
            <header className="flex items-center justify-between border-b border-[#edf4ee] bg-[#fbfcf9] px-4 py-3">
              <h3 className="flex items-center gap-2 font-semibold text-[#1a2820]"><span aria-hidden="true" className="text-[#2d6e3e]">{meal.icon}</span>{meal.label}</h3>
              <span className="text-sm text-[#596c5c]">{mealCalories} kcal</span>
            </header>
            {items.map((log) => (
              <div key={log.id} className="flex items-center gap-3 border-b border-[#edf4ee] px-4 py-3 last:border-0">
                <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-[#f3f0ea] text-xl">{log.food.category === "drink" ? "♧" : log.food.category === "dessert" ? "✿" : "♨"}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-[#1a2820]">{log.food.nameTh}</div>
                  <div className="text-xs text-[#718078]">{consumedLabel(log.food, log.servings)} · {Math.round(log.food.calories * log.servings)} kcal</div>
                  {editingId === log.id && !onUpdateLog && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <label className="text-xs text-[#596c5c]" htmlFor={`servings-${log.id}`}>จำนวน serving</label>
                      <input
                        id={`servings-${log.id}`}
                        type="number"
                        min="0.1"
                        max="100"
                        step="0.1"
                        value={editedServings}
                        onChange={(event) => setEditedServings(event.target.value)}
                        className="w-24 rounded-lg border border-[#e5e2da] bg-[#f8f5ef] px-2 py-1 text-sm"
                      />
                      <button
                        type="button"
                        disabled={savingEdit}
                        onClick={() => {
                          const count = Number(editedServings);
                          if (!Number.isFinite(count) || count <= 0 || count > 100) {
                            setEditError("จำนวน serving ต้องมากกว่า 0 และไม่เกิน 100");
                            return;
                          }
                          setSavingEdit(true);
                          setEditError("");
                          void onUpdateServings(log.id, count).then(() => setEditingId(null)).catch((error: unknown) => {
                            setEditError(error instanceof Error ? error.message : "แก้ไขรายการไม่สำเร็จ");
                          }).finally(() => setSavingEdit(false));
                        }}
                        className="rounded-lg bg-[#2d6e3e] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        บันทึก
                      </button>
                      <button type="button" onClick={() => { setEditingId(null); setEditError(""); }} className="text-xs text-[#596c5c]">ยกเลิก</button>
                      {editError && <span role="alert" className="basis-full text-xs text-[#9d302b]">{editError}</span>}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  aria-label={`แก้ไข ${log.food.nameTh}`}
                  onClick={() => { setEditingId(log.id); setEditedServings(String(log.servings)); setEditError(""); }}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-[#596c5c] hover:bg-[#edf4ee] hover:text-[#2d6e3e]"
                >
                  ✎
                </button>
                <button
                  type="button"
                  aria-label={`ลบ ${log.food.nameTh}`}
                  onClick={() => onRemoveLog(log.id)}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-[#718078] hover:bg-[#fff0ed] hover:text-[#9d302b]"
                >
                  ♧
                </button>
              </div>
            ))}
          </section>
        );
      })}
      {!selectedLogs.length && (
        <div className="rounded-[22px] border border-dashed border-[#d8d7ce] bg-white p-10 text-center">
          <div aria-hidden="true" className="mb-2 text-3xl">◷</div>
          <div className="font-semibold text-[#1a2820]">ไม่มีรายการอาหารในวันนี้</div>
          <div className="mt-1 text-sm text-[#718078]">เลือกวันอื่นหรือเริ่มบันทึกอาหารของคุณ</div>
        </div>
      )}
    </div>
  );
}
