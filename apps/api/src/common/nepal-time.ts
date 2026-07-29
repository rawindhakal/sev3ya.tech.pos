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

// Nepal midnight (00:00:00.000 Nepal-local) for a given YYYY-MM-DD date,
// as the correct absolute UTC instant. Use this instead of `new Date(str)`
// + `.setHours(0,0,0,0)` — that pattern computes midnight in the SERVER
// PROCESS's own timezone, which is only correct if that happens to be
// Nepal's. On a typical UTC VPS it's off by a fixed 5:45h, which silently
// shifts every "today"/date-range boundary on the dashboard and reports:
// e.g. an order placed at 2am Nepal time gets counted as "yesterday", and
// "today" keeps counting orders until 5:45am Nepal time the next calendar
// day.
export function nepalStartOfDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) - NPT_OFFSET_MIN * 60_000);
}

// End of that same Nepal-local day (23:59:59.999 Nepal-local), inclusive.
export function nepalEndOfDate(dateStr: string): Date {
  return new Date(nepalStartOfDate(dateStr).getTime() + 24 * 60 * 60 * 1000 - 1);
}

// Nepal midnight for "today" — the calendar day it currently is in Nepal,
// which is not necessarily the calendar day it is in the server's own
// timezone right now.
export function nepalStartOfToday(now: Date = new Date()): Date {
  return nepalStartOfDate(nepalDateKey(now));
}
