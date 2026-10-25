import { RawText, useLocalizedView } from "./lib/i18n";
import { useEffect, useRef, useState } from "react";
import { FoodLog, HealthProfile, Page } from "./types";
import type { Food, FoodPreference, FoodPreferences, MealType, WeightLog } from "./types";
import { readPreferences, savePreference, readWeights, saveWeight, deleteWeight } from "./lib/personalization";
import { foodKey } from "./lib/recommendations";
import { createFoodLogBatch, copyMealLogs } from "./lib/foodLogs";
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
import Icon from "./components/Icon";
import OnboardingModal from "./components/OnboardingModal";
import PasswordRecovery from "./components/PasswordRecovery";
import SettingsPage from "./components/SettingsPage";
import { SettingsProvider } from "./lib/settings";
import { readGuest, saveGuest, deactivateGuest } from "./lib/guestStorage";

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

function AppContent() {
  const { view } = useLocalizedView();
  const dataVersion = useRef(0);
  const [preferences, setPreferences] = useState<FoodPreferences>({});
  const [weights, setWeights] = useState<WeightLog[]>([]);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [weightsReady, setWeightsReady] = useState(false);
  const [extrasError, setExtrasError] = useState("");
  const [healthProfile, setHealthProfile] = useState<HealthProfile | null>(null);
  const [logs, setLogs] = useState<FoodLog[]>([]);
  const [foodCatalog, setFoodCatalog] = useState<Food[]>([]);
  const [customFoods, setCustomFoods] = useState<Food[]>([]);
  const [page, setPage] = useState<Page>("dashboard");
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [showAuthPage, setShowAuthPage] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [accountLoading, setAccountLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [displayName, setDisplayName] = useState("");

  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [guestOnboarded, setGuestOnboarded] = useState(false);
  const catalogRequest = useRef<number | null>(null);

  const loadCatalog = async (version = dataVersion.current) => {
    if (catalogRequest.current === version) return;
    catalogRequest.current = version;
    setCatalogLoading(true);
    try {
      const catalog = await readFoods();
      if (version === dataVersion.current) { setFoodCatalog(catalog); setCatalogError(false); }
    } catch {
      if (version === dataVersion.current) setCatalogError(true);
    } finally { if (catalogRequest.current === version) { catalogRequest.current = null; setCatalogLoading(false); } }
  };

  useEffect(() => {
    if (!isGuest || !healthProfile || !authReady) return;
    setStorageError(!saveGuest({ version: 1, active: true, onboarded: guestOnboarded,
      profile: healthProfile, logs, customFoods, preferences, weights }));
  }, [isGuest, healthProfile, authReady, guestOnboarded, logs, customFoods, preferences, weights]);

  const catalogNotice = (catalogError || catalogLoading) && <div className="service-notice" role={catalogLoading ? "status" : "alert"}>
    <div><strong>{catalogLoading ? "กำลังโหลดรายการอาหาร…" : "ระบบข้อมูลอาหารไม่พร้อมใช้งานชั่วคราว"}</strong>
    {!catalogLoading && <p>ยังดูประวัติ ใช้รายการเดิม และเพิ่มอาหารของฉันได้ ลองเชื่อมต่อใหม่อีกครั้ง</p>}</div>
    <button type="button" disabled={catalogLoading} onClick={() => void loadCatalog()}>ลองอีกครั้ง</button>
  </div>;

  const loadExtras = async (version: number) => {
    const [prefs, weightRows] = await Promise.allSettled([readPreferences(), readWeights()]);
    if (version !== dataVersion.current) return;
    setPreferencesReady(prefs.status === "fulfilled"); setWeightsReady(weightRows.status === "fulfilled");
    if (prefs.status === "fulfilled") setPreferences(prefs.value);
    if (weightRows.status === "fulfilled") setWeights(weightRows.value);
    setExtrasError(prefs.status === "rejected" || weightRows.status === "rejected" ? "โหลดความชอบหรือน้ำหนักไม่สำเร็จ ลองโหลดข้อมูลใหม่" : "");
  };

  const loadAuthenticatedUser = async (user: ApiUser) => {
    setEditingProfile(false);
    const version = ++dataVersion.current;
    setPreferences({}); setWeights([]); setPreferencesReady(false); setWeightsReady(false); setExtrasError("");
    setAccount(user);
    try { setDisplayName(localStorage.getItem(`nutrithai_display_name:${user.id}`) || user.username); }
    catch { setDisplayName(user.username); }
    setIsGuest(false);
    deactivateGuest();
    setPage("dashboard");
    setAccountLoading(true);
    setErrorMessage("");
    try {
      const [profile, savedLogs, personalFoods] = await Promise.all([
        readProfile(),
        readFoodLogs(),
        readCustomFoods(),
      ]);
      if (version !== dataVersion.current) return;
      setHealthProfile(profile ?? guestProfile);
      setLogs(savedLogs);
      setCustomFoods(personalFoods);
      void loadCatalog(version);
      setShowOnboarding(!profile);
      await loadExtras(version);
    } catch (error) {
      if (version !== dataVersion.current) return;
      setErrorMessage(`โหลดข้อมูลบัญชีไม่สำเร็จ: ${error instanceof Error ? error.message : "เกิดข้อผิดพลาด"}`);
      setHealthProfile(null);
    } finally {
      if (version === dataVersion.current) { setAccountLoading(false); setAuthReady(true); }
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
      const savedGuest = readGuest();
      if (savedGuest?.active && !authCallbackType) {
        if (active) { void continueAsGuest(savedGuest.profile); setAuthReady(true); }
        return;
      }
      try {
        const user = await apiJson<ApiUser>("/api/v1/auth/session");
        if (active) await loadAuthenticatedUser(user);
      } catch (error) {
        if (!active) return;
        if (error instanceof Error && !error.message.includes("กรุณาเข้าสู่ระบบ")) {
          setErrorMessage("ตรวจสอบการเข้าสู่ระบบไม่ได้ชั่วคราว ลองอีกครั้งหรือใช้โหมดผู้เยี่ยมชมก่อนได้");
        }
        setAuthReady(true);
      }
    };
    void restoreSession();
    return () => { active = false; };
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

  const mergeSavedLogs = (saved: FoodLog[]) => setLogs(previous => {
    const merged = new Map(previous.map(log => [log.id, log]));
    saved.forEach(log => merged.set(log.id, log)); return [...merged.values()];
  });
  const addBatch = async (items: FoodLog[], requestId: string) => {
    if (!isGuest && !account) throw new Error("กรุณาเข้าสู่ระบบ");
    const version = dataVersion.current;
    const saved = isGuest ? items.map((log, i) => ({ ...log, id: `${requestId}-${i}` })) : await createFoodLogBatch(items, requestId);
    if (version === dataVersion.current) mergeSavedLogs(saved);
  };
  const copyMeal = async (ids: string[], date: string, meal: MealType, requestId: string) => {
    if (!isGuest && !account) throw new Error("กรุณาเข้าสู่ระบบ");
    const version = dataVersion.current;
    const saved = isGuest ? ids.map((id, i) => {
      const old = logs.find(log => log.id === id); if (!old) throw new Error("ไม่พบรายการต้นฉบับ");
      return { ...old, id: `${requestId}-${i}`, mealType: meal, loggedAt: new Date(`${date}T12:00:00`) };
    }) : await copyMealLogs(ids, date, meal, requestId);
    if (version === dataVersion.current) mergeSavedLogs(saved);
  };
  const changePreference = async (food: Food, value: FoodPreference | null) => {
    if (!isGuest && !account) throw new Error("กรุณาเข้าสู่ระบบ");
    const key = foodKey(food); if (!key) return;
    const version = dataVersion.current;
    if (!isGuest) await savePreference(food, value);
    if (version === dataVersion.current) setPreferences(previous => { const next = { ...previous }; if (value) next[key] = value; else delete next[key]; return next; });
  };
  const recordWeight = async (weight: WeightLog) => {
    if (!isGuest && !account) throw new Error("กรุณาเข้าสู่ระบบ");
    const version = dataVersion.current;
    const saved = isGuest ? weight : await saveWeight(weight);
    if (version === dataVersion.current) setWeights(previous => [...previous.filter(row => row.measuredOn !== saved.measuredOn), saved]);
  };
  const removeWeight = async (date: string) => {
    if (!isGuest && !account) throw new Error("กรุณาเข้าสู่ระบบ");
    const version = dataVersion.current;
    if (!isGuest) await deleteWeight(date);
    if (version === dataVersion.current) setWeights(previous => previous.filter(row => row.measuredOn !== date));
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
    const version = ++dataVersion.current;
    const saved = readGuest();
    setPreferences(saved?.preferences ?? {}); setWeights(saved?.weights ?? []);
    setPreferencesReady(true); setWeightsReady(true); setExtrasError("");
    setErrorMessage(""); setShowAuthPage(false); setAccount(null); setIsGuest(true);
    setHealthProfile(saved?.profile ?? profile);
    try { setDisplayName(localStorage.getItem("nutrithai_display_name:guest") || "ผู้เยี่ยมชม"); }
    catch { setDisplayName("ผู้เยี่ยมชม"); }
    setLogs(saved?.logs ?? []); setCustomFoods(saved?.customFoods ?? []);
    setGuestOnboarded(saved?.onboarded ?? false);
    setShowOnboarding(!saved?.onboarded); setPage("dashboard");
    void loadCatalog(version);
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
    if (isGuest) deactivateGuest();
    ++dataVersion.current;
    setPreferences({}); setWeights([]); setPreferencesReady(false); setWeightsReady(false); setExtrasError("");
    setAccount(null);
    setIsGuest(false);
    setDisplayName("");
    setHealthProfile(null);
    setLogs([]);
    setFoodCatalog([]);
    setCustomFoods([]);
    setShowOnboarding(false);
    setShowUserMenu(false);
    setCatalogError(false); setStorageError(false);
  };

  if (!authReady || accountLoading) {
    return view(<div className="app-loading" role="status"><Icon name="leaf" /><strong>NutriThai</strong><p>กำลังโหลดข้อมูลบัญชี...</p></div>);
  }

  if (isPasswordRecovery) {
    return view(<PasswordRecovery onComplete={() => setIsPasswordRecovery(false)} />);
  }

  if (showAuthPage) {
    return view((
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
    ));
  }

  if (!healthProfile && !isGuest) {
    if (account) {
      return view((
        <div className="app-account-error min-h-screen flex flex-col items-center justify-center gap-4 p-4 text-center">
          <Icon name="user" />
          <div role="alert" className="max-w-lg rounded-xl bg-rose-50 p-4 text-sm text-rose-800">
            {errorMessage || "ไม่สามารถโหลดข้อมูลบัญชีได้"}
          </div>
          <button type="button" onClick={() => void loadAuthenticatedUser(account)} className="rounded-xl border px-5 py-3">ลองอีกครั้ง</button>
          <button type="button" onClick={() => void signOut()} className="rounded-xl bg-[#176b52] px-5 py-3 text-sm font-semibold text-white">
            ออกจากระบบ
          </button>
        </div>
      ));
    }
    return view((
      <div>
        {errorMessage && <div role="alert" className="mx-auto mt-4 max-w-xl rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{errorMessage}</div>}
        <AuthPage onGuest={continueAsGuest} onAuthenticated={(user) => void loadAuthenticatedUser(user)} />
      </div>
    ));
  }

  if (showOnboarding && healthProfile) {
    return view((
      <div>
        {errorMessage && <div role="alert" className="mx-auto mb-4 max-w-3xl rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{errorMessage}</div>}
        {catalogNotice}
        <OnboardingModal
          editing={editingProfile}
          isGuest={isGuest}
          onCancel={editingProfile ? () => { setShowOnboarding(false); setEditingProfile(false); setErrorMessage(""); } : undefined}
          initialProfile={healthProfile}
          initialName={displayName}
          onComplete={async (profile, name) => {
            let savedProfile = profile;
            if (!isGuest && account) {
              savedProfile = await saveProfile(profile);
            }
            const key = isGuest ? "guest" : account?.id;
            if (key && name.trim()) {
              try { localStorage.setItem(`nutrithai_display_name:${key}`, name.trim()); } catch { setStorageError(true); }
              setDisplayName(name.trim());
            }
            setHealthProfile(savedProfile);
            if (isGuest) setGuestOnboarded(true);
            setShowOnboarding(false);
            setEditingProfile(false);
            setErrorMessage("");
          }}
        />
      </div>
    ));
  }

  return view((
    <div className="app-shell min-h-screen">
      <a href="#main-content" className="sr-only fixed left-3 top-3 z-[80] rounded-lg bg-white px-4 py-2 text-sm font-semibold text-[#2d6e3e] focus:not-sr-only">ข้ามไปเนื้อหา</a>
      <Navbar
        page={page}
        onNavigate={setPage}
        username={displayName || account?.username || "ผู้เยี่ยมชม"}
        isGuest={isGuest}
        onEditProfile={() => { setEditingProfile(true); setShowOnboarding(true); }}
        onSignOut={() => void signOut()}
      />
      <div className="app-content">
        {isGuest ? (
          <div className="app-status flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
            <span aria-hidden="true">♧</span>
            <span>โหมดผู้เยี่ยมชม · เก็บข้อมูลในเบราว์เซอร์เครื่องนี้</span>
            <button type="button" onClick={() => setShowAuthPage(true)} className="font-semibold text-[#2d6e3e] underline underline-offset-2">สร้างบัญชี</button>
          </div>
        ) : (
          <div className="app-status">
            NutriThai · บันทึกสุขภาพส่วนตัวของคุณ
          </div>
        )}
        <header className="app-header">
          <div className="app-header-inner">
            <div className="header-tagline">NutriThai<span>โภชนาการที่เข้าใจง่าย ในทุกมื้อของคุณ</span></div>
          <div className="header-actions">
            <button type="button" className="header-search" aria-label="ค้นหาอาหาร" onClick={() => setPage("logger")}><Icon name="search" /><span>ค้นหาอาหาร...</span></button>
          <div className="relative">
            <button type="button" aria-label="เมนูผู้ใช้" aria-expanded={showUserMenu} onClick={() => setShowUserMenu((open) => !open)} className="user-menu-trigger">
              <span aria-hidden="true" className="user-avatar"><RawText>{(displayName || account?.username || "G").slice(0, 1)}</RawText></span><span className="max-w-28 truncate"><RawText>{displayName || account?.username || "Guest"}</RawText></span>
            </button>
            {showUserMenu && (
              <div className="profile-user-dropdown">
                <div className="profile-dropdown-identity"><span className="user-avatar"><RawText>{(displayName || account?.username || "G").slice(0, 1)}</RawText></span><div><strong><RawText>{displayName || account?.username || "ผู้เยี่ยมชม"}</RawText></strong><small>{isGuest ? "โหมดผู้เยี่ยมชม" : "บัญชี NutriThai"}</small></div></div>
                <button type="button" onClick={() => { setEditingProfile(true); setShowOnboarding(true); setShowUserMenu(false); }}><Icon name="user" />แก้ไขโปรไฟล์<Icon name="arrow" /></button>
                <button type="button" onClick={() => { setPage("theme"); setShowUserMenu(false); }}><Icon name="sun" />ธีม<Icon name="arrow" /></button>
                <button type="button" onClick={() => { setPage("language"); setShowUserMenu(false); }}><Icon name="language" />ภาษา<Icon name="arrow" /></button>
                <button type="button" onClick={() => { setPage("settings"); setShowUserMenu(false); }}><Icon name="settings" />ตั้งค่า<Icon name="arrow" /></button>
                <button type="button" className="profile-dropdown-signout" onClick={() => void signOut()}><Icon name="logout" />ออกจากระบบ</button>
              </div>
            )}
          </div>
          </div>
          </div>
        </header>
      {errorMessage && <div role="alert" className="mx-auto mt-3 w-full max-w-[1160px] px-4 sm:px-8"><div className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{errorMessage}</div></div>}
      <main id="main-content" className="app-main">
        {(page === "theme" || page === "language" || page === "settings") && <SettingsPage section={page === "settings" ? "general" : page} />}
        {catalogNotice}
        {isGuest && <p className="guest-storage-note">ข้อมูลอยู่เฉพาะเบราว์เซอร์นี้ ไม่ซิงก์ข้ามเครื่อง และอาจหายหากล้างข้อมูลเว็บไซต์หรือใช้โหมดไม่ระบุตัวตน การสร้างบัญชียังไม่ย้ายข้อมูลเดิมให้อัตโนมัติ</p>}
        {storageError && <div role="alert" className="service-notice">บันทึกลงเครื่องไม่ได้ ข้อมูลรอบนี้อาจหายเมื่อปิดหน้า กรุณาตรวจพื้นที่ว่างหรือการอนุญาตเก็บข้อมูลของเบราว์เซอร์</div>}
        {extrasError && <div role="alert" className="mx-auto max-w-[1160px] px-4 py-3 text-sm text-amber-800">{extrasError} <button type="button" className="underline" onClick={() => void loadExtras(dataVersion.current)}>โหลดข้อมูลใหม่</button></div>}
        {page === "dashboard" && <Dashboard healthProfile={healthProfile!} logs={logs} onRemoveLog={(id) => void removeLog(id).catch((error) => setErrorMessage(error.message))} onNavigate={setPage} username={displayName || "คุณ"} />}
        {page === "history" && <History logs={logs} onCopyMeal={copyMeal} onRemoveLog={(id) => void removeLog(id).catch((error) => setErrorMessage(error.message))} onUpdateServings={updateLogServings} onUpdateLog={editLog} customFoods={customFoods} />}
        {page === "logger" && <FoodLogger key={account?.id ?? "guest"} preferences={preferences} recommendationsReady={preferencesReady} onPreference={preferencesReady ? changePreference : undefined} onAddBatch={addBatch} logs={logs} healthProfile={healthProfile!} customFoods={customFoods} onCreateCustomFood={addCustomFood} foods={foodCatalog} onAddLog={addLog} isAuthenticated={Boolean(account)} />}
        {page === "ai-scan" && <FoodLogger key="ai-scan" foods={foodCatalog} onAddLog={addLog} onAddBatch={addBatch} isAuthenticated={Boolean(account)} initialTab="scan" scanOnly />}
        {page === "advice" && <AdviceCard healthProfile={healthProfile!} logs={logs} foods={foodCatalog} weights={weights} onSaveWeight={weightsReady ? recordWeight : undefined} onDeleteWeight={weightsReady ? removeWeight : undefined} preferences={preferences} recommendationsReady={preferencesReady} />}
      </main>
      </div>
    </div>
  ));
}

export default function App() {
  return <SettingsProvider><AppContent /></SettingsProvider>;
}
