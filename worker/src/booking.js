// Public booking engine: meeting types, available times, booking, and client self-service
// (reschedule / cancel through the private link in their confirmation email).
import { json, readJson, makeLimiter } from "./http.js";
import { notifyTelegram } from "./notify.js";
import { getSetting, activeTypes } from "./settings.js";
import { wallParts, zonedToUtc, pad, isValidTz, fmtWhen, addMinutes } from "./time.js";
import { createMeeting, moveMeeting, cancelMeeting, googleBusy } from "./meet.js";
import { sha256Hex, randomToken } from "./auth.js";
import {
  mailEnabled, manageUrl, mailBookingConfirmed, mailOwnerNewBooking, mailRescheduled, mailCancelled, safeAnswers
} from "./mail.js";

const bookLimited = makeLimiter(5, 60 * 60 * 1000);      // 5 booking attempts per IP per hour
const manageLimited = makeLimiter(40, 10 * 60 * 1000);
const MAX_ACTIVE_PER_EMAIL = 2;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const LEGACY_TYPE = "project";                             // old clients that don't send a type

const clean = (v, max) => (typeof v === "string" ? v.trim().replace(/[ \t]+/g, " ").slice(0, max) : "");
const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && aEnd > bStart;

export async function findType(env, id, { includeInactive = false } = {}) {
  const types = includeInactive ? await getSetting(env, "meetingTypes") : await activeTypes(env);
  return types.find((t) => t.id === id) || null;
}

export async function typeById(env, id) {
  const all = await getSetting(env, "meetingTypes");
  return all.find((t) => t.id === id) || { id, name: "Call", duration: 30, questions: [] };
}

// ---------- Available times ----------

function candidateStarts(av, duration, now = Date.now()) {
  const tz = av.timezone;
  const today = wallParts(now, tz);
  const earliest = now + av.minNoticeHours * 3600 * 1000;
  const step = duration <= 20 ? 15 : 30;
  const out = [];
  for (let i = 0; i <= av.daysAhead; i++) {
    const day = new Date(Date.UTC(today.y, today.m - 1, today.d + i));
    const y = day.getUTCFullYear(), m = day.getUTCMonth() + 1, d = day.getUTCDate();
    const dateKey = `${y}-${pad(m)}-${pad(d)}`;
    if ((av.blockedDates || []).includes(dateKey)) continue;
    for (const [from, to] of av.weekly[day.getUTCDay()] || []) {
      const [fh, fm] = from.split(":").map(Number);
      const [th, tm] = to.split(":").map(Number);
      for (let t = fh * 60 + fm; t + duration <= th * 60 + tm; t += step) {
        const start = zonedToUtc(y, m, d, Math.floor(t / 60), t % 60, tz);
        if (start >= earliest) out.push({ start: new Date(start).toISOString(), end: new Date(start + duration * 60000).toISOString(), dateKey });
      }
    }
  }
  return out;
}

export async function computeSlots(env, type, { excludeId = "" } = {}) {
  const av = await getSetting(env, "availability");
  const cands = candidateStarts(av, type.duration);
  if (!cands.length) return [];
  const from = addMinutes(cands[0].start, -240);
  const to = addMinutes(cands[cands.length - 1].end, 240);
  const buffer = av.bufferMinutes || 0;

  const [{ results: booked }, { results: blocks }, gBusy] = await Promise.all([
    env.DB.prepare("SELECT id, start_utc, end_utc FROM bookings WHERE status = 'confirmed' AND end_utc > ?1 AND start_utc < ?2")
      .bind(from, to).all(),
    env.DB.prepare("SELECT start_utc, end_utc FROM blocks WHERE end_utc > ?1 AND start_utc < ?2").bind(from, to).all(),
    googleBusy(env, from, to)
  ]);

  const mine = booked.filter((b) => b.id !== excludeId);
  const busy = [
    ...mine.map((b) => [addMinutes(b.start_utc, -buffer), addMinutes(b.end_utc, buffer)]),
    ...blocks.map((b) => [b.start_utc, b.end_utc]),
    ...gBusy.map((b) => [b.start, b.end])
  ];

  // Daily cap, counted in Ahmed's timezone
  const perDay = new Map();
  if (av.maxPerDay) {
    for (const b of mine) {
      const w = wallParts(Date.parse(b.start_utc), av.timezone);
      const k = `${w.y}-${pad(w.m)}-${pad(w.d)}`;
      perDay.set(k, (perDay.get(k) || 0) + 1);
    }
  }

  return cands
    .filter((c) => !(av.maxPerDay && (perDay.get(c.dateKey) || 0) >= av.maxPerDay))
    .filter((c) => !busy.some(([s, e]) => overlaps(c.start, c.end, s, e)))
    .map((c) => c.start);
}

// ---------- Public endpoints ----------

export async function handleConfig(env, headers) {
  const av = await getSetting(env, "availability");
  const types = await activeTypes(env);
  return json(200, {
    timezone: av.timezone,
    daysAhead: av.daysAhead,
    types: types.map(({ id, name, duration, description, questions }) => ({ id, name, duration, description, questions }))
  }, headers);
}

export async function handleSlots(request, env, headers) {
  if (!env.DB) return json(503, { error: "booking_not_configured" }, headers);
  const id = new URL(request.url).searchParams.get("type") || LEGACY_TYPE;
  const type = await findType(env, id);
  if (!type) return json(404, { error: "unknown_type" }, headers);
  const av = await getSetting(env, "availability");
  const slots = await computeSlots(env, type);
  return json(200, { timezone: av.timezone, type: type.id, slotMinutes: type.duration, slots }, headers);
}

function readAnswers(type, raw, legacyTopic) {
  const src = raw && typeof raw === "object" ? raw : {};
  const answers = {};
  for (const q of type.questions || []) {
    const max = q.type === "textarea" ? 1500 : 200;
    let v = clean(src[q.id], max);
    if (q.type === "textarea" && typeof src[q.id] === "string") v = src[q.id].trim().slice(0, max);
    if (q.type === "select" && v && !(q.options || []).includes(v)) return { error: "invalid_answer", field: q.id };
    if (v) answers[q.id] = v;
  }
  if (legacyTopic) answers.topic = legacyTopic;
  return { answers };
}

export async function handleBook(request, env, ctx, headers, ip) {
  if (!env.DB) return json(503, { error: "booking_not_configured" }, headers);
  if (bookLimited(ip)) return json(429, { error: "rate_limited" }, headers);

  const body = await readJson(request);
  if (!body) return json(400, { error: "bad_json" }, headers);
  if (body.website) return json(200, { ok: true }, headers);   // honeypot

  const legacy = !body.type;
  const type = await findType(env, body.type || LEGACY_TYPE);
  if (!type) return json(400, { error: "unknown_type" }, headers);

  const name = clean(body.name, 100);
  const email = clean(body.email, 200).toLowerCase();
  const start = typeof body.start === "string" ? body.start : "";
  const clientTz = isValidTz(body.tz) ? body.tz : "";
  if (!name) return json(400, { error: "name_required" }, headers);
  if (!EMAIL_RE.test(email)) return json(400, { error: "email_invalid" }, headers);

  const parsed = readAnswers(type, body.answers, legacy ? clean(body.topic, 500) : "");
  if (parsed.error) return json(400, { error: parsed.error, field: parsed.field }, headers);
  if (!legacy) {
    const missing = (type.questions || []).find((q) => q.required && !parsed.answers[q.id]);
    if (missing) return json(400, { error: "answer_required", field: missing.id }, headers);
  }

  const slots = await computeSlots(env, type);
  if (!slots.includes(start)) return json(409, { error: "slot_unavailable" }, headers);

  const nowIso = new Date().toISOString();
  const active = await env.DB
    .prepare("SELECT COUNT(*) AS n FROM bookings WHERE email = ?1 AND status = 'confirmed' AND start_utc > ?2")
    .bind(email, nowIso).first();
  if (active && active.n >= MAX_ACTIVE_PER_EMAIL) return json(429, { error: "too_many_bookings" }, headers);

  const av = await getSetting(env, "availability");
  const buffer = av.bufferMinutes || 0;
  const id = crypto.randomUUID();
  const end = addMinutes(start, type.duration);
  const token = randomToken(24);
  const tokenHash = await sha256Hex(token);

  // Insert only if nothing overlaps (with buffers) at this exact moment: atomic in SQLite
  let res;
  try {
    res = await env.DB.prepare(`
      INSERT INTO bookings (id, start_utc, end_utc, name, email, topic, created_at, updated_at,
                            type_id, duration, answers, client_tz, manage_token)
      SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7, ?8, ?9, ?10, ?11, ?12
      WHERE NOT EXISTS (SELECT 1 FROM bookings WHERE status = 'confirmed' AND start_utc < ?13 AND end_utc > ?14)
        AND NOT EXISTS (SELECT 1 FROM blocks WHERE start_utc < ?3 AND end_utc > ?2)`)
      .bind(id, start, end, name, email, parsed.answers.topic || "", nowIso, type.id, type.duration,
        JSON.stringify(parsed.answers), clientTz, tokenHash, addMinutes(end, buffer), addMinutes(start, -buffer))
      .run();
  } catch (err) {
    if (String(err).includes("UNIQUE")) return json(409, { error: "slot_unavailable" }, headers);
    throw err;
  }
  if (!res.meta.changes) return json(409, { error: "slot_unavailable" }, headers);

  const summary = (type.questions || []).filter((q) => parsed.answers[q.id]).map((q) => `${q.label}: ${parsed.answers[q.id]}`).join("\n");
  const meeting = await createMeeting(env, { id, start, end, name, email, typeName: type.name, summary });
  await env.DB.prepare("UPDATE bookings SET meet_url = ?1, gcal_event_id = ?2 WHERE id = ?3")
    .bind(meeting.meetUrl, meeting.eventId, id).run();

  const booking = {
    id, start_utc: start, end_utc: end, name, email, duration: type.duration, type_id: type.id,
    answers: parsed.answers, client_tz: clientTz || av.timezone, meet_url: meeting.meetUrl, sequence: 0
  };
  const notif = await getSetting(env, "notifications");
  ctx.waitUntil(Promise.all([
    mailBookingConfirmed(env, { booking, type, token }),
    notif.emailOwner ? mailOwnerNewBooking(env, { booking, type, ownerTz: av.timezone }) : null,
    notif.telegram ? notifyTelegram(env,
      `📅 New ${type.name.toLowerCase()} (${type.duration} min)\n${fmtWhen(start, av.timezone)} (${av.timezone})\n\n👤 ${name}\n✉️ ${email}\n${summary ? `📝 ${summary}\n` : ""}🎥 ${meeting.meetUrl}`) : null
  ]));

  return json(200, {
    ok: true, id, start, end,
    slotMinutes: type.duration,
    type: { id: type.id, name: type.name, duration: type.duration },
    meetUrl: meeting.meetUrl,
    manageUrl: manageUrl(env, token),
    emailed: mailEnabled(env)
  }, headers);
}

// ---------- Shared actions (client self-service and admin) ----------

export async function cancelBooking(env, booking, { by, reason = "", notify = true }) {
  const res = await env.DB
    .prepare("UPDATE bookings SET status = 'cancelled', cancel_reason = ?1, cancelled_by = ?2, updated_at = ?3 WHERE id = ?4 AND status = 'confirmed'")
    .bind(reason.slice(0, 500), by, new Date().toISOString(), booking.id).run();
  if (!res.meta.changes) return false;
  await cancelMeeting(env, booking.gcal_event_id);
  const av = await getSetting(env, "availability");
  const type = await typeById(env, booking.type_id);
  const notif = await getSetting(env, "notifications");
  const jobs = [];
  if (notify) jobs.push(mailCancelled(env, { booking, type, ownerTz: av.timezone, by, reason }));
  if (by === "client" && notif.telegram) {
    jobs.push(notifyTelegram(env, `❌ ${booking.name} cancelled\n${fmtWhen(booking.start_utc, av.timezone)}${reason ? `\nReason: ${reason}` : ""}`));
  }
  await Promise.all(jobs);
  return true;
}

// Returns "" on success or an error code
export async function rescheduleBooking(env, booking, newStart, { by, notify = true, force = false }) {
  const type = await typeById(env, booking.type_id);
  const duration = booking.duration || type.duration;
  const newEnd = addMinutes(newStart, duration);
  if (!force) {
    const slots = await computeSlots(env, { ...type, duration }, { excludeId: booking.id });
    if (!slots.includes(newStart)) return "slot_unavailable";
  } else if (Number.isNaN(Date.parse(newStart))) {
    return "bad_time";
  }
  const av = await getSetting(env, "availability");
  const buffer = force ? 0 : av.bufferMinutes || 0;
  const res = await env.DB.prepare(`
    UPDATE bookings SET start_utc = ?1, end_utc = ?2, sequence = sequence + 1, reminded = 0, updated_at = ?3
    WHERE id = ?4 AND status = 'confirmed'
      AND NOT EXISTS (SELECT 1 FROM bookings b2 WHERE b2.status = 'confirmed' AND b2.id <> ?4 AND b2.start_utc < ?5 AND b2.end_utc > ?6)
      AND NOT EXISTS (SELECT 1 FROM blocks WHERE start_utc < ?2 AND end_utc > ?1)`)
    .bind(newStart, newEnd, new Date().toISOString(), booking.id, addMinutes(newEnd, buffer), addMinutes(newStart, -buffer))
    .run().catch((err) => {
      if (String(err).includes("UNIQUE")) return { meta: { changes: 0 } };
      throw err;
    });
  if (!res.meta.changes) return "slot_unavailable";

  await moveMeeting(env, booking.gcal_event_id, newStart, newEnd);
  const updated = { ...booking, start_utc: newStart, end_utc: newEnd, sequence: (booking.sequence || 0) + 1 };
  const notif = await getSetting(env, "notifications");
  const jobs = [];
  if (notify) jobs.push(mailRescheduled(env, { booking: updated, type, token: booking._token || "", ownerTz: av.timezone, by }));
  if (by === "client" && notif.telegram) {
    jobs.push(notifyTelegram(env, `🔁 ${booking.name} rescheduled\nNow: ${fmtWhen(newStart, av.timezone)}\nWas: ${fmtWhen(booking.start_utc, av.timezone)}`));
  }
  await Promise.all(jobs);
  return "";
}

// ---------- Client self-service ----------

async function byToken(env, token) {
  if (!/^[0-9a-f]{48}$/.test(token || "")) return null;
  const row = await env.DB.prepare("SELECT * FROM bookings WHERE manage_token = ?1").bind(await sha256Hex(token)).first();
  if (row) row._token = token;
  return row;
}

function publicView(b, type) {
  return {
    id: b.id, start: b.start_utc, end: b.end_utc, duration: b.duration, status: b.status,
    name: b.name, email: b.email, meetUrl: b.status === "confirmed" ? b.meet_url : "",
    clientTz: b.client_tz, type: { id: type.id, name: type.name, duration: b.duration },
    answers: safeAnswers(b)
  };
}

export async function handleManage(request, env, ctx, headers, ip, path) {
  if (manageLimited(ip)) return json(429, { error: "rate_limited" }, headers);
  const url = new URL(request.url);

  if (path === "/manage" && request.method === "GET") {
    const b = await byToken(env, url.searchParams.get("t"));
    if (!b) return json(404, { error: "not_found" }, headers);
    const type = await typeById(env, b.type_id);
    const upcoming = b.status === "confirmed" && b.start_utc > new Date().toISOString();
    return json(200, { booking: publicView(b, type), canChange: upcoming }, headers);
  }

  // Times the client can move to (their own booking doesn't block itself)
  if (path === "/manage/slots" && request.method === "GET") {
    const b = await byToken(env, url.searchParams.get("t"));
    if (!b) return json(404, { error: "not_found" }, headers);
    const type = await typeById(env, b.type_id);
    const av = await getSetting(env, "availability");
    const slots = await computeSlots(env, { ...type, duration: b.duration }, { excludeId: b.id });
    return json(200, { timezone: av.timezone, slotMinutes: b.duration, slots }, headers);
  }

  if (path === "/manage/ics" && request.method === "GET") {
    const b = await byToken(env, url.searchParams.get("t"));
    if (!b) return json(404, { error: "not_found" }, headers);
    const type = await typeById(env, b.type_id);
    const { buildIcs } = await import("./ics.js");
    const ics = buildIcs({
      booking: b, typeName: type.name, ownerName: env.OWNER_NAME || "Ahmed Eldegla",
      ownerEmail: env.OWNER_EMAIL || "ahmeddagla99@gmail.com", manageUrl: manageUrl(env, b._token),
      method: b.status === "confirmed" ? "REQUEST" : "CANCEL"
    });
    return new Response(ics, {
      headers: { ...headers, "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'attachment; filename="call-with-ahmed.ics"' }
    });
  }

  if (request.method !== "POST") return json(404, { error: "not_found" }, headers);
  const body = await readJson(request);
  const b = await byToken(env, body && body.t);
  if (!b) return json(404, { error: "not_found" }, headers);
  if (b.status !== "confirmed" || b.start_utc <= new Date().toISOString()) return json(409, { error: "not_changeable" }, headers);

  if (path === "/manage/cancel") {
    const ok = await cancelBooking(env, b, { by: "client", reason: clean(body.reason, 500) });
    return json(ok ? 200 : 409, { ok }, headers);
  }
  if (path === "/manage/reschedule") {
    const start = typeof body.start === "string" ? body.start : "";
    const err = await rescheduleBooking(env, b, start, { by: "client" });
    if (err) return json(409, { error: err }, headers);
    const fresh = await env.DB.prepare("SELECT * FROM bookings WHERE id = ?1").bind(b.id).first();
    return json(200, { ok: true, booking: publicView(fresh, await typeById(env, b.type_id)) }, headers);
  }
  return json(404, { error: "not_found" }, headers);
}
