import { localDateKey } from "./foodLogs";

export function insightDates(start: string, end: string): string[] {
  const first = new Date(`${start}T12:00:00`), last = new Date(`${end}T12:00:00`);
  if (!Number.isFinite(first.getTime()) || !Number.isFinite(last.getTime()) || start > end
    || localDateKey(first) !== start || localDateKey(last) !== end) return [];
  const dates: string[] = [];
  for (const day = new Date(first); day <= last && dates.length <= 366; day.setDate(day.getDate() + 1)) dates.push(localDateKey(day));
  return dates.length > 366 ? [] : dates;
}
export function rollingStart(end: string, days: number): string {
  const date = new Date(`${end}T12:00:00`); date.setDate(date.getDate() - days + 1); return localDateKey(date);
}
