import { useState } from "react";
import type { WeightLog } from "../types";
import { localDateKey } from "../lib/foodLogs";

export default function WeightTracker({ weights, start, end, onSave, onDelete }: {
  weights: WeightLog[]; start: string; end: string;
  onSave?: (weight: WeightLog) => Promise<void>; onDelete?: (date: string) => Promise<void>;
}) {
  const [date, setDate] = useState(localDateKey(new Date()));
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const entries = weights.filter(row => row.measuredOn >= start && row.measuredOn <= end).sort((a, b) => a.measuredOn.localeCompare(b.measuredOn));
  const min = Math.min(...entries.map(row => row.weightKg)) - 1;
  const max = Math.max(...entries.map(row => row.weightKg)) + 1;
  const span = Math.max(86400000, new Date(`${end}T12:00:00`).getTime() - new Date(`${start}T12:00:00`).getTime());
  const points = entries.map(row => ({ ...row, x: 25 + (new Date(`${row.measuredOn}T12:00:00`).getTime() - new Date(`${start}T12:00:00`).getTime()) / span * 550, y: 160 - (row.weightKg - min) / (max - min) * 130 }));
  return <section aria-label="บันทึกและแนวโน้มน้ำหนัก" className="my-5 space-y-3 rounded-[22px] border bg-white p-5">
    <h2 className="font-bold">น้ำหนักและแนวโน้ม</h2>
    <p className="text-xs text-[#596c5c]">หนึ่งค่าต่อวัน บันทึกวันที่เดิมเพื่อแก้ไข น้ำหนักที่บันทึกไม่เปลี่ยนเป้าพลังงานในโปรไฟล์อัตโนมัติ</p>
    {onSave && <form className="flex flex-wrap items-end gap-3" onSubmit={async e => {
      e.preventDefault(); const kg = Number(value); setError(""); setMessage("");
      if (!date || date > localDateKey(new Date()) || !Number.isFinite(kg) || kg < 20 || kg > 500) { setError("ตรวจวันที่และน้ำหนัก 20–500 กก."); return; }
      setBusy(true);
      try { await onSave({ measuredOn: date, weightKg: kg }); setMessage("บันทึกน้ำหนักแล้ว"); }
      catch (e) { setError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); } finally { setBusy(false); }
    }}>
      <label className="text-sm">วันที่ชั่ง<input required disabled={busy} type="date" value={date} max={localDateKey(new Date())} onChange={e => setDate(e.target.value)} className="block rounded-lg border p-2" /></label>
      <label className="text-sm">น้ำหนัก (กก.)<input required disabled={busy} type="number" min="20" max="500" step="0.01" value={value} onChange={e => setValue(e.target.value)} className="block w-28 rounded-lg border p-2" /></label>
      <button disabled={busy} className="rounded-xl bg-[#2d6e3e] px-4 py-2 text-white disabled:opacity-50">บันทึกน้ำหนัก</button>
    </form>}
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}{message && <p role="status" className="text-sm text-[#2d6e3e]">{message}</p>}
    {entries.length ? <>
      <p className="text-sm">ล่าสุดในช่วงนี้ {entries.at(-1)!.weightKg} กก.{entries.length > 1 && ` · เปลี่ยนแปลง ${(entries.at(-1)!.weightKg - entries[0].weightKg).toFixed(2)} กก.`}</p>
      <svg viewBox="0 0 600 190" role="img" aria-label="กราฟน้ำหนักตามวันที่ชั่ง" className="w-full"><text x="0" y="15" fontSize="12">{max.toFixed(1)} กก.</text><text x="0" y="185" fontSize="12">{min.toFixed(1)} กก.</text><polyline points={points.map(p => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#2d6e3e" strokeWidth="3" />{points.map(p => <circle key={p.measuredOn} cx={p.x} cy={p.y} r="4" fill="#2d6e3e"><title>{p.measuredOn}: {p.weightKg} กก.</title></circle>)}</svg>
      <p className="flex justify-between text-xs"><span>{start}</span><span>{end}</span></p>
      <details><summary className="cursor-pointer text-sm">ดูและแก้ไขรายการน้ำหนัก</summary><ul className="mt-2 space-y-2">{entries.map(row => <li key={row.measuredOn} className="flex flex-wrap items-center gap-3 text-sm"><span>{row.measuredOn} · {row.weightKg} กก.</span>
        {onSave && <button disabled={busy} type="button" onClick={() => { setDate(row.measuredOn); setValue(String(row.weightKg)); }}>แก้ไข {row.measuredOn}</button>}
        {onDelete && <button disabled={busy} type="button" onClick={async () => { setBusy(true); setError(""); setMessage(""); try { await onDelete(row.measuredOn); setMessage("ลบน้ำหนักแล้ว"); } catch (e) { setError(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); } finally { setBusy(false); } }}>ลบ {row.measuredOn}</button>}
      </li>)}</ul></details>
    </> : <p className="text-sm text-[#596c5c]">ยังไม่มีน้ำหนักในช่วงเวลาที่เลือก</p>}
  </section>;
}
