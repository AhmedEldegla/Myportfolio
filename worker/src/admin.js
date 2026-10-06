// Admin API behind a session token (see auth.js). Powers admin.html.
import { json, readJson, makeLimiter } from "./http.js";
import { isAdmin } from "./auth.js";
import { getSetting, putSetting, validate, KEYS } from "./settings.js";
import { cancelBooking, rescheduleBooking } from "./booking.js";
import { localToIso, addMinutes } from "./time.js";
import { googleEnabled } from "./meet.js";
import { mailEnabled, safeAnswers } from "./mail.js";

const adminLimited = makeLimiter(300, 10 * 60 * 1000);
const DAY = 86400000;
const iso = (ms) => new Date(ms).toISOString();
const STATUSES = ["confirmed", "completed", "no_show", "cancelled"];

function integrations(env) {
  return {
    google: googleEnabled(env),
    email: mailEnabled(env),
    telegram: Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID),
    ai: Boolean(env.GEMINI_API_KEY)
  };
}

async function typeMap(env) {
  const types = await getSetting(env, "meetingTypes");
  return Object.fromEntries(types.map((t) => [t.id, t]));
}

function shapeBooking(b, types) {
  const t = types[b.type_id];
  return {
    id: b.id, start: b.start_utc, end: b.end_utc, duration: b.duration, status: b.status,
    name: b.name, email: b.email, clientTz: b.client_tz, meetUrl: b.meet_url,
    type: { id: b.type_id, name: t ? t.name : b.type_id },
    answers: safeAnswers(b), questions: t ? t.questions : [],
    notes: b.notes, cancelReason: b.cancel_reason, cancelledBy: b.cancelled_by,
    createdAt: b.created_at, updatedAt: b.updated_at, calendarSynced: Boolean(b.gcal_event_id)
  };
}

// ---------- Overview ----------

async function overview(env) {
  const now = Date.now();
  const n = iso(now);
  const db = env.DB;
  const first = (sql, ...args) => db.prepare(sql).bind(...args).first();
  const all = (sql, ...args) => db.prepare(sql).bind(...args).all().then((r) => r.results);

  const [upcoming, week, last30, prev30, vis30, visPrev, newMsgs, chats30, created84, views30, nextList, recentB, recentM, recentC, types] = await Promise.all([
    first("SELECT COUNT(*) n FROM bookings WHERE status='confirmed' AND start_utc > ?1", n),
    first("SELECT COUNT(*) n FROM bookings WHERE status='confirmed' AND start_utc > ?1 AND start_utc <= ?2", n, iso(now + 7 * DAY)),
    first("SELECT COUNT(*) n FROM bookings WHERE created_at >= ?1", iso(now - 30 * DAY)),
    first("SELECT COUNT(*) n FROM bookings WHERE created_at >= ?1 AND created_at < ?2", iso(now - 60 * DAY), iso(now - 30 * DAY)),
    first("SELECT COUNT(DISTINCT visitor) n FROM events WHERE type='pageview' AND created_at >= ?1", iso(now - 30 * DAY)),
    first("SELECT COUNT(DISTINCT visitor) n FROM events WHERE type='pageview' AND created_at >= ?1 AND created_at < ?2", iso(now - 60 * DAY), iso(now - 30 * DAY)),
    first("SELECT COUNT(*) n FROM messages WHERE status='new'"),
    first("SELECT COUNT(DISTINCT session_id) n FROM chat_messages WHERE created_at >= ?1", iso(now - 30 * DAY)),
    all("SELECT created_at FROM bookings WHERE created_at >= ?1", iso(now - 84 * DAY)),
    all("SELECT substr(created_at,1,10) d, COUNT(DISTINCT visitor) v FROM events WHERE type='pageview' AND created_at >= ?1 GROUP BY d", iso(now - 30 * DAY)),
    all("SELECT * FROM bookings WHERE status='confirmed' AND start_utc > ?1 ORDER BY start_utc LIMIT 6", n),
    all("SELECT id, name, status, start_utc, created_at, updated_at, cancelled_by FROM bookings ORDER BY COALESCE(NULLIF(updated_at,''), created_at) DESC LIMIT 10"),
    all("SELECT id, kind, name, created_at FROM messages ORDER BY created_at DESC LIMIT 6"),
    all("SELECT session_id, MIN(created_at) created_at, (SELECT content FROM chat_messages c2 WHERE c2.session_id = c.session_id AND role='user' ORDER BY id LIMIT 1) q FROM chat_messages c GROUP BY session_id ORDER BY MAX(id) DESC LIMIT 6"),
    typeMap(env)
  ]);

  // Bookings created per week, oldest first (12 weeks)
  const weeks = Array.from({ length: 12 }, (_, i) => ({ start: iso(now - (12 - i) * 7 * DAY), count: 0 }));
  for (const r of created84) {
    const idx = Math.floor((Date.parse(r.created_at) - (now - 84 * DAY)) / (7 * DAY));
    if (weeks[idx]) weeks[idx].count++;
  }
  const visitsByDay = Object.fromEntries(views30.map((r) => [r.d, r.v]));
  const visits = Array.from({ length: 30 }, (_, i) => {
    const d = iso(now - (29 - i) * DAY).slice(0, 10);
    return { date: d, visitors: visitsByDay[d] || 0 };
  });

  const activity = [
    ...recentB.map((b) => b.status === "cancelled"
      ? { kind: "cancelled", at: b.updated_at || b.created_at, text: `${b.name} cancelled${b.cancelled_by === "admin" ? " (by you)" : ""}`, ref: `#/bookings/${b.id}` }
      : { kind: "booking", at: b.created_at, text: `${b.name} booked a call`, ref: `#/bookings/${b.id}` }),
    ...recentM.map((m) => ({ kind: m.kind === "lead" ? "lead" : "message", at: m.created_at, text: m.kind === "lead" ? `AI assistant captured a lead: ${m.name}` : `Message from ${m.name}`, ref: "#/inbox" })),
    ...recentC.map((c) => ({ kind: "chat", at: c.created_at, text: `Chat: “${(c.q || "").slice(0, 70)}”`, ref: `#/chats/${c.session_id}` }))
  ].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 12);

  return {
    kpis: {
      upcoming: upcoming.n, nextWeek: week.n,
      bookings30: last30.n, bookingsPrev30: prev30.n,
      visitors30: vis30.n, visitorsPrev30: visPrev.n,
      newMessages: newMsgs.n, chats30: chats30.n
    },
    weeks, visits,
    upcoming: nextList.map((b) => shapeBooking(b, types)),
    activity
  };
}

// ---------- Analytics ----------

async function analytics(env, days) {
  const since = iso(Date.now() - days * DAY);
  const all = (sql) => env.DB.prepare(sql).bind(since).all().then((r) => r.results);
  const [daily, sections, refs, devices, countries, funnel] = await Promise.all([
    all("SELECT substr(created_at,1,10) d, COUNT(*) views, COUNT(DISTINCT visitor) visitors FROM events WHERE type='pageview' AND created_at >= ?1 GROUP BY d ORDER BY d"),
    all("SELECT name, COUNT(DISTINCT visitor) n FROM events WHERE type='section' AND created_at >= ?1 GROUP BY name ORDER BY n DESC"),
    all("SELECT referrer name, COUNT(DISTINCT visitor) n FROM events WHERE type='pageview' AND created_at >= ?1 GROUP BY referrer ORDER BY n DESC LIMIT 8"),
    all("SELECT device name, COUNT(DISTINCT visitor) n FROM events WHERE type='pageview' AND created_at >= ?1 GROUP BY device ORDER BY n DESC"),
    all("SELECT country name, COUNT(DISTINCT visitor) n FROM events WHERE type='pageview' AND created_at >= ?1 GROUP BY country ORDER BY n DESC LIMIT 8"),
    all("SELECT type, COUNT(DISTINCT visitor) n FROM events WHERE created_at >= ?1 GROUP BY type")
  ]);
  const byDay = Object.fromEntries(daily.map((r) => [r.d, r]));
  const series = Array.from({ length: days }, (_, i) => {
    const d = iso(Date.now() - (days - 1 - i) * DAY).slice(0, 10);
    return { date: d, views: byDay[d]?.views || 0, visitors: byDay[d]?.visitors || 0 };
  });
  const f = Object.fromEntries(funnel.map((r) => [r.type, r.n]));
  return {
    days, series,
    totals: { views: series.reduce((s, r) => s + r.views, 0), visitors: f.pageview || 0 },
    sections, referrers: refs.map((r) => ({ name: r.name || "Direct", n: r.n })),
    devices: devices.map((r) => ({ name: r.name || "Unknown", n: r.n })),
    countries: countries.map((r) => ({ name: r.name || "Unknown", n: r.n })),
    funnel: { visitors: f.pageview || 0, openedBooking: f.book_open || 0, booked: f.book_done || 0, chatted: f.chat_open || 0, contacted: f.contact || 0 }
  };
}

// ---------- Router ----------

export async function handleAdmin(request, env, ctx, headers, ip, path) {
  if (!env.DB) return json(503, { error: "not_configured" }, headers);
  if (adminLimited(ip)) return json(429, { error: "rate_limited" }, headers);
  if (!(await isAdmin(request, env))) return json(401, { error: "unauthorized" }, headers);

  const url = new URL(request.url);
  const q = url.searchParams;
  const method = request.method;
  const db = env.DB;
  let m;

  if (path === "/admin/me" && method === "GET") {
    const av = await getSetting(env, "availability");
    return json(200, {
      owner: { name: env.OWNER_NAME || "Ahmed Eldegla", email: env.OWNER_EMAIL || "ahmeddagla99@gmail.com" },
      timezone: av.timezone, integrations: integrations(env), site: env.SITE_URL || ""
    }, headers);
  }

  if (path === "/admin/overview" && method === "GET") return json(200, await overview(env), headers);

  if (path === "/admin/analytics" && method === "GET") {
    const days = [7, 30, 90].includes(Number(q.get("days"))) ? Number(q.get("days")) : 30;
    return json(200, await analytics(env, days), headers);
  }

  // ----- Bookings -----
  if (path === "/admin/bookings" && method === "GET") {
    const scope = q.get("scope") || "upcoming";
    const where = [];
    const args = [];
    const now = iso(Date.now());
    if (scope === "upcoming") { where.push(`start_utc >= ?${args.push(now)}`); }
    if (scope === "past") { where.push(`start_utc < ?${args.push(now)}`); }
    if (STATUSES.includes(q.get("status"))) where.push(`status = ?${args.push(q.get("status"))}`);
    if (q.get("type")) where.push(`type_id = ?${args.push(q.get("type"))}`);
    if (q.get("q")) {
      const like = `%${q.get("q").toLowerCase().slice(0, 80)}%`;
      where.push(`(lower(name) LIKE ?${args.push(like)} OR lower(email) LIKE ?${args.length} OR lower(answers) LIKE ?${args.length})`);
    }
    const order = scope === "upcoming" ? "ASC" : "DESC";
    const { results } = await db
      .prepare(`SELECT * FROM bookings ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY start_utc ${order} LIMIT 300`)
      .bind(...args).all();
    const types = await typeMap(env);
    const counts = await db.prepare("SELECT status, COUNT(*) n FROM bookings GROUP BY status").all();
    return json(200, { bookings: results.map((b) => shapeBooking(b, types)), counts: Object.fromEntries(counts.results.map((r) => [r.status, r.n])) }, headers);
  }

  if (path === "/admin/bookings.csv" && method === "GET") {
    const { results } = await db.prepare("SELECT * FROM bookings ORDER BY start_utc DESC").all();
    const types = await typeMap(env);
    const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = [["Start (UTC)", "End (UTC)", "Type", "Status", "Name", "Email", "Client timezone", "Answers", "Notes", "Meeting link", "Booked at"]]
      .concat(results.map((b) => [b.start_utc, b.end_utc, types[b.type_id]?.name || b.type_id, b.status, b.name, b.email, b.client_tz,
        Object.entries(safeAnswers(b)).map(([k, v]) => `${k}: ${v}`).join(" | "), b.notes, b.meet_url, b.created_at]));
    return new Response(rows.map((r) => r.map(cell).join(",")).join("\r\n"), {
      headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="bookings.csv"' }
    });
  }

  if ((m = path.match(/^\/admin\/bookings\/([0-9a-f-]{36})(\/cancel|\/reschedule)?$/))) {
    const b = await db.prepare("SELECT * FROM bookings WHERE id = ?1").bind(m[1]).first();
    if (!b) return json(404, { error: "not_found" }, headers);
    const types = await typeMap(env);

    if (!m[2] && method === "GET") return json(200, { booking: shapeBooking(b, types) }, headers);

    if (!m[2] && method === "PATCH") {
      const body = (await readJson(request)) || {};
      const sets = [];
      const args = [];
      if (typeof body.notes === "string") sets.push(`notes = ?${args.push(body.notes.slice(0, 5000))}`);
      if (body.status && ["confirmed", "completed", "no_show"].includes(body.status) && b.status !== "cancelled") {
        sets.push(`status = ?${args.push(body.status)}`);
      }
      if (!sets.length) return json(400, { error: "nothing_to_update" }, headers);
      sets.push(`updated_at = ?${args.push(iso(Date.now()))}`);
      await db.prepare(`UPDATE bookings SET ${sets.join(", ")} WHERE id = ?${args.push(b.id)}`).bind(...args).run();
      const fresh = await db.prepare("SELECT * FROM bookings WHERE id = ?1").bind(b.id).first();
      return json(200, { booking: shapeBooking(fresh, types) }, headers);
    }

    if (m[2] === "/cancel" && method === "POST") {
      const body = (await readJson(request)) || {};
      const ok = await cancelBooking(env, b, { by: "admin", reason: typeof body.reason === "string" ? body.reason : "", notify: body.notify !== false });
      return json(ok ? 200 : 409, { ok }, headers);
    }

    if (m[2] === "/reschedule" && method === "POST") {
      const body = (await readJson(request)) || {};
      const av = await getSetting(env, "availability");
      const start = localToIso(body.date, body.time, av.timezone);
      if (!start) return json(400, { error: "bad_time" }, headers);
      if (start <= iso(Date.now())) return json(400, { error: "in_the_past" }, headers);
      const err = await rescheduleBooking(env, b, start, { by: "admin", notify: body.notify !== false, force: true });
      if (err) return json(409, { error: err }, headers);
      const fresh = await db.prepare("SELECT * FROM bookings WHERE id = ?1").bind(b.id).first();
      return json(200, { booking: shapeBooking(fresh, types) }, headers);
    }
  }

  // ----- Calendar & time off -----
  if (path === "/admin/calendar" && method === "GET") {
    const from = q.get("from"), to = q.get("to");
    if (Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) return json(400, { error: "bad_range" }, headers);
    const [bk, bl, av, types] = await Promise.all([
      db.prepare("SELECT * FROM bookings WHERE status <> 'cancelled' AND end_utc > ?1 AND start_utc < ?2 ORDER BY start_utc").bind(from, to).all(),
      db.prepare("SELECT * FROM blocks WHERE end_utc > ?1 AND start_utc < ?2 ORDER BY start_utc").bind(from, to).all(),
      getSetting(env, "availability"),
      typeMap(env)
    ]);
    return json(200, {
      timezone: av.timezone, weekly: av.weekly, blockedDates: av.blockedDates,
      bookings: bk.results.map((b) => shapeBooking(b, types)),
      blocks: bl.results.map((x) => ({ id: x.id, start: x.start_utc, end: x.end_utc, reason: x.reason }))
    }, headers);
  }

  if (path === "/admin/blocks" && method === "POST") {
    const body = (await readJson(request)) || {};
    const av = await getSetting(env, "availability");
    const endDate = body.endDate || body.date;
    const start = localToIso(body.date, body.allDay ? "00:00" : body.from, av.timezone);
    let end = localToIso(endDate, body.allDay ? "00:00" : body.to, av.timezone);
    if (body.allDay && end) end = addMinutes(end, 24 * 60);
    if (!start || !end || end <= start) return json(400, { error: "bad_range" }, headers);
    const id = crypto.randomUUID();
    await db.prepare("INSERT INTO blocks (id, start_utc, end_utc, reason, created_at) VALUES (?1, ?2, ?3, ?4, ?5)")
      .bind(id, start, end, typeof body.reason === "string" ? body.reason.slice(0, 200) : "", iso(Date.now())).run();
    return json(200, { block: { id, start, end, reason: body.reason || "" } }, headers);
  }

  if ((m = path.match(/^\/admin\/blocks\/([0-9a-f-]{36})$/)) && method === "DELETE") {
    await db.prepare("DELETE FROM blocks WHERE id = ?1").bind(m[1]).run();
    return json(200, { ok: true }, headers);
  }

  // ----- Settings -----
  if (path === "/admin/settings" && method === "GET") {
    const [availability, meetingTypes, notifications] = await Promise.all(KEYS.map((k) => getSetting(env, k)));
    return json(200, { availability, meetingTypes, notifications, integrations: integrations(env) }, headers);
  }

  if ((m = path.match(/^\/admin\/settings\/(availability|meetingTypes|notifications)$/)) && method === "PUT") {
    const body = await readJson(request);
    const value = body && body.value;
    const err = validate(m[1], value);
    if (err) return json(400, { error: "invalid", message: err }, headers);
    await putSetting(env, m[1], value);
    return json(200, { ok: true, value }, headers);
  }

  // ----- Inbox -----
  if (path === "/admin/messages" && method === "GET") {
    const status = q.get("status");
    const { results } = await db
      .prepare(status && ["new", "read", "replied", "archived"].includes(status)
        ? "SELECT * FROM messages WHERE status = ?1 ORDER BY created_at DESC LIMIT 300"
        : "SELECT * FROM messages WHERE status <> 'archived' ORDER BY created_at DESC LIMIT 300")
      .bind(...(status && ["new", "read", "replied", "archived"].includes(status) ? [status] : []))
      .all();
    return json(200, { messages: results }, headers);
  }

  if ((m = path.match(/^\/admin\/messages\/([0-9a-f-]{36})$/))) {
    if (method === "PATCH") {
      const body = (await readJson(request)) || {};
      if (!["new", "read", "replied", "archived"].includes(body.status)) return json(400, { error: "bad_status" }, headers);
      await db.prepare("UPDATE messages SET status = ?1 WHERE id = ?2").bind(body.status, m[1]).run();
      return json(200, { ok: true }, headers);
    }
    if (method === "DELETE") {
      await db.prepare("DELETE FROM messages WHERE id = ?1").bind(m[1]).run();
      return json(200, { ok: true }, headers);
    }
  }

  // ----- AI chats -----
  if (path === "/admin/chats" && method === "GET") {
    const { results } = await db.prepare(`
      SELECT session_id, MIN(created_at) started, MAX(created_at) last, COUNT(*) n,
        (SELECT content FROM chat_messages c2 WHERE c2.session_id = c.session_id AND role = 'user' ORDER BY id LIMIT 1) first
      FROM chat_messages c GROUP BY session_id ORDER BY MAX(id) DESC LIMIT 200`).all();
    return json(200, { chats: results }, headers);
  }

  if ((m = path.match(/^\/admin\/chats\/([a-z0-9]{8,40})$/))) {
    if (method === "GET") {
      const { results } = await db.prepare("SELECT role, content, created_at FROM chat_messages WHERE session_id = ?1 ORDER BY id").bind(m[1]).all();
      return json(200, { messages: results }, headers);
    }
    if (method === "DELETE") {
      await db.prepare("DELETE FROM chat_messages WHERE session_id = ?1").bind(m[1]).run();
      return json(200, { ok: true }, headers);
    }
  }

  return json(404, { error: "not_found" }, headers);
}
