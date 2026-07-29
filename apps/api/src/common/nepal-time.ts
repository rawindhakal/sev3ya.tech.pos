// Nepal Standard Time is a fixed UTC+5:45 offset, no DST — safe to hardcode
// (also used by iclock.service.ts for parsing device-local punch times).
export const NPT_OFFSET_MIN = 5 * 60 + 45;

// Calendar-day key (YYYY-MM-DD) in Nepal local time for a UTC instant. The
// server runs in UTC, so a plain `date.toISOString().slice(0, 10)` gives the
// UTC day — wrong for any local time between 00:00 and 05:45, which is still
// "yesterday" in UTC. That silently split shifts crossing local midnight
// (e.g. a 4am bakery-prep clock-in landing in the previous day's bucket)
// across two day cells in attendance/payroll aggregation.
export function nepalDateKey(at: Date): string {
  return new Date(at.getTime() + NPT_OFFSET_MIN * 60_000).toISOString().slice(0, 10);
}
