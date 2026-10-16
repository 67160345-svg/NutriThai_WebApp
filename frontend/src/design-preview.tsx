// Isolated development preview: synthetic data; never saves to an account.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import type { Food, FoodLog, HealthProfile, Page } from "./types";
import Dashboard from "./components/Dashboard";
import Navbar from "./components/Navbar";
import FoodRecommendations from "./components/FoodRecommendations";
import History from "./components/History";
import AdviceCard from "./components/AdviceCard";
import FoodLogger from "./components/FoodLogger";
import AuthPage from "./components/AuthPage";
import PasswordRecovery from "./components/PasswordRecovery";
import OnboardingModal from "./components/OnboardingModal";
import Icon from "./components/Icon";
import { localDateKey } from "./lib/foodLogs";
import "./index.css";

const profile: HealthProfile = { gender: "male", age: 30, weight: 70, height: 175, activityLevel: "moderate", goal: "maintain", bmr: 1600, tdee: 2000, calorieGoal: 2000, proteinGoal: 125, carbsGoal: 250, fatGoal: 56 };
const food = (id: number, name: string, nameTh: string, calories: number, protein: number, carbs: number, fat: number): Food => ({ id, name, nameTh, calories, protein, carbs, fat, sugar: 0, fiber: 2, category: "food", source: "catalog", servingSize: 1, servingUnit: "portion", servingLabel: "ถ้วย", portionGrams: 200 });
const foods = [food(1, "Breakfast", "ข้าวต้มไก่", 320, 20, 45, 7), food(2, "Lunch", "ข้าวไก่ย่างและผัก", 650, 40, 70, 25), food(3, "Snack", "โยเกิร์ตและผลไม้", 270, 15, 30, 8)];
const logs: FoodLog[] = foods.map((food, i) => ({ id: `preview-${i}`, food, servings: 1, mealType: (["breakfast", "lunch", "snack"] as const)[i], loggedAt: new Date() }));
for (let i = 1; i < 5; i++) { const date = new Date(); date.setDate(date.getDate() - i); logs.push({ id: `past-${i}`, food: foods[1], servings: 1.5 + i * 0.1, mealType: "lunch", loggedAt: date }); }

function Preview() {
  const [page, setPage] = useState<Page>("dashboard");
  const [specialPage, setSpecialPage] = useState("");
  const previewControls = <div className="design-preview-controls"><label>หน้าตรวจดีไซน์ <select aria-label="หน้าตรวจดีไซน์" value={specialPage || page} onChange={event => { const value = event.target.value; if (["auth", "recovery", "profile"].includes(value)) setSpecialPage(value); else { setSpecialPage(""); setPage(value as Page); } }}><option value="dashboard">Dashboard</option><option value="history">ประวัติอาหาร</option><option value="advice">ข้อมูลเชิงลึก</option><option value="ai-scan">สแกน AI</option><option value="logger">คำแนะนำอาหาร</option><option value="auth">เข้าสู่ระบบ / สมัครสมาชิก</option><option value="recovery">ตั้งรหัสผ่านใหม่</option><option value="profile">โปรไฟล์</option></select></label><span>ข้อมูลตัวอย่าง · ไม่บันทึกลงบัญชี</span></div>;
  if (specialPage) return <>{previewControls}<div onSubmitCapture={event => { event.preventDefault(); event.stopPropagation(); }}>{specialPage === "auth" ? <AuthPage onGuest={() => setSpecialPage("profile")} onAuthenticated={() => {}} /> : specialPage === "recovery" ? <PasswordRecovery onComplete={() => {}} /> : <OnboardingModal editing isGuest initialProfile={profile} initialName="คุณ" onComplete={() => {}} onCancel={() => setSpecialPage("")} />}</div></>;
  return <div className="app-shell"><Navbar page={page} onNavigate={setPage} username="คุณ" isGuest onEditProfile={() => setSpecialPage("profile")} onSignOut={() => setSpecialPage("auth")} /><div className="app-content">{previewControls}<header className="app-header"><div className="app-header-inner"><div className="header-tagline">NutriThai<span>โภชนาการที่เข้าใจง่าย ในทุกมื้อของคุณ</span></div><button type="button" className="header-search" aria-label="ค้นหาอาหาร" onClick={() => setPage("logger")}><Icon name="search" /><span>ค้นหาอาหาร...</span></button></div></header><main className="app-main">
    {page === "dashboard" && <Dashboard healthProfile={profile} logs={logs} onRemoveLog={() => {}} onNavigate={setPage} />}
    {page === "history" && <History logs={logs} onRemoveLog={() => {}} onUpdateServings={async () => {}} onCopyMeal={async () => {}} onUpdateLog={async () => {}} />}
    {page === "advice" && <AdviceCard healthProfile={profile} logs={logs} foods={foods} weights={[{ measuredOn: localDateKey(new Date()), weightKg: 70 }]} onSaveWeight={async () => {}} onDeleteWeight={async () => {}} />}
    {page === "ai-scan" && <FoodLogger scanOnly initialTab="scan" foods={foods} onAddLog={async () => {}} isAuthenticated={false} />}
    {page === "logger" && <div className="food-logger"><FoodRecommendations foods={foods} customFoods={[]} logs={[]} profile={profile} date={localDateKey(new Date())} meal="lunch" category="all" onMealChange={() => {}} onSelect={() => {}} onPlan={() => {}} /></div>}
  </main></div></div>;
}

if (import.meta.env.DEV) createRoot(document.getElementById("root")!).render(<Preview />);
