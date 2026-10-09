import { useEffect, useState } from "react";
import { FoodLog, HealthProfile, Page } from "./types";
import type { Food } from "./types";
import { computeHealthMetrics } from "./lib/health";
import { createFoodLog, deleteFoodLog, readFoodLogs, readFoods, readProfile, saveProfile, updateFoodLogServings, updateFoodLog, readCustomFoods, createCustomFood } from "./lib/foodLogs";
import { acceptAuthCallback, apiJson, signOut as signOutApi } from "./lib/api";
import type { ApiUser } from "./lib/api";
import AdviceCard from "./components/AdviceCard";
import AuthPage from "./components/AuthPage";
import Dashboard from "./components/Dashboard";
import FoodLogger from "./components/FoodLogger";
import History from "./components/History";
import Navbar from "./components/Navbar";
import OnboardingModal from "./components/OnboardingModal";
import PasswordRecovery from "./components/PasswordRecovery";

type Account = ApiUser;

const guestProfile: HealthProfile = {
  gender: "male",
  weight: 65,
  height: 170,
  age: 25,
  activityLevel: "moderate",
  goal: "maintain",
  ...computeHealthMetrics("male", 65, 170, 25, "moderate", "maintain"),
};

export default function App() {
  const [healthProfile, setHealthProfile] = useState<HealthProfile | null>(null);
  const [logs, setLogs] = useState<FoodLog[]>([]);
  const [foodCatalog, setFoodCatalog] = useState<Food[]>([]);
  const [customFoods, setCustomFoods] = useState<Food[]>([]);
  const [page, setPage] = useState<Page>("dashboard");
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showAuthPage, setShowAuthPage] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [accountLoading, setAccountLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    localStorage.removeItem("nutrithai_logs");
  }, []);

  const loadAuthenticatedUser = async (user: ApiUser) => {
    setAccount(user);
    setDisplayName(localStorage.getItem(`nutrithai_display_name:${user.id}`) || user.username);
    setIsGuest(false);
    setPage("dashboard");
    setAccountLoading(true);
    setErrorMessage("");
    try {
      const [profile, savedLogs, catalog, personalFoods] = await Promise.all([
        readProfile(),
        readFoodLogs(),
        readFoods(),
        readCustomFoods(),
      ]);
      setHealthProfile(profile ?? guestProfile);
      setLogs(savedLogs);
      setCustomFoods(personalFoods);
      setFoodCatalog(catalog);
      setShowOnboarding(!profile);
    } catch (error) {
      setErrorMessage(`โหลดข้อมูลบัญชีไม่สำเร็จ: ${error instanceof Error ? error.message : "เกิดข้อผิดพลาด"}`);
      setHealthProfile(null);
    } finally {
      setAccountLoading(false);
      setAuthReady(true);
    }
  };

  useEffect(() => {
    let active = true;
    const restoreSession = async () => {
      const hash = new URLSearchParams(window.location.hash.slice(1));
      const recoveryAccessToken = hash.get("access_token");
      const recoveryRefreshToken = hash.get("refresh_token");
      const authCallbackType = hash.get("type");
      if (authCallbackType && recoveryAccessToken && recoveryRefreshToken) {
        try {
          await acceptAuthCallback(
            recoveryAccessToken,
            recoveryRefreshToken,
            Number(hash.get("expires_in")) || undefined,
          );
          setIsPasswordRecovery(authCallbackType === "recovery");
        } catch (error) {
          setErrorMessage(`ลิงก์ตั้งรหัสผ่านใช้ไม่ได้: ${error instanceof Error ? error.message : "เกิดข้อผิดพลาด"}`);
        } finally {
          window.history.replaceState(null, "", window.location.pathname + window.location.search);
        }
      }
      try {
        const user = await apiJson<ApiUser>("/api/v1/auth/session");
        if (active) await loadAuthenticatedUser(user);
      } catch (error) {
        if (!active) return;
        if (error instanceof Error && !error.message.includes("กรุณาเข้าสู่ระบบ")) {
          setErrorMessage(`ตรวจสอบ session ไม่สำเร็จ: ${error.message}`);
        }
        setAuthReady(true);
      }
    };
    void restoreSession();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    document.documentElement.lang = "th";
  }, []);

  const addLog = async (log: FoodLog) => {
    if (isGuest) {
      setLogs((previous) => [...previous, log]);
      return;
    }
    if (!account) throw new Error("กรุณาเข้าสู่ระบบก่อนบันทึกอาหาร");
    const savedLog = await createFoodLog(log);
    setLogs((previous) => [...previous, savedLog]);
  };

  const removeLog = async (id: string) => {
    if (isGuest) {
      setLogs((previous) => previous.filter((log) => log.id !== id));
      return;
    }
    if (!account) throw new Error("กรุณาเข้าสู่ระบบก่อนลบรายการ");
    await deleteFoodLog(id);
    setLogs((previous) => previous.filter((log) => log.id !== id));
  };

  const updateLogServings = async (id: string, servings: number) => {
    const log = logs.find((item) => item.id === id);
    if (!log) throw new Error("ไม่พบรายการอาหาร");
    if (!isGuest) {
      if (!account) throw new Error("กรุณาเข้าสู่ระบบก่อนแก้ไขรายการ");
      await updateFoodLogServings(id, servings);
    }
    setLogs((previous) => previous.map((item) => item.id === id ? { ...item, servings } : item));
  };

  const addCustomFood = async (food: Food) => {
    if (!isGuest && !account) throw new Error("กรุณาเข้าสู่ระบบ");
    const saved = isGuest ? { ...food, customId: crypto.randomUUID() } : await createCustomFood(food);
    setCustomFoods(previous => [...previous, saved]);
    return saved;
  };

  const editLog = async (log: FoodLog) => {
    if (!isGuest && !account) throw new Error("กรุณาเข้าสู่ระบบ");
    const saved = isGuest ? { ...log, replaceFood: false } : await updateFoodLog(log);
    setLogs(previous => previous.map(item => item.id === log.id ? saved : item));
  };

  const continueAsGuest = async (profile: HealthProfile) => {
    setAccountLoading(true);
    setErrorMessage("");
    try {
      const catalog = await readFoods();
      setShowAuthPage(false);
      setAccount(null);
      setIsGuest(true);
      setHealthProfile(profile);
      const guestName = localStorage.getItem("nutrithai_display_name:guest") || "ผู้เยี่ยมชม";
      setDisplayName(guestName);
      setFoodCatalog(catalog);
      setLogs([]);
      setCustomFoods([]);
      setPage("dashboard");
      localStorage.removeItem("nutrithai_logs");
      setShowOnboarding(true);
    } catch (error) {
      setErrorMessage(`โหลดรายการอาหารไม่สำเร็จ: ${error instanceof Error ? error.message : "เกิดข้อผิดพลาด"}`);
    } finally {
      setAccountLoading(false);
    }
  };

  const signOut = async () => {
    if (!isGuest) {
      try {
        await signOutApi();
      } catch (error) {
        setErrorMessage(`ออกจากระบบไม่สำเร็จ: ${error instanceof Error ? error.message : "เกิดข้อผิดพลาด"}`);
        return;
      }
    }
    if (isGuest) localStorage.removeItem("nutrithai_logs");
    setAccount(null);
    setIsGuest(false);
    setDisplayName("");
    setHealthProfile(null);
    setLogs([]);
    setFoodCatalog([]);
    setCustomFoods([]);
    setShowOnboarding(false);
    setShowUserMenu(false);
  };

  if (!authReady || accountLoading) {
    return <div className="min-h-screen flex items-center justify-center text-[#24463a]">กำลังโหลดข้อมูลบัญชี...</div>;
  }

  if (isPasswordRecovery) {
    return <PasswordRecovery onComplete={() => setIsPasswordRecovery(false)} />;
  }

  if (showAuthPage) {
    return (
      <div>
        {errorMessage && <div role="alert" className="mx-auto mt-4 max-w-xl rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{errorMessage}</div>}
        <AuthPage
          onGuest={continueAsGuest}
          onAuthenticated={(user) => {
            setShowAuthPage(false);
            void loadAuthenticatedUser(user);
          }}
        />
      </div>
    );
  }

  if (!healthProfile && !isGuest) {
    if (account) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4 text-center">
          <div role="alert" className="max-w-lg rounded-xl bg-rose-50 p-4 text-sm text-rose-800">
            {errorMessage || "ไม่สามารถโหลดข้อมูลบัญชีได้"}
          </div>
          <button type="button" onClick={() => void signOut()} className="rounded-xl bg-[#176b52] px-5 py-3 text-sm font-semibold text-white">
            ออกจากระบบ
          </button>
        </div>
      );
    }
    return (
      <div>
        {errorMessage && <div role="alert" className="mx-auto mt-4 max-w-xl rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{errorMessage}</div>}
        <AuthPage onGuest={continueAsGuest} onAuthenticated={(user) => void loadAuthenticatedUser(user)} />
      </div>
    );
  }

  if (showOnboarding && healthProfile) {
    return (
      <div className="min-h-full bg-[#f4f5ee] p-4 sm:p-8 overflow-y-auto">
        {errorMessage && <div role="alert" className="mx-auto mb-4 max-w-3xl rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{errorMessage}</div>}
        <OnboardingModal
          initialProfile={healthProfile}
          initialName={displayName}
          onComplete={async (profile, name) => {
            let savedProfile = profile;
            if (!isGuest && account) {
              savedProfile = await saveProfile(profile);
            }
            const key = isGuest ? "guest" : account?.id;
            if (key && name.trim()) {
              localStorage.setItem(`nutrithai_display_name:${key}`, name.trim());
              setDisplayName(name.trim());
            }
            setHealthProfile(savedProfile);
            setShowOnboarding(false);
            setErrorMessage("");
          }}
        />
      </div>
    );
  }

  return (
    <div className="app-shell min-h-screen bg-[#f8f5ef] text-[#1a2820]">
      <a href="#main-content" className="sr-only fixed left-3 top-3 z-[80] rounded-lg bg-white px-4 py-2 text-sm font-semibold text-[#2d6e3e] focus:not-sr-only">ข้ามไปเนื้อหา</a>
      <Navbar
        page={page}
        onNavigate={setPage}
        username={displayName || account?.username || "ผู้เยี่ยมชม"}
        isGuest={isGuest}
        onEditProfile={() => setShowOnboarding(true)}
        onSignOut={() => void signOut()}
      />
      <div className="md:ml-[232px]">
        {isGuest ? (
          <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 bg-[#eae6dd] px-3 py-2 text-center text-xs text-[#596c5c] sm:text-sm">
            <span aria-hidden="true">♧</span>
            <span>โหมดผู้เยี่ยมชม · ข้อมูลจะหายเมื่อรีเฟรช</span>
            <button type="button" onClick={() => setShowAuthPage(true)} className="font-semibold text-[#2d6e3e] underline underline-offset-2">สร้างบัญชี</button>
          </div>
        ) : (
          <div className="flex justify-center bg-[#eae6dd] px-3 py-2 text-center text-xs text-[#596c5c]">
            NutriThai · บันทึกสุขภาพส่วนตัวของคุณ
          </div>
        )}
        <header className="sticky top-0 z-40 border-b border-[#e5e2da] bg-[#f8f5ef]/95 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3 px-4 py-3.5 sm:px-8">
            <div>
              <div className="text-sm font-semibold text-[#1a2820] sm:text-base">บันทึกสุขภาพประจำวัน</div>
              <div className="text-xs text-[#596c5c]">โภชนาการที่เข้าใจง่าย ในทุกมื้อของคุณ</div>
            </div>
          <div className="relative">
            <button type="button" aria-label="เมนูผู้ใช้" aria-expanded={showUserMenu} onClick={() => setShowUserMenu((open) => !open)} className="flex min-h-11 items-center gap-2 rounded-xl border border-[#e5e2da] bg-white px-3 text-sm shadow-sm hover:border-[#2d6e3e]">
              <span aria-hidden="true">♙</span><span className="max-w-28 truncate">{displayName || account?.username || "Guest"}</span>
            </button>
            {showUserMenu && (
              <div className="absolute right-0 top-14 z-50 w-60 rounded-xl border border-[#e5e2da] bg-white p-1.5 shadow-xl">
                {account && <div className="px-3 py-2 text-xs text-[#596c5c] truncate">{displayName || account.username}</div>}
                <button type="button" onClick={() => { setShowOnboarding(true); setShowUserMenu(false); }} className="w-full text-left px-3 py-2.5 rounded-lg text-sm text-[#1a2820] hover:bg-[#edf4ee]">แก้ไขโปรไฟล์</button>
                <button type="button" onClick={() => void signOut()} className="w-full text-left px-3 py-2.5 rounded-lg text-sm text-[#9d302b] hover:bg-[#fff1ef]">ออกจากระบบ</button>
              </div>
            )}
          </div>
          </div>
        </header>
      {errorMessage && <div role="alert" className="mx-auto mt-3 w-full max-w-[1160px] px-4 sm:px-8"><div className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{errorMessage}</div></div>}
      <main id="main-content" className="min-h-[calc(100vh-120px)] overflow-y-auto pb-24 md:pb-10">
        {page === "dashboard" && <Dashboard healthProfile={healthProfile!} logs={logs} onRemoveLog={(id) => void removeLog(id).catch((error) => setErrorMessage(error.message))} onNavigate={setPage} username={displayName || "คุณ"} />}
        {page === "history" && <History logs={logs} onRemoveLog={(id) => void removeLog(id).catch((error) => setErrorMessage(error.message))} onUpdateServings={updateLogServings} onUpdateLog={editLog} customFoods={customFoods} />}
        {page === "logger" && <FoodLogger customFoods={customFoods} onCreateCustomFood={addCustomFood} foods={foodCatalog} onAddLog={addLog} isAuthenticated={Boolean(account)} />}
        {page === "ai-scan" && <FoodLogger key="ai-scan" foods={foodCatalog} onAddLog={addLog} isAuthenticated={Boolean(account)} initialTab="scan" scanOnly />}
        {page === "advice" && <AdviceCard healthProfile={healthProfile!} logs={logs} foods={foodCatalog} />}
      </main>
      </div>
    </div>
  );
}
