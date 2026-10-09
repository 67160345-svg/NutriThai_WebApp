import { basisLabel } from "../lib/portions";
import { Food, FoodLog, HealthProfile } from "../types";
import { getTotals } from "../lib/health";
import { localDateKey } from "../lib/foodLogs";

interface Props {
  healthProfile: HealthProfile;
  logs: FoodLog[];
  foods: Food[];
}

export default function AdviceCard({ healthProfile, logs, foods }: Props) {
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
      totals: getTotals(dayLogs),
      hasLogs: dayLogs.length > 0,
    };
  });
  const trackedDays = weekly.filter((day) => day.hasLogs);
  const averageCalories = trackedDays.length
    ? Math.round(trackedDays.reduce((sum, day) => sum + day.totals.calories, 0) / trackedDays.length)
    : 0;
  const maxCalories = Math.max(healthProfile.calorieGoal, ...weekly.map((day) => day.totals.calories), 1);
  const highCalorieDays = trackedDays.filter((day) => day.totals.calories > healthProfile.calorieGoal).length;
  const todayKey = localDateKey(new Date());
  const todayLogs = logs.filter((log) => localDateKey(new Date(log.loggedAt)) === todayKey);
  const todayTotals = getTotals(todayLogs);
  const sourceFood = todayLogs.find((log) => log.food.category === "food")?.food;
  const menuSwaps = sourceFood
    ? foods.filter((food) => food.category === "food" && food.id !== sourceFood.id && food.servingUnit === sourceFood.servingUnit &&
      food.servingSize === sourceFood.servingSize &&
      (food.servingUnit === "g" || food.servingUnit === "ml" ||
        (Boolean(food.portionGrams) && food.portionGrams === sourceFood.portionGrams)) &&
      food.calories < sourceFood.calories - 80).slice(0, 3)
    : [];

  return (
    <div className="mx-auto w-full max-w-[1160px] px-4 py-7 sm:px-8">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-[#1a2820]">ข้อมูลเชิงลึก</h1>
        <p className="mt-1 text-sm text-[#596c5c]">แนวโน้มจากอาหารที่คุณบันทึกไว้ในช่วง 7 วันที่ผ่านมา</p>
      </div>

      <section className="mb-5 rounded-[22px] border border-[#e5e2da] bg-white p-5 shadow-sm sm:p-6" aria-labelledby="weekly-calories-title">
        <h2 id="weekly-calories-title" className="text-base font-bold text-[#1a2820]">แคลอรีรายสัปดาห์</h2>
        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-[#596c5c]">
          <span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-[#2d6e3e]" />รับประทาน</span>
          <span className="flex items-center gap-2"><i className="h-px w-4 border-t border-dashed border-[#d97706]" />เป้าหมาย {healthProfile.calorieGoal.toLocaleString()} kcal</span>
        </div>
        <div className="relative mt-4">
          <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-[#d97706]/70" style={{ bottom: `${(healthProfile.calorieGoal / maxCalories) * 100}%` }} />
          <div className="grid h-48 grid-cols-7 items-end gap-2 sm:h-56 sm:gap-4" role="img" aria-label="กราฟแคลอรีรายวันในช่วง 7 วันที่ผ่านมา">
            {weekly.map((day) => {
              const height = day.totals.calories ? Math.max(4, (day.totals.calories / maxCalories) * 100) : 2;
              return (
                <div key={day.key} className="flex h-full min-w-0 flex-col items-center justify-end gap-2" title={`${day.key}: ${Math.round(day.totals.calories)} kcal`}>
                  <div
                    className={`w-full max-w-10 rounded-t-md ${day.totals.calories > healthProfile.calorieGoal ? "bg-[#c84b4b]" : day.key === todayKey ? "bg-[#2d6e3e]" : "bg-[#8ec3a1]"}`}
                    style={{ height: `${height}%` }}
                  />
                  <span className="text-[10px] text-[#596c5c]">{day.label.replace("วัน", "")}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap justify-between gap-2 border-t border-[#edf4ee] pt-3 text-xs text-[#596c5c]">
          <span>บันทึกแล้ว {trackedDays.length}/7 วัน</span>
          <span>เฉลี่ย {averageCalories ? `${averageCalories.toLocaleString()} kcal` : "ยังไม่มีข้อมูล"}</span>
          <span>เกินเป้าหมาย {highCalorieDays} วัน</span>
        </div>
        <details className="mt-4 rounded-xl bg-[#f8f5ef] px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium text-[#596c5c]">ดูค่ารายวันเป็นข้อความ (kcal)</summary>
          <ul className="mt-3 grid grid-cols-2 gap-2 text-xs text-[#596c5c] sm:grid-cols-4">
            {weekly.map((day) => (
              <li key={day.key} className="flex justify-between gap-2">
                <span>{day.label} {new Date(`${day.key}T12:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}</span>
                <strong className="text-[#1a2820]">{Math.round(day.totals.calories)}</strong>
              </li>
            ))}
          </ul>
        </details>
      </section>

      <section className="mb-5 rounded-[22px] border border-[#e5e2da] bg-white p-5 shadow-sm sm:p-6">
        <h2 className="mb-4 text-base font-bold text-[#1a2820]">ข้อสังเกตจากข้อมูลของคุณ</h2>
        {trackedDays.length ? (
          <div className="space-y-4">
            <article className="flex gap-3">
              <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#edf4ee] text-xl">◷</span>
              <div>
                <h3 className="text-sm font-semibold text-[#1a2820]">ความสม่ำเสมอในการบันทึก</h3>
                <p className="mt-1 text-sm leading-relaxed text-[#596c5c]">สัปดาห์นี้คุณบันทึกอาหาร {trackedDays.length} จาก 7 วัน ค่าเฉลี่ยแคลอรีคำนวณจากวันที่มีรายการเท่านั้น</p>
              </div>
            </article>
            <article className="flex gap-3">
              <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#f8f1e6] text-xl">◉</span>
              <div>
                <h3 className="text-sm font-semibold text-[#1a2820]">ภาพรวมพลังงาน</h3>
                <p className="mt-1 text-sm leading-relaxed text-[#596c5c]">
                  ค่าเฉลี่ยจากข้อมูลที่บันทึกคือ {averageCalories.toLocaleString()} kcal ต่อวัน เทียบกับเป้าหมายส่วนตัว {healthProfile.calorieGoal.toLocaleString()} kcal
                  {highCalorieDays ? ` · มี ${highCalorieDays} วันที่สูงกว่าเป้าหมาย` : ""}
                </p>
              </div>
            </article>
            <article className="flex gap-3">
              <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#edf4ee] text-xl">♧</span>
              <div>
                <h3 className="text-sm font-semibold text-[#1a2820]">สารอาหารวันนี้</h3>
                <p className="mt-1 text-sm leading-relaxed text-[#596c5c]">โปรตีน {Math.round(todayTotals.protein)} g · คาร์โบไฮเดรต {Math.round(todayTotals.carbs)} g · ไขมัน {Math.round(todayTotals.fat)} g จากรายการอาหารที่บันทึกวันนี้</p>
              </div>
            </article>
          </div>
        ) : (
          <div className="rounded-xl bg-[#f8f5ef] p-4 text-sm leading-relaxed text-[#596c5c]">ยังไม่มีข้อมูลเพียงพอสำหรับสรุปแนวโน้ม เริ่มบันทึกอาหารในแต่ละวันเพื่อดูภาพรวมจากข้อมูลของคุณ</div>
        )}
      </section>

      {menuSwaps.length > 0 && sourceFood && (
        <section className="rounded-[22px] border border-[#e5e2da] bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-base font-bold text-[#1a2820]">ไอเดียเมนูไทยสำหรับมื้อถัดไป</h2>
          <p className="mt-1 text-sm text-[#596c5c]">ตัวเลือกที่ใช้ปริมาณอ้างอิงเท่ากัน ({basisLabel(sourceFood)}) และแคลอรีน้อยกว่า {sourceFood.nameTh} · เลือกปริมาณตามความเหมาะสม</p>
          <div className="mt-4 space-y-2">
            {menuSwaps.map((food) => (
              <div key={food.id} className="flex items-center justify-between gap-3 rounded-[16px] border border-[#edf4ee] bg-[#fbfcf9] p-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-[#1a2820]">{food.nameTh}</div>
                  <div className="text-xs text-[#718078]">{food.calories} kcal · {food.protein} g โปรตีน</div>
                </div>
                <span className="shrink-0 rounded-full bg-[#edf4ee] px-2.5 py-1 text-xs font-semibold text-[#2d6e3e]">−{sourceFood.calories - food.calories} kcal</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
