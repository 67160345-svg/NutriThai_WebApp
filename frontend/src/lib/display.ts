/** Presentation only: keep source values and form inputs precise for calculations. */
export function displayInteger(value: number): string {
  return Number.isFinite(value) ? String(Math.round(value)) : "—";
}

export function displayMeasurements(value: string): string {
  // Round decimal measurements in labels, but preserve fractions such as 1/2.
  return value.replace(/\d+\.\d+/g, match => displayInteger(Number(match)));
}

/** Also handles legacy food-log snapshots without altering their stored nutrition. */
export function splitFoodName(value: string): { name: string; sourcePortion?: string } {
  if (!value.endsWith(")")) return { name: value };
  let depth = 0;
  for (let i = value.length - 1; i >= 0; i--) {
    if (value[i] === ")") depth++;
    else if (value[i] === "(") {
      depth--;
      if (depth === 0) {
        const portion = value.slice(i + 1, -1);
        const name = value.slice(0, i).trimEnd();
        return name && /, \d+(?:\.\d+)? g$/.test(portion) ? { name, sourcePortion: portion } : { name: value };
      }
    }
  }
  return { name: value };
}
