import { FoodLog, HealthProfile, MealType, Page } from "../types";
import { getTotals } from "../lib/health";
import { localDateKey } from "../lib/foodLogs";

interface Props {
  healthProfile: HealthProfile;
  logs: FoodLog[];
  onRemoveLog: (id: string) => void;
  onNavigate?: (page: Page) => void;
  username?: string;
}

const meals: { id: MealType; label: string; icon: string }[] = [
  { id: "breakfast", label: "มื้อเช้า", icon: "☼" },
  { id: "lunch", label: "มื้อกลางวัน", icon: "☀" },
  { id: "dinner", label: "มื้อเย็น", icon: "◉" },
  { id: "snack", label: "ของว่าง", icon: "♧" },
];

function CalorieRing({ consumed, goal }: { consumed: number; goal: number }) {
  const size = 150;
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = goal > 0 ? Math.min(consumed / goal, 1) : 0;
  const remaining = goal - consumed;
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }} aria-label={`${consumed} จาก ${goal} kcal`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#edf4ee" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={remaining < 0 ? "#c84b4b" : "#2d6e3e"}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
        />
      </svg>
      <div className="absolute text-center">
        <div className="text-3xl font-extrabold text-[#1a2820]">{consumed.toLocaleString()}</div>
        <div className="text-xs text-[#596c5c]">kcal รับประทานแล้ว</div>
      </div>
    </div>
  );
}

export default function Dashboard({ healthProfile, logs, onRemoveLog, onNavigate, username = "คุณ" }: Props) {
  const todayKey = localDateKey(new Date());
  const todayLogs = logs.filter((log) => localDateKey(new Date(log.loggedAt)) === todayKey);
  const totals = getTotals(todayLogs);
  const remaining = healthProfile.calorieGoal - Math.round(totals.calories);
  const today = new Date().toLocaleDateString("th-TH", {
    weekday: "long", day: "numeric", month: "long",
  });
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const weekly = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + index);
    const key = localDateKey(date);
    const dayLogs = logs.filter((log) => localDateKey(new Date(log.loggedAt)) === key);
    return {
      key,
      label: date.toLocaleDateString("th-TH", { weekday: "short" }),
      calories: Math.round(getTotals(dayLogs).calories),
      isToday: index === 6,
    };
  });
  const maxCalories = Math.max(healthProfile.calorieGoal, ...weekly.map((day) => day.calories), 1);
  const trackedDays = weekly.filter((day) => day.calories > 0);
  const average = trackedDays.length
    ? Math.round(trackedDays.reduce((sum, day) => sum + day.calories, 0) / trackedDays.length)
    : 0;

  return (
    <div className="mx-auto w-full max-w-[1160px] px-4 py-7 sm:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="mb-2 text-xs font-bold tracking-[0.1em] text-[#2d6e3e]">TODAY / {today}</div>
          <h1 className="text-3xl font-bold leading-tight text-[#1a2820] sm:text-4xl">วันนี้ ดูแลตัวเองไปด้วยกัน</h1>
          <p className="mt-2 text-sm text-[#596c5c]">สวัสดี {username} · บันทึกทีละมื้อ เห็นภาพรวมทั้งวัน</p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate?.("logger")}
          className="flex min-h-12 items-center gap-2 rounded-[14px] bg-[#2d6e3e] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#245a33]"
        >
          <span aria-hidden="true" className="text-xl">＋</span> เพิ่มอาหาร
        </button>
      </div>

      <section className="mb-6 grid gap-5 md:grid-cols-2" aria-label="สรุปโภชนาการประจำวัน">
        <div className="rounded-[22px] border border-[#e5e2da] bg-white p-5 shadow-sm sm:p-6">
          <h2 className="mb-5 flex items-center gap-2 text-lg font-bold text-[#1a2820]">
            พลังงานวันนี้ <span className="rounded-full bg-[#edf4ee] px-2.5 py-1 text-[11px] font-semibold text-[#2d6e3e]">ข้อมูลของคุณ</span>
          </h2>
          <div className="flex flex-col items-center gap-5 sm:flex-row sm:justify-center">
            <div className="flex flex-col items-center gap-4">
              <CalorieRing consumed={Math.round(totals.calories)} goal={healthProfile.calorieGoal} />
              <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${remaining < 0 ? "bg-[#fff1ef] text-[#9d302b]" : "bg-[#edf4ee] text-[#2d6e3e]"}`}>
                {remaining < 0 ? `เกินเป้า ${Math.abs(remaining).toLocaleString()} kcal` : `เหลืออีก ${remaining.toLocaleString()} kcal`}
              </span>
            </div>
            <div className="grid gap-4 text-center sm:text-left">
              <div>
                <div className="text-xs text-[#718078]">เป้าหมายต่อวัน</div>
                <div className="text-2xl font-extrabold text-[#1a2820]">{healthProfile.calorieGoal.toLocaleString()} <span className="text-sm font-medium">kcal</span></div>
              </div>
              <div>
                <div className="text-xs text-[#718078]">{remaining < 0 ? "เกินเป้าหมาย" : "ยังเหลืออีก"}</div>
                <div className={`text-2xl font-extrabold ${remaining < 0 ? "text-[#b84444]" : "text-[#2d6e3e]"}`}>{Math.abs(remaining).toLocaleString()} <span className="text-sm font-medium">kcal</span></div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-[22px] border border-[#e5e2da] bg-white p-5 shadow-sm sm:p-6">
          <h2 className="mb-5 text-lg font-bold text-[#1a2820]">สารอาหารหลัก</h2>
          <div className="grid gap-5">
            {[
              { label: "โปรตีน", value: totals.protein, goal: healthProfile.proteinGoal, color: "#4f84a8" },
              { label: "คาร์โบไฮเดรต", value: totals.carbs, goal: healthProfile.carbsGoal, color: "#d97706" },
              { label: "ไขมัน", value: totals.fat, goal: healthProfile.fatGoal, color: "#66845d" },
            ].map((macro) => (
              <div key={macro.label}>
                <div className="mb-2 flex items-baseline justify-between gap-1 text-xs text-[#596c5c]">
                  <span>{macro.label}</span>
                  <span className="whitespace-nowrap"><strong className="text-[#1a2820]">{Math.round(macro.value)}g</strong> / {macro.goal}g</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-[#eeeae2]" role="progressbar" aria-label={macro.label} aria-valuenow={Math.min(Math.round(macro.value), macro.goal)} aria-valuemin={0} aria-valuemax={macro.goal}>
                  <div className="h-full rounded-full" style={{ width: `${macro.goal ? Math.min((macro.value / macro.goal) * 100, 100) : 0}%`, backgroundColor: macro.color }} />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-5 text-xs text-[#718078]">รับประทานแล้ว / เป้าหมาย · หน่วยกรัม (g)</p>
        </div>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(260px,1fr)]">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl font-bold text-[#1a2820]">มื้ออาหารวันนี้</h2>
            <button type="button" onClick={() => onNavigate?.("history")} className="text-sm font-medium text-[#2d6e3e] hover:underline">ดูประวัติ ›</button>
          </div>
          <div className="overflow-hidden rounded-[20px] border border-[#e5e2da] bg-white shadow-sm">
          {meals.map((meal, index) => {
            const mealLogs = todayLogs.filter((log) => log.mealType === meal.id);
            const calories = Math.round(mealLogs.reduce((sum, log) => sum + log.food.calories * log.servings, 0));
            return (
              <article key={meal.id} className={index < meals.length - 1 ? "border-b border-[#e5e2da]" : ""}>
                <header className="flex items-center justify-between px-4 py-3">
                  <h3 className="flex items-center gap-2 font-semibold text-[#1a2820]">
                    <span aria-hidden="true" className="text-lg text-[#2d6e3e]">{meal.icon}</span>{meal.label}
                  </h3>
                  <span className="text-sm text-[#596c5c]">{calories} kcal</span>
                </header>
                {mealLogs.length ? mealLogs.map((log) => (
                  <div key={log.id} className="flex items-center gap-3 border-b border-[#edf4ee] px-4 py-3 last:border-0">
                    <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-[#f3f0ea] text-xl">{log.food.category === "drink" ? "♧" : log.food.category === "dessert" ? "✿" : "♨"}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-[#1a2820]">{log.food.nameTh}</div>
                      <div className="text-xs text-[#718078]">{log.servings} ที่ · {Math.round(log.food.calories * log.servings)} kcal</div>
                    </div>
                    <button type="button" aria-label={`ลบ ${log.food.nameTh}`} onClick={() => onRemoveLog(log.id)} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-[#718078] hover:bg-[#fff0ed] hover:text-[#9d302b]">×</button>
                  </div>
                )) : (
                  <div className="px-4 py-3 text-sm text-[#718078]">ยังไม่ได้บันทึกมื้อนี้</div>
                )}
                <button type="button" onClick={() => onNavigate?.("logger")} className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-[#2d6e3e] hover:bg-[#f8fbf7]">
                  <span aria-hidden="true">＋</span> เพิ่ม{meal.label.replace("มื้อ", "")}
                </button>
              </article>
            );
          })}
          </div>
        </section>

        <aside className="grid content-start gap-5">
          <section className="rounded-[22px] border border-[#dce8dd] bg-[#edf4ee] p-5 shadow-sm">
            <div className="mb-3 text-xs font-bold tracking-[0.1em] text-[#2d6e3e]">AI FOOD SCAN</div>
            <h2 className="text-lg font-bold text-[#1a2820]">เริ่มบันทึกจากรูปอาหาร</h2>
            <p className="mt-2 text-sm leading-relaxed text-[#596c5c]">ให้ AI ช่วยประมาณสารอาหาร แล้วตรวจสอบปริมาณให้ตรงกับมื้อของคุณก่อนบันทึก</p>
            <button type="button" onClick={() => onNavigate?.("ai-scan")} className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-[14px] border border-[#cbd8ca] bg-white px-4 text-sm font-semibold text-[#2d6e3e] hover:bg-[#f8fbf7]">
              <span aria-hidden="true">▧</span> สแกนอาหาร
            </button>
            <p className="mt-2 text-xs text-[#718078]">ขอความยินยอมก่อนเลือกรูปทุกครั้ง</p>
          </section>

          <section className="rounded-[22px] border border-[#e5e2da] bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-[#1a2820]">ภาพรวมสัปดาห์</h2>
                <p className="mt-1 text-xs text-[#718078]">จันทร์–อาทิตย์ · kcal</p>
              </div>
              <button type="button" onClick={() => onNavigate?.("advice")} className="text-xs font-semibold text-[#2d6e3e] hover:underline">ดูแนวโน้ม ›</button>
            </div>
            <div className="mt-4 grid h-36 grid-cols-7 items-end gap-2" role="img" aria-label="กราฟแคลอรีที่บันทึกใน 7 วัน">
              {weekly.map((day) => (
                <div key={day.key} className="flex h-full min-w-0 flex-col items-center justify-end gap-2" title={`${day.key}: ${day.calories} kcal`}>
                  <div className={`w-full max-w-8 rounded-t-md ${day.calories > healthProfile.calorieGoal ? "bg-[#c84b4b]" : day.isToday ? "bg-[#2d6e3e]" : "bg-[#8ec3a1]"}`} style={{ height: `${Math.max(day.calories ? 8 : 4, (day.calories / maxCalories) * 100)}%` }} />
                  <span className="text-[10px] text-[#718078]">{day.label.replace("วัน", "")}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-[#edf4ee] pt-3 text-xs text-[#596c5c]">
              <span>ค่าเฉลี่ย {average ? `${average.toLocaleString()} kcal` : "ยังไม่มีข้อมูล"}</span>
              <span>เป้าหมาย {healthProfile.calorieGoal.toLocaleString()}</span>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
