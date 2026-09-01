// Week helpers (Monday-based).

export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Monday of the week containing `ref` (defaults to today), as YYYY-MM-DD. */
export function weekStart(ref: Date = new Date()): string {
  const d = new Date(ref);
  const day = (d.getUTCDay() + 6) % 7; // 0 = Monday
  d.setUTCDate(d.getUTCDate() - day);
  return toISODate(d);
}

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return toISODate(d);
}

export function weekDays(startIso: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(startIso, i));
}

export const DAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export function prettyDay(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
}

/** Hour label in the Excel style: 0 -> "12am", 13 -> "1pm". */
export function hourLabel(h: number): string {
  const ampm = h < 12 ? "am" : "pm";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}${ampm}`;
}

/** "D003" -> "003"; falls back to the raw ref. */
export function dispatcherNumber(externalRef?: string | null): string {
  if (!externalRef) return "—";
  const m = externalRef.match(/(\d+)/);
  return m ? m[1] : externalRef;
}

// Operation/schedule timezone. The Excel schedule hours are authored in Eastern time (Atlanta).
export const OPERATION_TZ = "America/New_York";

export function todayIso(tz = OPERATION_TZ): string {
  return new Date(new Date().toLocaleString("en-US", { timeZone: tz }))
    .toISOString()
    .slice(0, 10);
}
