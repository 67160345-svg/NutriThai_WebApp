import { useState, useEffect } from "react";
import { Food, FoodLog, MealType } from "../types";
import { apiFetch } from "../lib/api";
import { localDateKey, readFoods } from "../lib/foodLogs";

interface Props {
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

interface ScanResult {
  food: Food;
  confidence: number;
  suggestion: string;
}

function MacroPills({ food }: { food: Food }) {
  return (
    <div className="flex gap-1.5 mt-1 flex-wrap">
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400">{food.protein}g โปรตีน</span>
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400">{food.carbs}g คาร์บ</span>
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-400">{food.fat}g ไขมัน</span>
    </div>
  );
}

export default function FoodLogger({ onAddLog, isAuthenticated, foods, initialTab = "search", scanOnly = false }: Props) {
  const [tab, setTab] = useState<"search" | "scan">(initialTab);
  const [query, setQuery] = useState("");
  const [selectedFood, setSelectedFood] = useState<Food | null>(null);
  const [mealType, setMealType] = useState<MealType>("lunch");
  const [servings, setServings] = useState("1");
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
        .catch((error: unknown) => {
          if (active) {
            setSearchResults([]);
            setSearchError(error instanceof Error ? error.message : "ค้นหารายการอาหารไม่สำเร็จ");
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
  }, [category, query, tab]);

  const results = query.trim() && tab === "search" ? searchResults : [];

  const handleSelect = (food: Food) => {
    setSelectedFood(food);
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
        category: "food",
        calories: item.calories,
        protein: item.protein,
        carbs: item.carbs,
        fat: item.fat,
        sugar: 0,
        fiber: 0,
      };
      setScanResult({ food, confidence: data.confidence ?? 0, suggestion: data.ai_advice });
      setSelectedFood(food);
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
    const servingCount = Number(servings);
    if (!selectedFood || !Number.isFinite(servingCount) || servingCount <= 0 || servingCount > 100) {
      setSaveError("จำนวน serving ต้องมากกว่า 0 และไม่เกิน 100");
      return;
    }
    setIsSaving(true);
    setSaveError("");
    try {
      await onAddLog({
        id: `${Date.now()}`,
        food: selectedFood,
        mealType,
        servings: servingCount,
        loggedAt: new Date(`${logDate}T12:00:00`),
      });
      setAdded(true);
      setSelectedFood(null);
      setScanResult(null);
      setScanPreview("");
      setIsEditingScan(false);
      setQuery("");
      setServings("1");
      setLogDate(localDateKey(new Date()));
      setTimeout(() => setAdded(false), 2000);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "บันทึกอาหารไม่สำเร็จ");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 py-7 sm:px-8">
      {/* Header */}
      {scanOnly ? (
        <div className="mb-5">
          <h2 className="text-xl font-bold text-[#1a2820]">สแกนอาหารด้วย AI</h2>
          <p className="mt-2 text-sm text-[#596c5c]">01 ยินยอม → 02 เลือกรูป → 03 ตรวจสอบและบันทึก</p>
        </div>
      ) : (
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-[#1a2820]">เพิ่มอาหาร</h2>
          <label htmlFor="log-date" className="sr-only">วันที่รับประทาน</label>
          <input
            id="log-date"
            type="date"
            value={logDate}
            max={localDateKey(new Date())}
            onChange={(e) => setLogDate(e.target.value)}
            className="max-w-44 rounded-xl border border-[#e5e2da] bg-white px-3 py-2.5 text-sm text-[#1a2820]"
          />
        </div>
      )}

      {/* Tabs */}
      {!scanOnly && <div className="mb-5 flex gap-1 rounded-xl bg-[#eeece5] p-1">
        {(["search", "scan"] as const).map((t) => (
          <button
            key={t}
            type="button"
            disabled={isScanning}
            onClick={() => {
              setTab(t);
              setSelectedFood(null);
              setScanResult(null);
              setQuery("");
              setConsentToAnalyze(false);
              setScanError("");
              setScanPreview("");
            }}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
              tab === t ? "bg-white text-[#2d6e3e] shadow-sm" : "text-[#718078] hover:text-[#2d6e3e]"
            }`}
          >
            {t === "search" ? "🔍 ค้นหาอาหาร" : "📷 สแกนรูป"}
          </button>
        ))}
      </div>}

      {tab === "search" && (
        <div className="flex gap-2 overflow-x-auto pb-1">
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
              className={`shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${category === value ? "border-[#2d6e3e] bg-[#2d6e3e] text-white" : "border-[#e5e2da] bg-white text-[#596c5c] hover:border-[#b7cdb9]"}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {foods.length === 0 && <div role="alert" className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-200">ยังไม่มีข้อมูลอาหารใน catalog กรุณาตรวจสอบรายการอาหารใน Supabase</div>}

      {/* Search Tab */}
      {tab === "search" && (
        <div className="space-y-3">
          <div className="relative">
            <label htmlFor="food-search" className="sr-only">ค้นหาอาหารภาษาไทยหรืออังกฤษ</label>
            <input
              id="food-search"
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
                onClick={() => { setQuery(""); setSelectedFood(null); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[#718078] hover:text-[#2d6e3e]"
              >
                ✕
              </button>
            )}
          </div>

          {isSearching && <div role="status" className="py-3 text-center text-sm text-[#718078]">กำลังค้นหาในฐานข้อมูล...</div>}
          {searchError && <div role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">ค้นหารายการอาหารไม่สำเร็จ: {searchError}</div>}

          {results.length > 0 && !selectedFood && !isSearching && (
            <div className="space-y-2">
              {results.map((food) => (
                <button
                  key={food.id}
                  onClick={() => handleSelect(food)}
                  className="flex w-full items-center justify-between gap-3 rounded-[18px] border border-[#e5e2da] bg-white px-4 py-3.5 text-left shadow-sm transition-colors hover:border-[#b7cdb9]"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#f3f0ea] text-xl">{food.category === "drink" ? "♧" : food.category === "dessert" ? "✿" : "♨"}</span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-[#1a2820]">{food.nameTh}</div>
                      <div className="truncate text-xs text-[#718078]">{food.name}</div>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-extrabold text-[#2d6e3e]">{food.calories}</div>
                    <div className="text-[10px] text-[#718078]">kcal</div>
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
            <div className="space-y-2">
              {foods.filter((food) => category === "all" || food.category === category).slice(0, 15).map((food) => (
                <button
                  key={food.id}
                  onClick={() => handleSelect(food)}
                  className="flex w-full items-center justify-between gap-3 rounded-[18px] border border-[#e5e2da] bg-white px-4 py-3.5 text-left shadow-sm transition-colors hover:border-[#b7cdb9]"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#f3f0ea] text-xl">{food.category === "drink" ? "♧" : food.category === "dessert" ? "✿" : "♨"}</span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-[#1a2820]">{food.nameTh}</div>
                      <div className="truncate text-xs text-[#718078]">{food.name}</div>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-extrabold text-[#2d6e3e]">{food.calories}</div>
                    <div className="text-[10px] text-[#718078]">kcal</div>
                  </div>
                  <span aria-hidden="true" className="text-lg text-[#718078]">›</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Scan Tab */}
      {tab === "scan" && (
        <div className="space-y-3">
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
                  <span className="text-xs text-emerald-400">ความมั่นใจ {scanResult.confidence}%</span>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-5xl">📷</div>
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
                  <div className="text-base font-bold text-[#1a2820]">{scanResult.food.nameTh}</div>
                  <div className="text-xs text-[#718078]">{scanResult.food.name}</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-emerald-400" style={{ fontFamily: "Outfit, sans-serif" }}>
                    {scanResult.food.calories}
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
                className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold"
              >
                {isEditingScan ? "Cancel correction" : "Correct AI result"}
              </button>
              {isEditingScan && (
                <div className="mt-2 grid grid-cols-2 gap-2 text-left">
                  {([
                    ["name", "Food name", "text"],
                    ["calories", "Calories", "number"],
                    ["protein", "Protein (g)", "number"],
                    ["carbs", "Carbs (g)", "number"],
                    ["fat", "Fats (g)", "number"],
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
                    Save correction
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
            >
              สแกนใหม่
            </button>
          )}
        </div>
      )}

      {/* Add to Log Panel */}
      {selectedFood && (
        <div className="space-y-4 rounded-[22px] border border-[#e5e2da] bg-white p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wider text-[#596c5c]">บันทึกอาหาร</div>
          {saveError && <div role="alert" className="rounded-lg bg-rose-500/10 p-2 text-xs text-rose-300">{saveError}</div>}

          <div className="flex items-center gap-3 rounded-2xl bg-[#f8f5ef] p-4">
            <span aria-hidden="true" className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-white text-xl">{selectedFood.category === "drink" ? "♧" : selectedFood.category === "dessert" ? "✿" : "♨"}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-base font-bold text-[#1a2820]">{selectedFood.nameTh}</div>
              <div className="truncate text-xs text-[#718078]">{selectedFood.name}</div>
              <div className="mt-1 text-xs text-[#596c5c]">ต่อ 1 หน่วยบริโภค</div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-xl font-extrabold text-[#2d6e3e]">{selectedFood.calories}</div>
              <div className="text-xs text-[#718078]">kcal</div>
            </div>
          </div>

          <div className="rounded-2xl border border-[#edf4ee] p-4">
            <div className="mb-3 text-sm font-semibold text-[#1a2820]">ข้อมูลโภชนาการ (ต่อ 1 หน่วย)</div>
            <div className="grid grid-cols-4 gap-2 text-center">
              {[
                { label: "แคลอรี", value: selectedFood.calories, unit: "kcal", color: "text-[#2d6e3e]" },
                { label: "โปรตีน", value: selectedFood.protein, unit: "g", color: "text-[#4f84a8]" },
                { label: "คาร์บ", value: selectedFood.carbs, unit: "g", color: "text-[#a46616]" },
                { label: "ไขมัน", value: selectedFood.fat, unit: "g", color: "text-[#66845d]" },
              ].map((item) => (
                <div key={item.label} className="min-w-0">
                  <div className={`text-base font-extrabold sm:text-lg ${item.color}`}>{item.value}</div>
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

          {/* Servings */}
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="serving-count" className="whitespace-nowrap text-sm font-semibold text-[#596c5c]">จำนวน (หน่วย)</label>
            <div className="flex flex-1 items-center justify-end gap-2">
              <button
                type="button"
                aria-label="ลดจำนวนครึ่งหน่วย"
                onClick={() => setServings(String(Math.max(0.5, (Number(servings) || 1) - 0.5)))}
                className="grid h-10 w-10 place-items-center rounded-xl border border-[#e5e2da] bg-[#f8f5ef] text-lg text-[#596c5c] hover:bg-[#edf4ee]"
              >
                −
              </button>
              <input
                id="serving-count"
                type="number"
                value={servings}
                onChange={(e) => setServings(e.target.value)}
                min="0.5"
                max="100"
                step="0.5"
                className="w-20 rounded-xl border border-[#e5e2da] bg-white px-3 py-2 text-center text-sm text-[#1a2820]"
              />
              <button
                type="button"
                aria-label="เพิ่มจำนวนครึ่งหน่วย"
                onClick={() => setServings(String((Number(servings) || 0) + 0.5))}
                className="grid h-10 w-10 place-items-center rounded-xl border border-[#e5e2da] bg-[#f8f5ef] text-lg text-[#596c5c] hover:bg-[#edf4ee]"
              >
                +
              </button>
            </div>
            <div className="w-full text-right text-sm font-bold text-[#2d6e3e] sm:w-auto">
              {Number.isFinite(Number(servings)) && Number(servings) > 0 && Number(servings) <= 100
                ? `${Math.round(selectedFood.calories * Number(servings))} kcal`
                : "ใส่จำนวนที่ถูกต้อง"}
            </div>
          </div>
          {(!Number.isFinite(Number(servings)) || Number(servings) <= 0 || Number(servings) > 100) && (
            <div role="alert" className="text-xs text-[#9d302b]">จำนวน serving ต้องมากกว่า 0 และไม่เกิน 100</div>
          )}

          <div className="sticky bottom-[76px] z-20 -mx-2 flex items-center justify-between gap-3 rounded-[18px] border border-[#e5e2da] bg-white/95 p-3 shadow-lg backdrop-blur md:bottom-4">
            <div>
              <div className="text-xs text-[#718078]">รวม</div>
              <div className="text-sm font-bold text-[#1a2820]">{Number.isFinite(Number(servings)) ? Math.round(selectedFood.calories * Number(servings)) : 0} kcal</div>
            </div>
            <button
              type="button"
              onClick={handleAdd}
              disabled={isSaving || !Number.isFinite(Number(servings)) || Number(servings) <= 0 || Number(servings) > 100}
              className="min-h-12 flex-1 rounded-[14px] bg-[#2d6e3e] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#245a33] active:scale-[0.98] disabled:opacity-50"
            >
              {isSaving ? "กำลังบันทึก..." : "บันทึกอาหาร"}
            </button>
          </div>
        </div>
      )}

      {added && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-emerald-500 text-white px-5 py-2.5 rounded-full text-sm font-semibold shadow-lg shadow-emerald-500/30 animate-bounce">
          ✓ เพิ่มเรียบร้อย!
        </div>
      )}
    </div>
  );
}
