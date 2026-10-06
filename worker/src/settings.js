// Editable settings, stored as JSON in D1 and seeded from these defaults.
// Everything here can be changed from the admin dashboard; no redeploy needed.
import { TIMEZONE, MIN_NOTICE_HOURS, DAYS_AHEAD, WEEKLY_HOURS, BLOCKED_DATES } from "./schedule.js";
import { isValidTz } from "./time.js";

export const DEFAULTS = {
  availability: {
    timezone: TIMEZONE,
    minNoticeHours: MIN_NOTICE_HOURS,
    daysAhead: DAYS_AHEAD,
    bufferMinutes: 10,            // free time kept before and after every call
    maxPerDay: 6,                 // 0 = no limit
    weekly: WEEKLY_HOURS,
    blockedDates: BLOCKED_DATES
  },
  meetingTypes: [
    {
      id: "intro",
      name: "Quick intro",
      duration: 15,
      description: "A short hello to see if we're a good fit.",
      active: true,
      questions: [
        { id: "topic", label: "What would you like to talk about?", type: "textarea", required: false }
      ]
    },
    {
      id: "project",
      name: "Project discussion",
      duration: 30,
      description: "Walk me through your project or role, and we'll scope the next steps.",
      active: true,
      questions: [
        { id: "company", label: "Company or team", type: "text", required: false },
        { id: "kind", label: "What is it about?", type: "select", required: true, options: ["A freelance project", "A full-time role", "A contract role", "Something else"] },
        { id: "topic", label: "Tell me a bit more", type: "textarea", required: true }
      ]
    },
    {
      id: "consult",
      name: "Technical consultation",
      duration: 60,
      description: "A deep dive into a backend problem: .NET, APIs, architecture, performance.",
      active: true,
      questions: [
        { id: "topic", label: "What do you need help with?", type: "textarea", required: true },
        { id: "stack", label: "Stack or repository link", type: "text", required: false }
      ]
    }
  ],
  notifications: {
    telegram: true,               // instant Telegram alert on new bookings and messages
    emailOwner: true,             // email Ahmed on new bookings, changes and messages
    reminders: true               // remind clients 24h and 1h before the call
  }
};

export const KEYS = Object.keys(DEFAULTS);

const cache = new Map();          // per-isolate, short-lived

export async function getSetting(env, key) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 15000) return hit.value;
  let value = DEFAULTS[key];
  if (env.DB) {
    const row = await env.DB.prepare("SELECT value FROM settings WHERE key = ?1").bind(key).first();
    if (row) {
      try { value = JSON.parse(row.value); } catch {}
    }
  }
  cache.set(key, { at: Date.now(), value });
  return value;
}

export async function putSetting(env, key, value) {
  await env.DB
    .prepare("INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = ?3")
    .bind(key, JSON.stringify(value), new Date().toISOString())
    .run();
  cache.set(key, { at: Date.now(), value });
}

export async function activeTypes(env) {
  const types = await getSetting(env, "meetingTypes");
  return types.filter((t) => t.active);
}

// ---------- Validation (admin input) ----------

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const int = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
const str = (v, max) => typeof v === "string" && v.trim().length > 0 && v.length <= max;

export function validate(key, v) {
  if (key === "availability") {
    if (!v || typeof v !== "object") return "invalid";
    if (!isValidTz(v.timezone)) return "Unknown timezone";
    if (!int(v.minNoticeHours, 0, 720)) return "Minimum notice must be 0–720 hours";
    if (!int(v.daysAhead, 1, 120)) return "Booking window must be 1–120 days";
    if (!int(v.bufferMinutes, 0, 120)) return "Buffer must be 0–120 minutes";
    if (!int(v.maxPerDay, 0, 50)) return "Max calls per day must be 0–50";
    if (!v.weekly || typeof v.weekly !== "object") return "Weekly hours missing";
    for (let d = 0; d < 7; d++) {
      const day = v.weekly[d] || [];
      if (!Array.isArray(day)) return "Weekly hours are malformed";
      for (const w of day) {
        if (!Array.isArray(w) || !HHMM.test(w[0]) || !HHMM.test(w[1]) || w[0] >= w[1]) return "Each time window needs a start before its end";
      }
    }
    if (!Array.isArray(v.blockedDates) || !v.blockedDates.every((d) => DATE.test(d))) return "Days off must be YYYY-MM-DD dates";
    return "";
  }
  if (key === "meetingTypes") {
    if (!Array.isArray(v) || !v.length || v.length > 12) return "Add between 1 and 12 meeting types";
    const ids = new Set();
    for (const t of v) {
      if (!t || !/^[a-z0-9-]{2,30}$/.test(t.id || "")) return "Each meeting type needs a short id (a-z, 0-9, -)";
      if (ids.has(t.id)) return `Duplicate id "${t.id}"`;
      ids.add(t.id);
      if (!str(t.name, 60)) return "Each meeting type needs a name";
      if (![15, 20, 30, 45, 60, 90, 120].includes(t.duration)) return "Duration must be 15, 20, 30, 45, 60, 90 or 120 minutes";
      if (typeof t.description !== "string" || t.description.length > 300) return "Description is too long";
      if (typeof t.active !== "boolean") return "invalid";
      if (!Array.isArray(t.questions) || t.questions.length > 8) return "Up to 8 questions per meeting type";
      const qids = new Set();
      for (const q of t.questions) {
        if (!q || !/^[a-z0-9_]{1,30}$/.test(q.id || "") || qids.has(q.id)) return "Each question needs a unique id";
        qids.add(q.id);
        if (!str(q.label, 120)) return "Each question needs a label";
        if (!["text", "textarea", "select"].includes(q.type)) return "Question type must be text, textarea or select";
        if (typeof q.required !== "boolean") return "invalid";
        if (q.type === "select" && (!Array.isArray(q.options) || !q.options.length || !q.options.every((o) => str(o, 80)))) return "Choice questions need options";
      }
    }
    if (!v.some((t) => t.active)) return "Keep at least one meeting type active";
    return "";
  }
  if (key === "notifications") {
    if (!v || ["telegram", "emailOwner", "reminders"].some((k) => typeof v[k] !== "boolean")) return "invalid";
    return "";
  }
  return "unknown_setting";
}
