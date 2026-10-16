import { useId } from "react";
import { consumedLabel } from "../lib/portions";
import type { FoodLog, HealthProfile, MealType, Page } from "../types";
import { getTotals } from "../lib/health";
import { localDateKey } from "../lib/foodLogs";
import Button from "./Button";
import Icon from "./Icon";

interface Props {
  healthProfile: HealthProfile;
  logs: FoodLog[];
  onRemoveLog: (id: string) => void;
  onNavigate?: (page: Page) => void;
  username?: string;
}

const meals: { id: MealType; label: string; icon: string }[] = [
  { id: "breakfast", label: "มื้อเช้า", icon: "bowl" },
  { id: "lunch", label: "มื้อกลางวัน", icon: "bowl" },
  { id: "dinner", label: "มื้อเย็น", icon: "bowl" },
  { id: "snack", label: "ของว่าง", icon: "leaf" },
];

function CalorieRing({ consumed, goal }: { consumed: number; goal: number }) {
  const gradientId = useId();
  const radius = 84;
  const circumference = 2 * Math.PI * radius;
  const progress = goal > 0 ? Math.min(consumed / goal, 1) : 0;
  return <div className="calorie-ring" aria-label={`${consumed} จาก ${goal} kcal`}>
    <svg viewBox="0 0 200 200" aria-hidden="true">
      <defs><linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#bde96c" /><stop offset="1" stopColor="#7fcdbd" /></linearGradient></defs>
      <circle cx="100" cy="100" r={radius} fill="none" stroke="#edf1ec" strokeWidth="15" />
      <circle cx="100" cy="100" r={radius} fill="none" stroke={consumed > goal ? "#c85a53" : `url(#${gradientId})`} strokeWidth="15" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress)} transform="rotate(-90 100 100)" />
    </svg>
    <div className="calorie-ring-copy"><strong>{consumed.toLocaleString()}</strong><span>จาก {goal.toLocaleString()} kcal</span><b>{goal > 0 ? Math.round(consumed / goal * 100) : 0}%</b></div>
  </div>;
}

export default function Dashboard({ healthProfile, logs, onRemoveLog, onNavigate, username = "คุณ" }: Props) {
  const todayDate = new Date();
  const todayKey = localDateKey(todayDate);
  const todayLogs = logs.filter(log => localDateKey(new Date(log.loggedAt)) === todayKey);
  const totals = getTotals(todayLogs);
  const remaining = healthProfile.calorieGoal - Math.round(totals.calories);
  const weekStart = new Date(todayDate);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const weekly = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + index);
    const key = localDateKey(date);
    return { key, date, label: date.toLocaleDateString("th-TH", { weekday: "short" }),
      calories: Math.round(getTotals(logs.filter(log => localDateKey(new Date(log.loggedAt)) === key)).calories),
      isToday: key === todayKey, isFuture: key > todayKey };
  });
  const trackedDays = weekly.filter(day => !day.isFuture && day.calories > 0);
  const average = trackedDays.length ? Math.round(trackedDays.reduce((sum, day) => sum + day.calories, 0) / trackedDays.length) : 0;
  const maxCalories = Math.max(healthProfile.calorieGoal * 1.1, ...weekly.map(day => day.calories), 1);
  const points = weekly.filter(day => !day.isFuture).map((day, i) => `${12 + i * 46},${136 - day.calories / maxCalories * 116}`).join(" ");
  const goalY = 136 - healthProfile.calorieGoal / maxCalories * 116;

  return <div className="dashboard-page">
    <div className="dashboard-heading">
      <div><p className="eyebrow">A LITTLE BETTER, EVERY DAY</p><h1>วันนี้ กินดีขึ้นอีกนิด<Icon name="leaf" /></h1><p>สวัสดี {username} · บันทึกทีละมื้อ เห็นภาพรวมทั้งวัน</p></div>
      <span className="today-chip">{todayDate.toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long" })}</span>
    </div>
    <div className="dashboard-grid">
      <div className="dashboard-main">
        <div className="dashboard-top">
          <section className="dashboard-hero">
            <img src="/images/nutrithai-bowl.png" width="1280" height="1280" alt="" className="hero-bowl" fetchPriority="high" />
            <div className="hero-copy"><p className="eyebrow">EAT WELL, LIVE WELL</p><h2>ทุกมื้อดี<br />เริ่มที่การเลือก<Icon name="leaf" /></h2><p>ดูแลเป้าหมายของคุณในทุกวัน</p><Button onClick={() => onNavigate?.("logger")}><Icon name="plus" />บันทึกอาหาร</Button></div>
          </section>
          <section className="weekly-card">
            <div className="card-heading"><h2>พลังงานสัปดาห์นี้</h2><span>kcal</span></div>
            <p className="weekly-subtitle">จันทร์–อาทิตย์ · จากรายการที่บันทึก</p>
            <div className="weekly-chart">
              <svg viewBox="0 0 300 158" role="img" aria-label={`กราฟแคลอรีที่บันทึกใน 7 วัน: ${weekly.filter(d => !d.isFuture).map(d => `${d.label} ${d.calories} kcal`).join(", ")}`}>
                {[20, 78, 136].map(y => <line key={y} x1="8" y1={y} x2="292" y2={y} stroke="currentColor" strokeOpacity="0.14" />)}
                <line x1="8" x2="292" y1={goalY} y2={goalY} stroke="#8dc8bb" strokeWidth="1" strokeDasharray="4 5" />
                {trackedDays.length > 0 && <><polyline points={`12,136 ${points} ${12 + (weekly.filter(d => !d.isFuture).length - 1) * 46},136`} fill="#cfe9a1" opacity="0.08" /><polyline points={points} stroke="#dff59e" strokeWidth="2.5" strokeLinejoin="round" fill="none" />{weekly.map((day, i) => !day.isFuture && <circle key={day.key} cx={12 + i * 46} cy={136 - day.calories / maxCalories * 116} r={day.isToday ? 5 : 3} fill="#e1f5a3"><title>{day.label}: {day.calories} kcal</title></circle>)}</>}
              </svg>
              {!trackedDays.length && <p className="chart-empty">ยังไม่มีบันทึกในสัปดาห์นี้</p>}
            </div>
            <div className="weekly-labels">{weekly.map(day => <span key={day.key} className={day.isToday ? "is-today" : ""}>{day.label}</span>)}</div>
            <button type="button" className="weekly-footer" onClick={() => onNavigate?.("advice")}><span>ค่าเฉลี่ย {average ? `${average.toLocaleString()} kcal` : "ยังไม่มีข้อมูล"}</span><span>ดูแนวโน้ม <Icon name="arrow" /></span></button>
          </section>
        </div>
        <div className="dashboard-bottom" aria-label="สรุปโภชนาการประจำวัน">
          <section className="nt-card macros-card"><div className="card-heading"><h2>สารอาหารวันนี้</h2><span>กรัม</span></div>
            {[
              { label: "โปรตีน", value: totals.protein, goal: healthProfile.proteinGoal, color: "#58b8e8", tone: "blue", icon: "protein" },
              { label: "คาร์โบไฮเดรต", value: totals.carbs, goal: healthProfile.carbsGoal, color: "#f6c23c", tone: "yellow", icon: "grain" },
              { label: "ไขมัน", value: totals.fat, goal: healthProfile.fatGoal, color: "#70c49b", tone: "green", icon: "drop" },
            ].map(macro => <div className="macro-row" key={macro.label}>
              <span className={`macro-icon macro-icon--${macro.tone}`}><Icon name={macro.icon} /></span>
              <div className="macro-details"><div className="macro-label"><strong>{macro.label}</strong><span><b>{Math.round(macro.value)}</b> / {macro.goal} g</span></div>
                <div className="macro-track" role="progressbar" aria-label={macro.label} aria-valuenow={Math.min(Math.round(macro.value), macro.goal)} aria-valuemin={0} aria-valuemax={macro.goal}><div style={{ width: `${macro.goal > 0 ? Math.min(macro.value / macro.goal * 100, 100) : 0}%`, backgroundColor: macro.color }} /></div>
              </div>
            </div>)}
            <p className="card-footnote">รับประทานแล้ว / เป้าหมายประจำวัน</p>
          </section>
          <section className="nt-card meals-card"><div className="card-heading"><h2>มื้ออาหารของคุณ</h2><button type="button" className="text-link" onClick={() => onNavigate?.("history")}>ดูประวัติ <Icon name="arrow" /></button></div>
            <div className="meal-list">{meals.map(meal => {
              const mealLogs = todayLogs.filter(log => log.mealType === meal.id);
              const calories = Math.round(getTotals(mealLogs).calories);
              return <article className={`meal-group meal-group--${meal.id}`} key={meal.id}>
                <header><span className="meal-type-icon"><Icon name={meal.icon} /></span><div><h3>{meal.label}</h3><p>{mealLogs.length ? `${mealLogs.length} รายการ` : "ยังไม่ได้บันทึกมื้อนี้"}</p></div><strong>{calories} <small>kcal</small></strong></header>
                {mealLogs.map(log => <div className="meal-log" key={log.id}><div><strong>{log.food.nameTh || log.food.name}</strong><p>{consumedLabel(log.food, log.servings)} · {Math.round(log.food.calories * log.servings)} kcal</p></div><button type="button" aria-label={`ลบ ${log.food.nameTh || log.food.name}`} onClick={() => onRemoveLog(log.id)} className="remove-meal">×</button></div>)}
                <button type="button" className="meal-add" onClick={() => onNavigate?.("logger")}><Icon name="plus" />เพิ่ม{meal.label.replace("มื้อ", "")}</button>
              </article>;
            })}</div>
          </section>
        </div>
      </div>
      <aside className="dashboard-rail">
        <section className="nt-card week-calendar" aria-label="สัปดาห์ปัจจุบัน"><h2>{todayDate.toLocaleDateString("th-TH-u-ca-gregory", { month: "long", year: "numeric" })}</h2><div>{weekly.map(day => <span key={day.key} className={day.isToday ? "is-today" : ""} aria-current={day.isToday ? "date" : undefined}><small>{day.label}</small><strong>{day.date.getDate()}</strong><i /></span>)}</div></section>
        <section className="nt-card energy-card"><div className="card-heading"><h2>พลังงานวันนี้</h2><span>kcal</span></div><CalorieRing consumed={Math.round(totals.calories)} goal={healthProfile.calorieGoal} /><p className={`energy-remaining ${remaining < 0 ? "is-over" : ""}`}>{remaining < 0 ? "เกินเป้าหมาย" : "เหลืออีก"} <strong>{Math.abs(remaining).toLocaleString()}</strong> kcal</p><p className="card-footnote">เป้าหมายจากโปรไฟล์ของคุณ</p></section>
        <section className="scan-card"><div className="scan-icon"><Icon name="camera" /></div><p className="eyebrow">A LITTLE HELP FROM AI</p><h2>สแกนอาหารด้วย AI</h2><p>เริ่มจากรูปมื้ออร่อย<br />แล้วตรวจข้อมูลก่อนบันทึก</p><Button variant="ghost" onClick={() => onNavigate?.("ai-scan")}><span>เริ่มสแกนอาหาร</span><Icon name="arrow" /></Button><small>ขอความยินยอมก่อนส่งรูปทุกครั้ง</small></section>
      </aside>
    </div>
  </div>;
}
