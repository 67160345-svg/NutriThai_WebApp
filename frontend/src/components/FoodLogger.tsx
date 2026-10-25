import { RawText, useLocalizedView } from "../lib/i18n";
import { displayInteger } from "../lib/display";
import { useState, useEffect, useRef } from "react";
import { Food, FoodLog, MealType, FoodUnit, HealthProfile, FoodPreferences, FoodPreference, MealItem } from "../types";
import FoodRecommendations from "./FoodRecommendations";
import Icon from "./Icon";
import PageHeading from "./PageHeading";
import FoodPreferenceButtons from "./FoodPreferenceButtons";
import MealComposer from "./MealComposer";
import { foodKey } from "../lib/recommendations";
import { apiFetch } from "../lib/api";
import { localDateKey, readFoods } from "../lib/foodLogs";

import QuantityInput from "./QuantityInput";
import CustomFoodForm from "./CustomFoodForm";
import { basisLabel, toServings, validServings } from "../lib/portions";

interface Props {
  recommendationsReady?: boolean;
  preferences?: FoodPreferences;
  onPreference?: (food: Food, value: FoodPreference | null) => Promise<void>;
  onAddBatch?: (logs: FoodLog[], requestId: string) => Promise<void>;
  logs?: FoodLog[];
  healthProfile?: HealthProfile;
  customFoods?: Food[];
  onCreateCustomFood?: (food: Food) => Promise<Food>;
  foods: Food[];
  onAddLog: (log: FoodLog) => Promise<void>;
  isAuthenticated: boolean;
  initialTab?: "search" | "scan";
  scanOnly?: boolean;
}

const mealOptions: { value: MealType; label: string; icon: string }[] = [
  { value: "breakfast", label: "เช้า", icon: "🌅" },
  { value: "lunch", label: "กลางวัน", icon: "☀️" },
  { value: "dinner", label: "เย็น", icon: "🌙" },
  { value: "snack", label: "ของว่าง", icon: "🍎" },
];
const emptyFoods: Food[] = [];
const emptyLogs: FoodLog[] = [];

interface ScanResult {
  food: Food;
  confidence: number;
  suggestion: string;
}

function MacroPills({ food }: { food: Food }) {
  const { view } = useLocalizedView();
  return view((
    <div className="flex gap-1.5 mt-1 flex-wrap">
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400">{displayInteger(food.protein)}g โปรตีน</span>
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400">{displayInteger(food.carbs)}g คาร์บ</span>
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-400">{displayInteger(food.fat)}g ไขมัน</span>
    </div>
  ));
}

export default function FoodLogger({ onAddLog, isAuthenticated, foods, initialTab = "search", scanOnly = false, customFoods = emptyFoods, onCreateCustomFood, logs = emptyLogs, healthProfile, preferences = {}, onPreference, onAddBatch, recommendationsReady = true }: Props) {
  const { view, locale, language } = useLocalizedView();
  const [draft, setDraft] = useState<MealItem[]>([]);
  const [batchLocked, setBatchLocked] = useState(false);
  const [tab, setTab] = useState<"search" | "scan" | "custom">(initialTab);
  const [query, setQuery] = useState("");
  const [selectedFood, setSelectedFood] = useState<Food | null>(null);
  const [mealType, setMealType] = useState<MealType>("lunch");
  const [quantity, setQuantity] = useState("1");
  const [quantityUnit, setQuantityUnit] = useState<FoodUnit>("portion");
  const servings = selectedFood ? toServings(selectedFood, Number(quantity), quantityUnit) : 1;
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [added, setAdded] = useState(false);
  const [logDate, setLogDate] = useState(() => localDateKey(new Date()));
  const [scanError, setScanError] = useState("");
  const [scanPreview, setScanPreview] = useState("");
  const [isEditingScan, setIsEditingScan] = useState(false);
  const [editedScan, setEditedScan] = useState({ name: "", calories: "", protein: "", carbs: "", fat: "" });
  const [category, setCategory] = useState<"all" | Food["category"]>("all");
  const [saveError, setSaveError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [consentToAnalyze, setConsentToAnalyze] = useState(false);
  const [searchResults, setSearchResults] = useState<Food[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchAttempt, setSearchAttempt] = useState(0);
  const saving = useRef(false);
  const pendingSave = useRef<{ log: FoodLog; requestId: string } | null>(null);
  const [savePending, setSavePending] = useState(false);
  const localFoods = Array.from(new Map([...foods, ...customFoods, ...logs.map(log => log.food)]
    .map(food => [foodKey(food) ?? `${food.name}:${language === "en" ? food.name : food.nameTh}`, food])).values());
  const recentFoods = Array.from(new Map([...logs].sort((a, b) => +new Date(b.loggedAt) - +new Date(a.loggedAt))
    .map(log => [foodKey(log.food) ?? log.food.nameTh, log.food])).values()).slice(0, 6);
  const counts = new Map<string, { food: Food; count: number }>();
  logs.forEach(log => { const key = foodKey(log.food) ?? log.food.nameTh;
    counts.set(key, { food: log.food, count: (counts.get(key)?.count ?? 0) + 1 }); });
  const frequentFoods = [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 6);
  const previousLog = [...logs].filter(log => localDateKey(new Date(log.loggedAt)) < logDate)
    .sort((a, b) => +new Date(b.loggedAt) - +new Date(a.loggedAt))[0];
  const previousMeal = previousLog ? logs.filter(log => log.mealType === previousLog.mealType
    && localDateKey(new Date(log.loggedAt)) === localDateKey(new Date(previousLog.loggedAt))) : [];

  useEffect(() => () => {
    if (scanPreview) URL.revokeObjectURL(scanPreview);
  }, [scanPreview]);

  useEffect(() => {
    const search = query.trim();
    if (tab !== "search" || !search) {
      setSearchResults([]);
      setSearchError("");
      setIsSearching(false);
      return;
    }

    let active = true;
    setIsSearching(true);
    setSearchError("");
    const timer = window.setTimeout(() => {
      void readFoods({ search, category, limit: 8 })
        .then((results) => {
          if (active) setSearchResults(results);
        })
        .catch(() => {
          if (active) {
            const normalized = search.toLocaleLowerCase();
            setSearchResults(localFoods.filter(food => (category === "all" || food.category === category)
              && `${language === "en" ? food.name : food.nameTh} ${food.name}`.toLocaleLowerCase().includes(normalized)).slice(0, 8));
            setSearchError("ค้นหาออนไลน์ไม่ได้ กำลังแสดงรายการที่มีในเครื่อง คุณยังเพิ่มอาหารของฉันได้");
          }
        })
        .finally(() => {
          if (active) setIsSearching(false);
        });
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [category, query, tab, searchAttempt, foods, customFoods, logs]);

  const results = query.trim() && tab === "search" ? searchResults : [];

  const handleSelect = (food: Food, suggestedServings = 1) => {
    if (savePending || saving.current) return;
    setSelectedFood(food);
    setQuantity(String(Number(((food.servingSize ?? 1) * suggestedServings).toFixed(6))));
    setQuantityUnit(food.servingUnit ?? "portion");
    setSaveError("");
    setAdded(false);
  };

  const handleScan = async (file: File) => {
    if (!isAuthenticated) {
      setScanError("การวิเคราะห์รูปต้องเข้าสู่ระบบก่อน");
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setScanError("เลือกรูป JPEG, PNG หรือ WebP ขนาดไม่เกิน 5 MB");
      return;
    }
    setIsScanning(true);
    setScanResult(null);
    setSelectedFood(null);
    setScanError("");
    setScanPreview(URL.createObjectURL(file));
    setAdded(false);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await apiFetch("/api/v1/foods/scan-image", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "วิเคราะห์รูปอาหารไม่สำเร็จ");
      const item = data.detected_item;
      const food: Food = {
        id: item.food_id ?? 0,
        name: item.name,
        nameTh: item.name,
        category: "food", source: "ai",
        servingSize: 1, servingUnit: "portion", servingLabel: "จาน/หน่วยที่เห็นในภาพ",
        calories: item.calories,
        protein: item.protein,
        carbs: item.carbs,
        fat: item.fat,
        sugar: 0,
        fiber: 0,
      };
      setScanResult({ food, confidence: data.confidence ?? 0, suggestion: data.ai_advice });
      handleSelect(food);
      setEditedScan({
        name: food.nameTh,
        calories: String(food.calories),
        protein: String(food.protein),
        carbs: String(food.carbs),
        fat: String(food.fat),
      });
    } catch (error) {
      setScanError(error instanceof Error ? error.message : "วิเคราะห์รูปอาหารไม่สำเร็จ");
    } finally {
      setIsScanning(false);
    }
  };

  const handleAdd = async () => {
    if (saving.current) return;
    const servingCount = Number(servings);
    if (!selectedFood || !validServings(servingCount)) {
      setSaveError("จำนวน serving ต้องมากกว่า 0 และไม่เกิน 100");
      return;
    }
    saving.current = true;
    setIsSaving(true);
    setSaveError("");
    try {
      const requestId = pendingSave.current?.requestId ?? crypto.randomUUID();
      const log = pendingSave.current?.log ?? {
        id: requestId,
        food: selectedFood,
        mealType,
        servings: servingCount,
        quantity: Number(quantity), quantityUnit,
        loggedAt: new Date(`${logDate}T12:00:00`),
      };
      if (onAddBatch) {
        pendingSave.current = { log, requestId }; setSavePending(true);
        await onAddBatch([log], requestId);
      } else await onAddLog(log);
      pendingSave.current = null; setSavePending(false);
      setAdded(true);
      setSelectedFood(null);
      setScanResult(null);
      setScanPreview("");
      setIsEditingScan(false);
      setQuery("");
      setQuantity("1");
      setLogDate(localDateKey(new Date()));
      setTimeout(() => setAdded(false), 2000);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "บันทึกอาหารไม่สำเร็จ");
      if (error && typeof error === "object" && "status" in error && [400, 401, 403, 404, 422].includes(Number(error.status))) {
        pendingSave.current = null; setSavePending(false);
      }
    } finally {
      saving.current = false;
      setIsSaving(false);
    }
  };

  return view((
    <div className={scanOnly ? "soft-page ai-page" : "food-logger"}>
      {!scanOnly && draft.length > 0 && onAddBatch && <MealComposer items={draft} onChange={setDraft} onSave={onAddBatch} initialDate={logDate} initialMeal={mealType} onLockChange={setBatchLocked} onDone={() => { setDraft([]); setBatchLocked(false); setAdded(true); }} />}
      <fieldset disabled={batchLocked || isSaving} aria-busy={isSaving} className="min-w-0 disabled:opacity-50">
      {saveError && !selectedFood && <p role="alert" className="text-sm text-rose-700">{saveError}</p>}
      {/* Header */}
      {scanOnly ? (
        <><PageHeading eyebrow="A LITTLE HELP FROM AI" title="สแกนอาหารด้วย AI" description="เริ่มจากภาพมื้ออร่อย แล้วตรวจข้อมูลก่อนบันทึก" />
          <section className="ai-intro"><div><span className="ai-camera-icon"><Icon name="camera" /></span><h2>ถ่ายหนึ่งภาพ<br />รู้จักมื้อนี้มากขึ้น</h2><p>ช่วยประมาณชื่ออาหารและสารอาหาร<br />คุณเป็นคนตรวจ ปรับ และเลือกบันทึก</p></div><ol>{[{ title: "ยินยอม", text: "เลือกว่าจะส่งรูปไปวิเคราะห์หรือไม่" }, { title: "เลือกรูป", text: "JPEG, PNG หรือ WebP ไม่เกิน 5 MB" }, { title: "ตรวจและบันทึก", text: "ปรับชื่อ ปริมาณ และโภชนาการได้" }].map((item, index) => <li key={item.title}><span>0{index + 1}</span><div><strong>{item.title}</strong><p>{item.text}</p></div></li>)}</ol></section>
        </>
      ) : (
        <div className="logger-heading">
          <div><p className="eyebrow">A LITTLE BETTER, EVERY MEAL</p><h1>เพิ่มอาหาร <Icon name="leaf" /></h1><p>เลือกมื้อที่ใช่ บันทึกง่าย ในแบบของคุณ</p></div>
          <label htmlFor="log-date" className="logger-date"><Icon name="clock" /><span>วันที่รับประทาน</span>
          <input
            id="log-date"
            disabled={savePending}
            type="date"
            value={logDate}
            max={localDateKey(new Date())}
            onChange={(e) => setLogDate(e.target.value)}
            className="max-w-44 rounded-xl border border-[#e5e2da] bg-white px-3 py-2.5 text-sm text-[#1a2820]"
          />
          </label>
        </div>
      )}

      {/* Tabs */}
      {!scanOnly && <div className="logger-tabs" aria-label="วิธีเพิ่มอาหาร">
        {(["search", "scan", "custom"] as const).map((t) => (
          <button
            key={t}
            type="button"
            disabled={isScanning || savePending}
            aria-pressed={tab === t}
            onClick={() => {
              setTab(t);
              setSelectedFood(null);
              setScanResult(null);
              setQuery("");
              setConsentToAnalyze(false);
              setScanError("");
              setScanPreview("");
            }}
            className={tab === t ? "is-active" : ""}
          >
            <Icon name={t === "search" ? "search" : t === "scan" ? "camera" : "bowl"} />{t === "search" ? "ค้นหาอาหาร" : t === "scan" ? "สแกนรูป" : "อาหารของฉัน"}
          </button>
        ))}
      </div>}

      {tab === "search" && (
        <div className="logger-categories" aria-label="หมวดอาหาร">
          {([
            ["all", "ทั้งหมด"],
            ["food", "อาหาร"],
            ["dessert", "ของหวาน"],
            ["drink", "เครื่องดื่ม"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setCategory(value)}
              aria-pressed={category === value}
              className={category === value ? "is-active" : ""}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {tab === "search" && foods.length === 0 && <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-800">รายการอาหารยังไม่พร้อม คุณเลือกอาหารที่เคยบันทึก หรือเพิ่มเองในแท็บ “อาหารของฉัน” ได้</div>}

      {/* Search Tab */}
      {tab === "search" && (
        <div className="logger-search-content space-y-3">
          <div className="logger-search-box">
            <Icon name="search" />
            <label htmlFor="food-search" className="sr-only">ค้นหาอาหารภาษาไทยหรืออังกฤษ</label>
            <input
              id="food-search"
              disabled={savePending}
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setSelectedFood(null); }}
              placeholder="ค้นหาอาหาร เช่น ข้าวผัด, Tom Yum..."
              enterKeyHint="search"
              className="w-full rounded-full border border-[#e5e2da] bg-white py-3 pl-4 pr-10 text-sm text-[#1a2820] placeholder:text-[#8b968b] shadow-sm focus:border-[#2d6e3e] focus:outline-none"
            />
            {query && (
              <button
                type="button"
                aria-label="ล้างคำค้นหา"
                disabled={savePending}
                onClick={() => { setQuery(""); setSelectedFood(null); }}
                className="logger-clear-search"
              >
                ✕
              </button>
            )}
          </div>

          {isSearching && <div role="status" className="py-3 text-center text-sm text-[#718078]">กำลังค้นหาในฐานข้อมูล...</div>}
          {searchError && <div role="alert" className="service-notice"><span>{searchError}</span><button type="button" disabled={isSearching || savePending} onClick={() => setSearchAttempt(value => value + 1)}>ลองอีกครั้ง</button></div>}

          {results.length > 0 && !selectedFood && !isSearching && (
            <div className="logger-results space-y-2" aria-label="ผลการค้นหาอาหาร">
              {results.map((food) => (
                <button
                  key={food.id}
                  onClick={() => handleSelect(food)}
                  className="flex w-full items-center justify-between gap-3 rounded-[18px] border border-[#e5e2da] bg-white px-4 py-3.5 text-left shadow-sm transition-colors hover:border-[#b7cdb9]"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#f3f0ea] text-xl"><Icon name={food.category === "drink" ? "drop" : food.category === "dessert" ? "grain" : "bowl"} /></span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-[#1a2820]"><RawText>{language === "en" ? food.name : (food.nameTh || food.name)}</RawText></div>
                      {food.nameTh && food.nameTh !== food.name && <div className="truncate text-xs text-[#718078]"><RawText>{food.name}</RawText></div>}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-extrabold text-[#2d6e3e]">{displayInteger(food.calories)}</div>
                    <div className="text-[10px] text-[#718078]">kcal / {basisLabel(food)}</div>
                  </div>
                  <span aria-hidden="true" className="text-lg text-[#718078]">›</span>
                </button>
              ))}
            </div>
          )}

          {query.trim() && !isSearching && !searchError && results.length === 0 && (
            <div className="rounded-2xl border border-dashed border-[#d8d7ce] bg-white p-8 text-center text-sm text-[#718078]">ไม่พบเมนู “{query}”</div>
          )}

          {!query.trim() && !selectedFood && (
            <section className="logger-shortcuts" aria-label="ทางลัดบันทึกอาหาร">
              <h2>บันทึกได้เร็วขึ้น</h2>
              {recentFoods.length === 0 ? <p>เมื่อบันทึกอาหาร รายการล่าสุดและอาหารที่กินบ่อยจะปรากฏที่นี่</p> : <>
                <h3>รายการล่าสุด</h3><div className="shortcut-foods">{recentFoods.map((food, i) => <button key={i} type="button" onClick={() => handleSelect(food)}><RawText>{food.nameTh || food.name}</RawText><small>{basisLabel(food)} · {displayInteger(food.calories)} kcal</small></button>)}</div>
                <h3>อาหารที่กินบ่อย</h3><div className="shortcut-foods">{frequentFoods.map(({ food, count }, i) => <button key={i} type="button" onClick={() => handleSelect(food)}><RawText>{food.nameTh || food.name}</RawText><small>บันทึก {count} ครั้ง · {basisLabel(food)}</small></button>)}</div>
              </>}
              {onAddBatch && previousLog && previousMeal.length > 0 && <button className="repeat-meal" type="button" disabled={draft.length + previousMeal.length > 30} onClick={() => { setMealType(previousLog.mealType); setDraft([...draft, ...previousMeal.map(log => ({ food: log.food, servings: log.servings }))]); }}>
                ใช้มื้อเดิมจาก {new Date(previousLog.loggedAt).toLocaleDateString(locale, { day: "numeric", month: "short" })} · {mealOptions.find(meal => meal.value === previousLog.mealType)?.label} ({previousMeal.length} รายการ)
                <small>ตรวจปริมาณ วันที่ และมื้อ ก่อนบันทึก</small>
              </button>}
            </section>
          )}
          {!query.trim() && !selectedFood && (
            <div className="logger-discovery">
            <div className="logger-recommendations">
            {!recommendationsReady && <p className="text-sm text-amber-800">ยังโหลดความชอบไม่ได้ จึงพักคำแนะนำไว้ก่อน</p>}
            {healthProfile && recommendationsReady && <FoodRecommendations foods={foods} customFoods={customFoods} logs={logs} profile={healthProfile} date={logDate} meal={mealType} category={category} onMealChange={setMealType} onSelect={handleSelect} preferences={preferences} onPreference={onPreference} onPlan={onAddBatch ? items => { if (draft.length + items.length > 30) { setSaveError("เลือกได้ไม่เกิน 30 รายการต่อชุด"); return; } setDraft([...draft, ...items]); } : undefined} />}
            {onPreference && Object.keys(preferences).length > 0 && <details className="rounded-xl border bg-white p-3">
              <summary className="cursor-pointer text-sm">จัดการความชอบและอาหารที่ซ่อน</summary>
              {[...foods, ...customFoods].filter(food => preferences[foodKey(food) ?? ""]).map(food => <div key={foodKey(food)} className="mt-3"><p className="mb-1 text-sm"><RawText>{language === "en" ? food.name : food.nameTh}</RawText></p><FoodPreferenceButtons food={food} value={preferences[foodKey(food)!]} onChange={onPreference} /></div>)}
            </details>}
            </div>
            <section className="logger-catalog" aria-label="รายการอาหาร">
            <div className="logger-section-heading"><div><p className="eyebrow">EXPLORE YOUR NEXT MEAL</p><h2>รายการอาหาร</h2></div><span><Icon name="bowl" /> เลือกเพื่อบันทึก</span></div>
            <div className="logger-results space-y-2">
              {foods.filter((food) => category === "all" || food.category === category).slice(0, 15).map((food) => (
                <button
                  key={food.id}
                  onClick={() => handleSelect(food)}
                  className="flex w-full items-center justify-between gap-3 rounded-[18px] border border-[#e5e2da] bg-white px-4 py-3.5 text-left shadow-sm transition-colors hover:border-[#b7cdb9]"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#f3f0ea] text-xl"><Icon name={food.category === "drink" ? "drop" : food.category === "dessert" ? "grain" : "bowl"} /></span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-[#1a2820]"><RawText>{food.nameTh || food.name}</RawText></div>
                      {food.nameTh && food.nameTh !== food.name && <div className="truncate text-xs text-[#718078]"><RawText>{food.name}</RawText></div>}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-extrabold text-[#2d6e3e]">{displayInteger(food.calories)}</div>
                    <div className="text-[10px] text-[#718078]">kcal / {basisLabel(food)}</div>
                  </div>
                  <span aria-hidden="true" className="text-lg text-[#718078]">›</span>
                </button>
              ))}
            </div>
            </section>
            </div>
          )}
        </div>
      )}

      {tab === "custom" && <div className="logger-custom space-y-4">
        <p className="text-sm text-[#596c5c]">{isAuthenticated ? "อาหารส่วนตัวจะเก็บในบัญชีของคุณและเลือกใช้ซ้ำได้" : "โหมดผู้เยี่ยมชม: เก็บอาหารส่วนตัวไว้ในเบราว์เซอร์เครื่องนี้ และเลือกใช้ซ้ำได้"}</p>
        <CustomFoodForm onSave={async food => {
          const saved = onCreateCustomFood ? await onCreateCustomFood(food) : food;
          handleSelect(saved);
        }} />
        {customFoods.length > 0 && <section aria-label="รายการอาหารส่วนตัว" className="space-y-2">
          <h3 className="font-semibold">อาหารส่วนตัวที่บันทึกไว้</h3>
          {customFoods.map((food, i) => <button key={food.customId ?? i} type="button" onClick={() => handleSelect(food)} className="flex w-full justify-between gap-3 rounded-xl border bg-white p-3 text-left">
            <span><RawText>{language === "en" ? food.name : food.nameTh}</RawText></span><span className="text-xs text-[#596c5c]">{displayInteger(food.calories)} kcal / {basisLabel(food)}</span>
          </button>)}
        </section>}
      </div>}

      {/* Scan Tab */}
      {tab === "scan" && (
        <div className="logger-scan space-y-3">
          {scanOnly && (
            <div className="rounded-[22px] border border-[#e5e2da] bg-white p-6">
              <div aria-hidden="true" className="mb-4 text-2xl text-[#2d6e3e]">♧</div>
              <h3 className="text-base font-bold text-[#1a2820]">คุณเป็นคนเลือกว่าจะใช้ AI หรือไม่</h3>
              <p className="mt-3 text-sm leading-relaxed text-[#596c5c]">รูปอาหารจะถูกส่งผ่านระบบของ NutriThai ไปยัง Gemini เพื่อประมาณชื่ออาหารและโภชนาการ เมื่อคุณยินยอมเท่านั้น</p>
              <p className="mt-2 text-xs leading-relaxed text-[#718078]">ผลวิเคราะห์เป็นค่าประมาณ โปรดตรวจสอบและแก้ไขก่อนบันทึก และหลีกเลี่ยงรูปที่มีข้อมูลส่วนบุคคล</p>
              <label className="mt-4 flex items-start gap-3 border-t border-[#edf4ee] pt-4 text-sm leading-relaxed text-[#1a2820]">
                <input
                  type="checkbox"
                  checked={consentToAnalyze}
                  onChange={(event) => setConsentToAnalyze(event.target.checked)}
                  className="mt-0.5"
                />
                <span>ยินยอมให้วิเคราะห์รูปอาหาร และเข้าใจว่าผล AI เป็นค่าประมาณที่ต้องตรวจสอบก่อนบันทึก</span>
              </label>
              {!isAuthenticated && <p className="mt-3 text-xs text-[#9d5b16]">เข้าสู่ระบบเพื่อใช้การวิเคราะห์รูปอาหาร</p>}
            </div>
          )}
          {(!scanOnly || scanPreview || isScanning || scanResult) && <div className="rounded-[22px] border border-dashed border-[#c9d8c9] bg-white p-6 text-center">
            {scanPreview && (
              <img
                src={scanPreview}
                alt="รูปอาหารที่เลือกสำหรับวิเคราะห์"
                className="w-full max-h-56 object-cover rounded-xl mb-4"
              />
            )}
            {isScanning ? (
              <div className="space-y-3">
                <div className="text-4xl animate-pulse">🔍</div>
                <div className="text-sm text-[#596c5c]">กำลังวิเคราะห์ภาพ...</div>
                <div className="flex justify-center gap-1">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
              </div>
            ) : scanResult ? (
              <div className="space-y-2">
                <div className="text-4xl">✅</div>
                <div className="text-sm font-semibold text-[#1a2820]">ตรวจพบอาหาร!</div>
                <div className="inline-flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-3 py-1">
                  <span className="text-xs text-emerald-400">ความมั่นใจ {displayInteger(scanResult.confidence)}%</span>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="scan-upload-icon"><Icon name="camera" /></div>
                <div className="text-sm text-[#596c5c]">วิเคราะห์รูปอาหารด้วย Gemini Vision</div>
                <div className="text-xs text-[#718078]">ตรวจสอบค่าประมาณก่อนเพิ่มลงบันทึก</div>
              </div>
            )}
          </div>}

          {scanError && (
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-300">
              {scanError}
            </div>
          )}

          {scanResult && (
            <div className="space-y-3 rounded-[22px] border border-[#c5d8c7] bg-white p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-base font-bold text-[#1a2820]"><RawText>{language === "en" ? scanResult.food.name : scanResult.food.nameTh}</RawText></div>
                  <div className="text-xs text-[#718078]"><RawText>{scanResult.food.name}</RawText></div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-emerald-400" style={{ fontFamily: "Outfit, sans-serif" }}>
                    {displayInteger(scanResult.food.calories)}
                  </div>
                  <div className="text-[10px] text-slate-600">kcal</div>
                </div>
              </div>
              <MacroPills food={scanResult.food} />
              <div className="mt-2 bg-amber-500/8 border border-amber-500/15 rounded-xl p-3">
                <div className="text-[11px] text-amber-300/80 leading-relaxed">{scanResult.suggestion}</div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditingScan((editing) => !editing)}
                disabled={savePending}
                className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold"
              >
                {isEditingScan ? "ยกเลิกการแก้ไข" : "แก้ไขผลวิเคราะห์"}
              </button>
              {isEditingScan && (
                <div className="mt-2 grid grid-cols-2 gap-2 text-left">
                  {([
                    ["name", "ชื่ออาหาร", "text"],
                    ["calories", "พลังงาน (kcal)", "number"],
                    ["protein", "โปรตีน (g)", "number"],
                    ["carbs", "คาร์บ (g)", "number"],
                    ["fat", "ไขมัน (g)", "number"],
                  ] as const).map(([field, label, type]) => (
                    <label key={field} className={field === "name" ? "col-span-2 text-[11px] text-slate-500" : "text-[11px] text-slate-500"}>
                      {label}
                      <input
                        type={type}
                        value={editedScan[field]}
                        onChange={(event) => setEditedScan({ ...editedScan, [field]: event.target.value })}
                        className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-xs text-white"
                      />
                    </label>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      const correctedFood = { ...scanResult.food, name: editedScan.name || scanResult.food.name, nameTh: editedScan.name || scanResult.food.nameTh, calories: Number(editedScan.calories) || scanResult.food.calories, protein: Number(editedScan.protein) || scanResult.food.protein, carbs: Number(editedScan.carbs) || scanResult.food.carbs, fat: Number(editedScan.fat) || scanResult.food.fat };
                      setScanResult({ ...scanResult, food: correctedFood });
                      setSelectedFood(correctedFood);
                      setIsEditingScan(false);
                    }}
                    className="col-span-2 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-400"
                  >
                    ใช้ข้อมูลที่แก้ไข
                  </button>
                </div>
              )}
            </div>
          )}

          {!isScanning && !scanResult && (
            <>
              {!scanOnly && <div className="rounded-xl border border-[#e5e2da] bg-[#f8f5ef] p-4 text-left">
                <label className="flex items-start gap-2 text-sm leading-relaxed text-[#1a2820]">
                  <input
                    type="checkbox"
                    checked={consentToAnalyze}
                    onChange={(event) => setConsentToAnalyze(event.target.checked)}
                    className="mt-0.5 accent-emerald-500"
                  />
                  <span>ฉันยินยอมส่งรูปนี้ไปยังเซิร์ฟเวอร์และ Google Gemini เพื่อวิเคราะห์อาหาร โดยไม่ควรเลือกรูปที่มีข้อมูลส่วนบุคคล</span>
                </label>
              </div>}
              <label
                className={`flex min-h-12 w-full items-center justify-center gap-2 rounded-[14px] py-3.5 text-sm font-semibold text-white transition-all ${consentToAnalyze && isAuthenticated ? "cursor-pointer bg-[#2d6e3e] hover:bg-[#245a33] active:scale-[0.98]" : "cursor-not-allowed bg-[#91b49a] opacity-80"}`}
                aria-disabled={!consentToAnalyze || !isAuthenticated}
              >
                <span>📷</span> {scanOnly ? "ยินยอมและเลือกรูป" : "วิเคราะห์ด้วย Gemini"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  disabled={!consentToAnalyze || !isAuthenticated}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file && consentToAnalyze) void handleScan(file);
                    event.target.value = "";
                  }}
                />
              </label>
            </>
          )}
          {!isScanning && scanResult && (
            <button
              type="button"
              onClick={() => {
                setScanResult(null);
                setSelectedFood(null);
                setConsentToAnalyze(false);
                setScanPreview("");
                setScanError("");
              }}
              className="w-full py-3 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-sm font-medium transition-all"
              disabled={savePending}
            >
              สแกนใหม่
            </button>
          )}
        </div>
      )}

      {/* Add to Log Panel */}
      {selectedFood && (
        <div className="logger-selection space-y-4 rounded-[22px] border border-[#e5e2da] bg-white p-5 shadow-sm">
          <fieldset disabled={isSaving || savePending} className="min-w-0 space-y-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-[#596c5c]">บันทึกอาหาร</div>
          <FoodPreferenceButtons food={selectedFood} value={preferences[foodKey(selectedFood) ?? ""]} onChange={onPreference} />
          {preferences[foodKey(selectedFood) ?? ""] === "avoid" && <p className="text-sm text-amber-800">คุณตั้งว่าไม่กินอาหารนี้ ระบบจะไม่แนะนำ แต่ยังเลือกบันทึกด้วยตัวเองได้</p>}
          {saveError && <div role="alert" className="rounded-lg bg-rose-500/10 p-2 text-xs text-rose-300">{saveError}</div>}

          <div className="logger-selected-summary flex items-center gap-3 rounded-2xl bg-[#f8f5ef] p-4">
            <span aria-hidden="true" className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-white text-xl">{selectedFood.category === "drink" ? "♧" : selectedFood.category === "dessert" ? "✿" : "♨"}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-base font-bold text-[#1a2820]"><RawText>{language === "en" ? selectedFood.name : selectedFood.nameTh}</RawText></div>
              <div className="truncate text-xs text-[#718078]"><RawText>{selectedFood.name}</RawText></div>
              <div className="mt-1 text-xs text-[#596c5c]">ต่อ {basisLabel(selectedFood)}</div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-xl font-extrabold text-[#2d6e3e]">{displayInteger(selectedFood.calories)}</div>
              <div className="text-xs text-[#718078]">kcal</div>
            </div>
          </div>

          <div className="rounded-2xl border border-[#edf4ee] p-4">
            <div className="mb-3 text-sm font-semibold text-[#1a2820]">ข้อมูลโภชนาการตามปริมาณที่เลือก</div>
            <div className="grid grid-cols-4 gap-2 text-center">
              {[
                { label: "แคลอรี", value: selectedFood.calories, unit: "kcal", color: "text-[#2d6e3e]" },
                { label: "โปรตีน", value: selectedFood.protein, unit: "g", color: "text-[#4f84a8]" },
                { label: "คาร์บ", value: selectedFood.carbs, unit: "g", color: "text-[#a46616]" },
                { label: "ไขมัน", value: selectedFood.fat, unit: "g", color: "text-[#66845d]" },
              ].map((item) => (
                <div key={item.label} className="min-w-0">
                  <div className={`text-base font-extrabold sm:text-lg ${item.color}`}>{displayInteger(validServings(servings) ? item.value * servings : 0)}</div>
                  <div className="text-[10px] text-[#718078] sm:text-xs">{item.unit}</div>
                  <div className="text-[10px] text-[#596c5c] sm:text-xs">{item.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Meal type */}
          <div className="grid grid-cols-4 gap-1.5">
            {mealOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setMealType(opt.value)}
                aria-pressed={mealType === opt.value}
                className={`rounded-xl border py-2.5 text-center transition-all ${
                  mealType === opt.value
                    ? "border-[#2d6e3e] bg-[#edf4ee]"
                    : "border-[#e5e2da] bg-white hover:bg-[#f8f5ef]"
                }`}
              >
                <div aria-hidden="true" className="text-base">{opt.icon}</div>
                <div className={`text-[10px] font-semibold ${mealType === opt.value ? "text-[#2d6e3e]" : "text-[#718078]"}`}>
                  {opt.label}
                </div>
              </button>
            ))}
          </div>

          <QuantityInput food={selectedFood} quantity={quantity} unit={quantityUnit} onChange={(value, unit) => { setQuantity(value); setQuantityUnit(unit); }} />
          {!scanOnly && onAddBatch && <button type="button" disabled={!validServings(servings) || draft.length >= 30} onClick={() => { setDraft([...draft, { food: selectedFood, servings }]); setSelectedFood(null); setQuery(""); }} className="w-full rounded-xl border border-[#2d6e3e] p-3 font-semibold text-[#2d6e3e] disabled:opacity-50">เพิ่มในชุดมื้อ ({draft.length}/30)</button>}
          {scanOnly && <label className="block text-sm">วันที่รับประทาน<input type="date" required max={localDateKey(new Date())} value={logDate} onChange={e => setLogDate(e.target.value)} className="ml-2 rounded-lg border p-2" /></label>}

          </fieldset>
          {savePending && !isSaving && <p role="status" className="text-sm text-amber-800">ยังยืนยันผลบันทึกไม่ได้ กดลองบันทึกอีกครั้งเพื่อยืนยันรายการเดิมโดยไม่เพิ่มซ้ำ หากออกจากหน้านี้ ให้ตรวจประวัติก่อนบันทึกใหม่</p>}
          <div className="logger-save-bar sticky bottom-[76px] z-20 -mx-2 flex items-center justify-between gap-3 rounded-[18px] border border-[#e5e2da] bg-white/95 p-3 shadow-lg backdrop-blur md:bottom-4">
            <div>
              <div className="text-xs text-[#718078]">รวม</div>
              <div className="text-sm font-bold text-[#1a2820]">{Number.isFinite(Number(servings)) ? Math.round(selectedFood.calories * Number(servings)) : 0} kcal</div>
            </div>
            <button
              type="button"
              onClick={handleAdd}
              disabled={isSaving || !validServings(servings) || !logDate || logDate > localDateKey(new Date())}
              className="min-h-12 flex-1 rounded-[14px] bg-[#2d6e3e] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#245a33] active:scale-[0.98] disabled:opacity-50"
            >
              {isSaving ? "กำลังบันทึก..." : savePending ? "ลองบันทึกอีกครั้ง" : "บันทึกอาหาร"}
            </button>
          </div>
        </div>
      )}

      </fieldset>
      {added && (
        <div role="status" className="logger-toast fixed bottom-24 left-1/2 -translate-x-1/2 bg-emerald-500 text-white px-5 py-2.5 rounded-full text-sm font-semibold shadow-lg shadow-emerald-500/30">
          ✓ เพิ่มเรียบร้อย!
        </div>
      )}
    </div>
  ));
}
