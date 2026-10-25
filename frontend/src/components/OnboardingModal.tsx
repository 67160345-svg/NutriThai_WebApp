import { RawText, useLocalizedView } from "../lib/i18n";
import { useMemo, useState } from "react";
import type { ActivityLevel, Gender, Goal, HealthProfile } from "../types";
import { computeHealthMetrics } from "../lib/health";
import Icon from "./Icon";
import Button from "./Button";

interface Props {
  onComplete: (profile: HealthProfile, displayName: string) => void | Promise<void>;
  initialProfile?: HealthProfile;
  initialName?: string;
  editing?: boolean;
  isGuest?: boolean;
  onCancel?: () => void;
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

const fieldClass = "profile-input";

export default function OnboardingModal({ onComplete, initialProfile, initialName = "", editing = false, isGuest = false, onCancel }: Props) {
  const { view } = useLocalizedView();
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
    if (!displayName.trim()) {
      setSaveError("กรอกชื่อของคุณก่อนบันทึก");
      return;
    }
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

  return view((
    <main className="profile-page">
      <div className="profile-container">
        <header className="profile-topbar">
          <div className="profile-brand"><Icon name="leaf" /><span>NutriThai<span className="profile-brand-dot">.</span></span></div>
          {onCancel && <button type="button" className="profile-back" disabled={saving} onClick={onCancel}><Icon name="arrow" /> กลับไปหน้าเดิม</button>}
        </header>
        <header className="profile-page-heading">
          <p className="eyebrow">A LITTLE MORE ABOUT YOU</p>
          <h1>{editing ? "โปรไฟล์ของคุณ" : "เริ่มต้นดูแลตัวเอง"} <Icon name="leaf" /></h1>
          <p>{editing ? "ปรับข้อมูลให้เป็นปัจจุบัน แล้วให้ทุกเป้าหมายเข้ากับคุณ" : "รู้จักคุณอีกนิด เพื่อเริ่มต้นเป้าหมายในแบบของคุณ"}</p>
        </header>
        <div className="profile-layout">
          <div className="profile-editor">
            <section className="profile-identity">
              <div className="profile-avatar-large" aria-hidden="true">{displayName.trim().slice(0, 1) || <Icon name="user" />}</div>
              <div><p className="profile-identity-label">MY NUTRITHAI</p><h2><RawText>{displayName.trim() || "ยินดีที่ได้รู้จัก"}</RawText></h2><span>{isGuest ? "โหมดผู้เยี่ยมชม" : "พื้นที่ดูแลโภชนาการของคุณ"}</span></div>
              <Icon name="leaf" className="profile-identity-leaf" />
            </section>
            {!editing && <nav className="profile-steps" aria-label="ขั้นตอนตั้งค่าโปรไฟล์">
              {["ข้อมูลส่วนตัว", "ร่างกายและเป้าหมาย", "ระดับกิจกรรม"].map((label, index) => <div key={label} aria-current={step === index + 1 ? "step" : undefined} className={step >= index + 1 ? "is-reached" : ""}><span>{index + 1}</span><p>{label}</p></div>)}
              <span className="profile-step-count">{step} / 3</span>
            </nav>}
            <fieldset disabled={saving} className="profile-fields">
              {(editing || step === 1) && <section className="profile-card">
                <header className="profile-card-heading"><span className="profile-section-icon"><Icon name="user" /></span><div><h2>ข้อมูลส่วนตัว</h2><p>ชื่อที่อยากให้เราเรียก และข้อมูลสำหรับคำนวณ</p></div><span className="profile-section-number">01</span></header>
                <div className="profile-field-grid">
                  <label className="profile-name-field" htmlFor="profile-name">ชื่อของคุณ<input id="profile-name" value={displayName} onChange={event => setDisplayName(event.target.value)} maxLength={50} placeholder="ชื่อที่คุณอยากให้เราเรียก" className={fieldClass} /><span className="profile-field-hint">ใช้แสดงในแอปเท่านั้น</span></label>
                  <label htmlFor="profile-age">อายุ (ปี)<input id="profile-age" type="number" inputMode="numeric" min="10" max="120" value={age} onChange={event => setAge(event.target.value)} className={fieldClass} /><span className="profile-field-hint">10–120 ปี</span></label>
                </div>
                <fieldset className="profile-gender"><legend>เพศที่ใช้คำนวณพลังงาน</legend><div>{(["male", "female"] as Gender[]).map(value => <button key={value} type="button" aria-pressed={gender === value} onClick={() => setGender(value)}>{value === "male" ? "ชาย" : "หญิง"}<span aria-hidden="true">{gender === value ? "✓" : ""}</span></button>)}</div></fieldset>
              </section>}
              {(editing || step === 2) && <section className="profile-card">
                <header className="profile-card-heading"><span className="profile-section-icon is-aqua"><Icon name="chart" /></span><div><h2>ร่างกายและเป้าหมาย</h2><p>เริ่มจากสิ่งที่เป็นคุณในวันนี้</p></div><span className="profile-section-number">02</span></header>
                <div className="profile-field-grid">
                  <label htmlFor="profile-height">ส่วนสูง (ซม.)<input id="profile-height" type="number" inputMode="decimal" min="100" max="250" value={height} onChange={event => setHeight(event.target.value)} className={fieldClass} /><span className="profile-field-hint">100–250 ซม.</span></label>
                  <label htmlFor="profile-weight">น้ำหนัก (กก.)<input id="profile-weight" type="number" inputMode="decimal" min="20" max="500" step="any" value={weight} onChange={event => setWeight(event.target.value)} className={fieldClass} /><span className="profile-field-hint">20–500 กก.</span></label>
                </div>
                <fieldset className="profile-options"><legend>เป้าหมายของคุณ</legend><div className="profile-goals">{goals.map((item, index) => <button key={item.value} type="button" aria-pressed={goal === item.value} onClick={() => setGoal(item.value)}><Icon name={index === 0 ? "leaf" : index === 1 ? "bowl" : "protein"} /><span><strong>{item.title}</strong><small>{item.description}</small></span><span className="profile-choice-check" aria-hidden="true">{goal === item.value ? "✓" : ""}</span></button>)}</div></fieldset>
              </section>}
              {(editing || step === 3) && <section className="profile-card">
                <header className="profile-card-heading"><span className="profile-section-icon is-yellow"><Icon name="grain" /></span><div><h2>กิจกรรมในแต่ละวัน</h2><p>เลือกความเคลื่อนไหวที่ใกล้เคียงกับชีวิตจริง</p></div><span className="profile-section-number">03</span></header>
                <fieldset className="profile-options"><legend className="sr-only">ระดับกิจกรรม</legend><div className="profile-activities">{activities.map((item, index) => <button key={item.value} type="button" aria-pressed={activityLevel === item.value} onClick={() => setActivityLevel(item.value)}><span className="profile-activity-bars" aria-hidden="true">{[0, 1, 2, 3].map(bar => <i key={bar} className={bar <= index ? "is-filled" : ""} />)}</span><span><strong>{item.title}</strong><small>{item.description}</small></span><span className="profile-choice-check" aria-hidden="true">{activityLevel === item.value ? "✓" : ""}</span></button>)}</div></fieldset>
              </section>}
            </fieldset>
            {saveError && <div role="alert" className="profile-error">{saveError}</div>}
            <footer className="profile-actions">
              <p><Icon name="leaf" />{isGuest ? "เก็บข้อมูลผู้เยี่ยมชมในเบราว์เซอร์เครื่องนี้" : editing ? "การเปลี่ยนแปลงจะมีผลเมื่อกดบันทึก" : "ปรับข้อมูลเหล่านี้ได้ภายหลัง"}</p>
              <div>{!editing && step > 1 && <button type="button" aria-label="ขั้นตอนก่อนหน้า" className="profile-previous" disabled={saving} onClick={() => { setStep(current => current - 1); setSaveError(""); }}>ย้อนกลับ</button>}
                {!editing && step < 3 ? <Button onClick={next}>ถัดไป <Icon name="arrow" /></Button> : <Button onClick={() => void finish()} disabled={saving || !metrics}>{saving ? "กำลังบันทึก..." : editing ? "บันทึกการเปลี่ยนแปลง" : "เริ่มต้นใช้งาน"}<Icon name="arrow" /></Button>}
              </div>
            </footer>
          </div>
          <aside className="profile-summary" aria-label="สรุปเป้าหมายของคุณ">
            <section className="profile-target" aria-label="เป้าหมายรายวันที่แนะนำ">
              <p className="eyebrow">YOUR DAILY BALANCE</p><h2>เป้าหมายในแบบของคุณ</h2><p>คำนวณจากข้อมูลที่คุณเลือก</p>
              <div className="profile-target-ring"><svg viewBox="0 0 200 200" aria-hidden="true"><circle cx="100" cy="100" r="84" /><circle cx="100" cy="100" r="84" /></svg><div><span>พลังงานต่อวัน</span><strong>{metrics ? metrics.calorieGoal.toLocaleString() : "—"}</strong><span>kcal / วัน</span></div></div>
              <span className="profile-goal-badge"><Icon name="leaf" />{goals.find(item => item.value === goal)?.title}</span>
              <div className="profile-macro-targets">{[{ label: "โปรตีน", value: metrics?.proteinGoal, icon: "protein" }, { label: "คาร์บ", value: metrics?.carbsGoal, icon: "grain" }, { label: "ไขมัน", value: metrics?.fatGoal, icon: "drop" }].map(item => <div key={item.label}><span><Icon name={item.icon} /></span><p>{item.label}</p><strong>{item.value ?? "—"}<small> g</small></strong></div>)}</div>
              {!metrics && <p className="profile-summary-notice">กรอกอายุ ส่วนสูง และน้ำหนักให้ครบ เพื่อดูเป้าหมายของคุณ</p>}
            </section>
            <section className="profile-energy-explainer"><span className="profile-section-icon"><Icon name="bowl" /></span><h3>รู้จักพลังงานของคุณ</h3><dl><div><dt>พลังงานพื้นฐาน (BMR)</dt><dd>{metrics ? metrics.bmr.toLocaleString() : "—"}<small> kcal</small></dd></div><div><dt>พลังงานที่ใช้ต่อวัน (TDEE)</dt><dd>{metrics ? metrics.tdee.toLocaleString() : "—"}<small> kcal</small></dd></div></dl><p>เป้าหมายเป็นค่าประมาณสำหรับติดตามทั่วไป ไม่ใช่คำแนะนำทางการแพทย์</p></section>
          </aside>
        </div>
      </div>
    </main>
  ));
}
