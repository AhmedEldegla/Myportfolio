// Timezone helpers (no libraries: Intl does the heavy lifting)

const fmtCache = new Map();
export function wallParts(ts, tz) {
  let fmt = fmtCache.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short"
    });
    fmtCache.set(tz, fmt);
  }
  const p = Object.fromEntries(fmt.formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, s: +p.second };
}

// Offset of `tz` from UTC at instant `ts`, in ms
function tzOffset(ts, tz) {
  const w = wallParts(ts, tz);
  return Date.UTC(w.y, w.m - 1, w.d, w.h, w.min, w.s) - Math.floor(ts / 1000) * 1000;
}

// Wall-clock time in `tz` -> UTC timestamp (handles DST by re-checking the offset)
export function zonedToUtc(y, m, d, h, min, tz) {
  const guess = Date.UTC(y, m - 1, d, h, min);
  const first = guess - tzOffset(guess, tz);
  return guess - tzOffset(first, tz);
}

export const pad = (n) => String(n).padStart(2, "0");

// "YYYY-MM-DD" + "HH:MM" in tz -> ISO UTC string, or "" when malformed
export function localToIso(date, time, tz) {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || "");
  const tm = /^(\d{2}):(\d{2})$/.exec(time || "");
  if (!dm || !tm) return "";
  const ts = zonedToUtc(+dm[1], +dm[2], +dm[3], +tm[1], +tm[2], tz);
  return Number.isFinite(ts) ? new Date(ts).toISOString() : "";
}

export function isValidTz(tz) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// Human date/time for emails and notifications
export function fmtWhen(iso, tz) {
  const zone = isValidTz(tz) ? tz : "UTC";
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: zone, weekday: "long", day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}

export function fmtTime(iso, tz) {
  const zone = isValidTz(tz) ? tz : "UTC";
  return new Date(iso).toLocaleTimeString("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit" });
}

export const addMinutes = (iso, min) => new Date(Date.parse(iso) + min * 60000).toISOString();
