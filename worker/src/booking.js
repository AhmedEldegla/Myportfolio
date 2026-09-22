import { TIMEZONE, SLOT_MINUTES, MIN_NOTICE_HOURS, DAYS_AHEAD, WEEKLY_HOURS, BLOCKED_DATES } from "./schedule.js";
import { json, readJson, makeLimiter } from "./http.js";
import { notifyTelegram } from "./notify.js";

const bookLimited = makeLimiter(5, 60 * 60 * 1000);   // 5 booking attempts per IP per hour
const MAX_ACTIVE_PER_EMAIL = 2;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// ---------- Timezone helpers (no libraries: Intl does the heavy lifting) ----------

const fmtCache = new Map();
function wallParts(ts, tz) {
  let fmt = fmtCache.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit"
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
function zonedToUtc(y, m, d, h, min, tz) {
  const guess = Date.UTC(y, m - 1, d, h, min);
  const first = guess - tzOffset(guess, tz);
  return guess - tzOffset(first, tz);
}

const pad = (n) => String(n).padStart(2, "0");

// ---------- Slots ----------

function candidateSlots(now = Date.now()) {
  const today = wallParts(now, TIMEZONE);
  const earliest = now + MIN_NOTICE_HOURS * 3600 * 1000;
  const slots = [];

  for (let i = 0; i <= DAYS_AHEAD; i++) {
    const day = new Date(Date.UTC(today.y, today.m - 1, today.d + i));
    const y = day.getUTCFullYear(), m = day.getUTCMonth() + 1, d = day.getUTCDate();
    if (BLOCKED_DATES.includes(`${y}-${pad(m)}-${pad(d)}`)) continue;

    for (const [from, to] of WEEKLY_HOURS[day.getUTCDay()] || []) {
      const [fh, fm] = from.split(":").map(Number);
      const [th, tm] = to.split(":").map(Number);
      for (let t = fh * 60 + fm; t + SLOT_MINUTES <= th * 60 + tm; t += SLOT_MINUTES) {
        const start = zonedToUtc(y, m, d, Math.floor(t / 60), t % 60, TIMEZONE);
        if (start >= earliest) slots.push(new Date(start).toISOString());
      }
    }
  }
  return slots;
}

async function bookedSet(db, fromIso, toIso) {
  const { results } = await db
    .prepare("SELECT start_utc FROM bookings WHERE status = 'confirmed' AND start_utc >= ?1 AND start_utc <= ?2")
    .bind(fromIso, toIso)
    .all();
  return new Set(results.map((r) => r.start_utc));
}

async function availableSlots(db) {
  const all = candidateSlots();
  if (!all.length) return [];
  const taken = await bookedSet(db, all[0], all[all.length - 1]);
  return all.filter((s) => !taken.has(s));
}

export async function handleSlots(env, headers) {
  if (!env.DB) return json(503, { error: "booking_not_configured" }, headers);
  const slots = await availableSlots(env.DB);
  return json(200, { timezone: TIMEZONE, slotMinutes: SLOT_MINUTES, slots }, headers);
}

// ---------- Booking ----------

const clean = (v, max) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");

export async function handleBook(request, env, ctx, headers, ip) {
  if (!env.DB) return json(503, { error: "booking_not_configured" }, headers);
  if (bookLimited(ip)) return json(429, { error: "rate_limited" }, headers);

  const body = await readJson(request);
  if (!body) return json(400, { error: "bad_json" }, headers);

  // Honeypot: real people never fill this hidden field
  if (body.website) return json(200, { ok: true }, headers);

  const name = clean(body.name, 100);
  const email = clean(body.email, 200).toLowerCase();
  const topic = clean(body.topic, 500);
  const start = typeof body.start === "string" ? body.start : "";

  if (!name) return json(400, { error: "name_required" }, headers);
  if (!EMAIL_RE.test(email)) return json(400, { error: "email_invalid" }, headers);
  if (!candidateSlots().includes(start)) return json(409, { error: "slot_unavailable" }, headers);

  const nowIso = new Date().toISOString();
  const active = await env.DB
    .prepare("SELECT COUNT(*) AS n FROM bookings WHERE email = ?1 AND status = 'confirmed' AND start_utc > ?2")
    .bind(email, nowIso)
    .first();
  if (active && active.n >= MAX_ACTIVE_PER_EMAIL) {
    return json(429, { error: "too_many_bookings" }, headers);
  }

  const id = crypto.randomUUID();
  const end = new Date(Date.parse(start) + SLOT_MINUTES * 60 * 1000).toISOString();
  try {
    await env.DB
      .prepare("INSERT INTO bookings (id, start_utc, end_utc, name, email, topic, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)")
      .bind(id, start, end, name, email, topic, nowIso)
      .run();
  } catch (err) {
    // The unique index rejects a second booking for the same slot
    if (String(err).includes("UNIQUE")) return json(409, { error: "slot_unavailable" }, headers);
    throw err;
  }

  const local = new Date(start).toLocaleString("en-GB", {
    timeZone: TIMEZONE, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
  });
  ctx.waitUntil(notifyTelegram(env,
    `📅 New call booked\n${local} (${TIMEZONE}), ${SLOT_MINUTES} min\n\n👤 ${name}\n✉️ ${email}\n📝 ${topic || "-"}`));

  return json(200, { ok: true, id, start, end, slotMinutes: SLOT_MINUTES }, headers);
}

// ---------- Admin ----------

async function sha256(text) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

async function isAdmin(request, env) {
  if (!env.ADMIN_PASSWORD) return false;
  const auth = request.headers.get("Authorization") || "";
  const given = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  // Compare hashes in constant time so response timing doesn't leak the password
  const [a, b] = await Promise.all([sha256(given), sha256(env.ADMIN_PASSWORD)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0 && given.length > 0;
}

const adminLimited = makeLimiter(30, 10 * 60 * 1000);

export async function handleAdmin(request, env, headers, ip, path) {
  if (!env.DB) return json(503, { error: "booking_not_configured" }, headers);
  if (adminLimited(ip)) return json(429, { error: "rate_limited" }, headers);
  if (!(await isAdmin(request, env))) return json(401, { error: "unauthorized" }, headers);

  if (path === "/admin/bookings" && request.method === "GET") {
    const url = new URL(request.url);
    const past = url.searchParams.get("scope") === "past";
    const nowIso = new Date().toISOString();
    const { results } = await env.DB
      .prepare(past
        ? "SELECT * FROM bookings WHERE start_utc < ?1 ORDER BY start_utc DESC LIMIT 100"
        : "SELECT * FROM bookings WHERE start_utc >= ?1 ORDER BY start_utc ASC LIMIT 200")
      .bind(nowIso)
      .all();
    return json(200, { timezone: TIMEZONE, bookings: results }, headers);
  }

  const cancel = path.match(/^\/admin\/bookings\/([0-9a-f-]{36})\/cancel$/);
  if (cancel && request.method === "POST") {
    const res = await env.DB
      .prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ?1 AND status = 'confirmed'")
      .bind(cancel[1])
      .run();
    return json(res.meta.changes ? 200 : 404, { ok: Boolean(res.meta.changes) }, headers);
  }

  return json(404, { error: "not_found" }, headers);
}
