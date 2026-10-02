import { useMemo, useState } from "react";
import type { ActivityLevel, Gender, Goal, HealthProfile } from "../types";
import { computeHealthMetrics } from "../lib/health";

interface Props {
  onComplete: (profile: HealthProfile, displayName: string) => void | Promise<void>;
  initialProfile?: HealthProfile;
  initialName?: string;
}

const activities: { value: ActivityLevel; title: string; description: string }[] = [
  { value: "sedentary", title: "นั่งทำงาน", description: "ออกกำลังกายน้อยมาก" },
  { value: "light", title: "เบา", description: "ออกกำลังกาย 1–3 วัน/สัปดาห์" },
  { value: "moderate", title: "ปานกลาง", description: "ออกกำลังกาย 3–5 วัน/สัปดาห์" },
  { value: "active", title: "สูง", description: "ออกกำลังกาย 6–7 วัน/สัปดาห์" },
];

const goals: { value: Goal; title: string; description: string }[] = [
  { value: "lose_weight", title: "ลดน้ำหนัก", description: "ลดแคลอรีลงเล็กน้อยต่อวัน" },
  { value: "maintain", title: "คงน้ำหนัก", description: "รักษาน้ำหนักปัจจุบัน" },
  { value: "gain_muscle", title: "เพิ่มน้ำหนัก", description: "เพิ่มแคลอรีเพื่อสร้างกล้ามเนื้อ" },
];

const fieldClass = "mt-1.5 min-h-12 w-full rounded-xl border border-[#e5e2da] bg-[#f8f5ef] px-3.5 text-sm text-[#1a2820] focus:border-[#2d6e3e] focus:bg-white";

export default function OnboardingModal({ onComplete, initialProfile, initialName = "" }: Props) {
  const [step, setStep] = useState(1);
  const [displayName, setDisplayName] = useState(initialName);
  const [gender, setGender] = useState<Gender>(initialProfile?.gender ?? "male");
  const [weight, setWeight] = useState(String(initialProfile?.weight ?? ""));
  const [height, setHeight] = useState(String(initialProfile?.height ?? ""));
  const [age, setAge] = useState(String(initialProfile?.age ?? ""));
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>(initialProfile?.activityLevel ?? "moderate");
  const [goal, setGoal] = useState<Goal>(initialProfile?.goal ?? "maintain");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const metrics = useMemo(() => {
    const currentWeight = Number(weight);
    const currentHeight = Number(height);
    const currentAge = Number(age);
    if (!Number.isFinite(currentWeight) || !Number.isFinite(currentHeight) || !Number.isInteger(currentAge) ||
      currentWeight < 20 || currentWeight > 500 || currentHeight < 100 || currentHeight > 250 ||
      currentAge < 10 || currentAge > 120) return null;
    return computeHealthMetrics(gender, currentWeight, currentHeight, currentAge, activityLevel, goal);
  }, [gender, weight, height, age, activityLevel, goal]);

  const next = () => {
    setSaveError("");
    if (step === 1 && (!displayName.trim() || !Number.isInteger(Number(age)) || Number(age) < 10 || Number(age) > 120)) {
      setSaveError("กรอกชื่อและอายุระหว่าง 10–120 ปี");
      return;
    }
    if (step === 2 && (!Number.isFinite(Number(height)) || Number(height) < 100 || Number(height) > 250 ||
      !Number.isFinite(Number(weight)) || Number(weight) < 20 || Number(weight) > 500)) {
      setSaveError("กรอกส่วนสูง 100–250 ซม. และน้ำหนัก 20–500 กก.");
      return;
    }
    setStep((current) => Math.min(3, current + 1));
  };

  const finish = async () => {
    if (!metrics) {
      setSaveError("ตรวจสอบอายุ ส่วนสูง และน้ำหนักให้ถูกต้องก่อน");
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      await onComplete({
        gender,
        weight: Number(weight),
        height: Number(height),
        age: Number(age),
        activityLevel,
        goal,
        ...metrics,
      }, displayName.trim());
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "บันทึกโปรไฟล์ไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f8f5ef] px-4 py-8 sm:px-8">
      <div className="mx-auto w-full max-w-[620px]">
        <header className="mb-7 text-center">
          <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-[#edf4ee] text-[#2d6e3e]">
            <svg aria-hidden="true" className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 4c-7 0-13 3-13 10a6 6 0 0 0 6 6C20 20 20 12 20 4Z" /><path d="M4 21c2-5 6-8 11-11" />
            </svg>
          </span>
          <h1 className="text-2xl font-extrabold text-[#1a2820]">NutriThai</h1>
          <p className="mt-1 text-sm text-[#596c5c]">ตั้งค่าโปรไฟล์เพื่อแนะนำเป้าหมายสุขภาพของคุณ</p>
        </header>

        <section className="rounded-[22px] border border-[#e5e2da] bg-white p-5 shadow-sm sm:p-8">
          <header className="mb-6">
            <div className="mb-3 flex items-center justify-between text-xs font-semibold text-[#596c5c]">
              {step > 1 ? (
                <button type="button" aria-label="ขั้นตอนก่อนหน้า" onClick={() => { setStep((current) => current - 1); setSaveError(""); }} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-[#edf4ee]">
                  <span aria-hidden="true" className="text-xl">‹</span>
                </button>
              ) : <span />}
              <span>{step} / 3</span>
            </div>
            <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-[#edf4ee]">
              <div className="h-full rounded-full bg-[#2d6e3e] transition-all" style={{ width: `${(step / 3) * 100}%` }} />
            </div>
            <h2 className="text-lg font-bold text-[#1a2820]">
              {step === 1 ? "ตั้งค่าโปรไฟล์ · ข้อมูลส่วนตัว" : step === 2 ? "ตั้งค่าโปรไฟล์ · ข้อมูลร่างกาย" : "ตั้งค่าโปรไฟล์ · ระดับกิจกรรม"}
            </h2>
          </header>

          {step === 1 && (
            <div className="space-y-5">
              <label className="block text-sm font-medium text-[#1a2820]" htmlFor="profile-name">
                ชื่อของคุณ
                <input id="profile-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={50} placeholder="สมชาย" className={fieldClass} />
                <span className="mt-1 block text-xs font-normal text-[#718078]">ใช้แสดงในแอปเท่านั้น</span>
              </label>
              <label className="block text-sm font-medium text-[#1a2820]" htmlFor="profile-age">
                อายุ (ปี)
                <input id="profile-age" type="number" min="10" max="120" value={age} onChange={(event) => setAge(event.target.value)} className={fieldClass} />
              </label>
              <fieldset>
                <legend className="mb-2 text-sm font-medium text-[#1a2820]">เพศ</legend>
                <div className="grid grid-cols-2 gap-3">
                  {(["male", "female"] as Gender[]).map((value) => (
                    <button key={value} type="button" aria-pressed={gender === value} onClick={() => setGender(value)} className={`min-h-12 rounded-xl border px-3 text-sm font-semibold transition ${gender === value ? "border-[#2d6e3e] bg-[#edf4ee] text-[#245a33]" : "border-[#e5e2da] bg-white text-[#596c5c] hover:bg-[#f8f5ef]"}`}>
                      {value === "male" ? "ชาย" : "หญิง"}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm font-medium text-[#1a2820]" htmlFor="profile-height">
                  ส่วนสูง (ซม.)
                  <input id="profile-height" type="number" min="100" max="250" value={height} onChange={(event) => setHeight(event.target.value)} className={fieldClass} />
                </label>
                <label className="block text-sm font-medium text-[#1a2820]" htmlFor="profile-weight">
                  น้ำหนัก (กก.)
                  <input id="profile-weight" type="number" min="20" max="500" value={weight} onChange={(event) => setWeight(event.target.value)} className={fieldClass} />
                </label>
              </div>
              <fieldset>
                <legend className="mb-3 text-sm font-semibold text-[#1a2820]">เป้าหมายของคุณ</legend>
                <div className="space-y-2">
                  {goals.map((item) => (
                    <button key={item.value} type="button" aria-pressed={goal === item.value} onClick={() => setGoal(item.value)} className={`flex min-h-[68px] w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition ${goal === item.value ? "border-[#2d6e3e] bg-[#edf4ee]" : "border-[#e5e2da] hover:bg-[#f8f5ef]"}`}>
                      <span>
                        <span className="block text-sm font-semibold text-[#1a2820]">{item.title}</span>
                        <span className="mt-0.5 block text-xs text-[#718078]">{item.description}</span>
                      </span>
                      <span aria-hidden="true" className={`grid h-5 w-5 place-items-center rounded-full border ${goal === item.value ? "border-[#2d6e3e] bg-[#2d6e3e] text-white" : "border-[#c9cec7]"}`}>{goal === item.value ? "✓" : ""}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <fieldset>
                <legend className="mb-3 text-sm font-semibold text-[#1a2820]">ระดับกิจกรรม</legend>
                <div className="space-y-2">
                  {activities.map((item) => (
                    <button key={item.value} type="button" aria-pressed={activityLevel === item.value} onClick={() => setActivityLevel(item.value)} className={`flex min-h-16 w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition ${activityLevel === item.value ? "border-[#2d6e3e] bg-[#edf4ee]" : "border-[#e5e2da] hover:bg-[#f8f5ef]"}`}>
                      <span>
                        <span className="block text-sm font-semibold text-[#1a2820]">{item.title}</span>
                        <span className="mt-0.5 block text-xs text-[#718078]">{item.description}</span>
                      </span>
                      <span aria-hidden="true" className={`grid h-5 w-5 place-items-center rounded-full border ${activityLevel === item.value ? "border-[#2d6e3e] bg-[#2d6e3e] text-white" : "border-[#c9cec7]"}`}>{activityLevel === item.value ? "✓" : ""}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
              {metrics && (
                <section className="rounded-xl border border-[#e5e2da] bg-[#f8f5ef] p-4" aria-label="เป้าหมายรายวันที่แนะนำ">
                  <h3 className="mb-3 text-sm font-semibold text-[#1a2820]">เป้าหมายรายวันที่แนะนำ</h3>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    {[
                      { label: "แคลอรี", value: metrics.calorieGoal, unit: "kcal", color: "text-[#2d6e3e]" },
                      { label: "โปรตีน", value: metrics.proteinGoal, unit: "g", color: "text-[#4f84a8]" },
                      { label: "คาร์บ", value: metrics.carbsGoal, unit: "g", color: "text-[#d97706]" },
                      { label: "ไขมัน", value: metrics.fatGoal, unit: "g", color: "text-[#66845d]" },
                    ].map((item) => (
                      <div key={item.label} className="min-w-0">
                        <p className={`text-base font-extrabold sm:text-lg ${item.color}`}>{item.value.toLocaleString()}</p>
                        <p className="text-[10px] text-[#718078] sm:text-xs">{item.unit} · {item.label}</p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 border-t border-[#e5e2da] pt-3 text-xs leading-5 text-[#718078]">เป้าหมายเป็นค่าประมาณสำหรับติดตามทั่วไป ไม่ใช่คำแนะนำทางการแพทย์</p>
                </section>
              )}
            </div>
          )}

          {saveError && <div role="alert" className="mt-5 rounded-xl border border-[#f0c9c4] bg-[#fff1ef] p-3 text-sm text-[#9d302b]">{saveError}</div>}
          {step < 3 ? (
            <button type="button" onClick={next} className="mt-6 min-h-12 w-full rounded-xl bg-[#2d6e3e] px-4 text-sm font-bold text-white transition hover:bg-[#245a33]">
              ถัดไป <span aria-hidden="true">›</span>
            </button>
          ) : (
            <button type="button" onClick={() => void finish()} disabled={saving || !metrics} className="mt-6 min-h-12 w-full rounded-xl bg-[#2d6e3e] px-4 text-sm font-bold text-white transition hover:bg-[#245a33] disabled:opacity-50">
              {saving ? "กำลังบันทึก..." : "เริ่มต้นใช้งาน"}
            </button>
          )}
        </section>
      </div>
    </main>
  );
}
