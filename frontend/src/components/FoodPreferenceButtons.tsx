import { useState } from "react";
import type { Food, FoodPreference } from "../types";
import { foodKey } from "../lib/recommendations";

export default function FoodPreferenceButtons({ food, value, onChange }: {
  food: Food; value?: FoodPreference; onChange?: (food: Food, value: FoodPreference | null) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!onChange || !foodKey(food)) return null;
  return <div className="space-y-1">
    <div className="flex flex-wrap gap-1" aria-label={`ความชอบ ${food.nameTh}`}>
      {([["like", "ชอบ"], ["not_interested", "ไม่สนใจ"], ["avoid", "ไม่กินอาหารนี้"]] as const).map(([key, label]) =>
        <button key={key} type="button" disabled={busy} aria-pressed={value === key} onClick={async () => {
          setBusy(true); setError("");
          try { await onChange(food, value === key ? null : key); }
          catch (e) { setError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
          finally { setBusy(false); }
        }} className={`rounded-full border px-2.5 py-1.5 text-xs disabled:opacity-50 ${value === key ? "bg-[#2d6e3e] text-white" : "bg-white text-[#596c5c]"}`}>{label}</button>)}
    </div>
    {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
  </div>;
}
