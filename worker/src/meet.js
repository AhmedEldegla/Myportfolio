// Meeting links.
// With Google connected (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN secrets),
// every booking becomes an event in Ahmed's Google Calendar with a Google Meet link, and his
// busy times are hidden from visitors. Without Google, each booking gets a private Jitsi room.

const CAL_API = "https://www.googleapis.com/calendar/v3";

export const googleEnabled = (env) =>
  Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REFRESH_TOKEN);

const calendarId = (env) => encodeURIComponent(env.GOOGLE_CALENDAR_ID || "primary");

let tokenCache = { token: "", exp: 0 };
async function accessToken(env) {
  if (tokenCache.token && Date.now() < tokenCache.exp - 60000) return tokenCache.token;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: env.GOOGLE_REFRESH_TOKEN,
      grant_type: "refresh_token"
    })
  });
  if (!res.ok) throw new Error(`google_token_${res.status}`);
  const data = await res.json();
  tokenCache = { token: data.access_token, exp: Date.now() + (data.expires_in || 3600) * 1000 };
  return tokenCache.token;
}

async function gcal(env, method, path, body) {
  const res = await fetch(CAL_API + path, {
    method,
    headers: { Authorization: `Bearer ${await accessToken(env)}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok && !(method === "DELETE" && (res.status === 404 || res.status === 410))) {
    throw new Error(`google_${method}_${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  }
  return res.status === 204 || method === "DELETE" ? null : res.json();
}

function jitsiUrl() {
  const id = [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(36).padStart(2, "0")).join("").slice(0, 12);
  return `https://meet.jit.si/AhmedEldegla-${id}`;
}

// Returns { meetUrl, eventId }. Never throws: falls back to Jitsi if Google fails.
export async function createMeeting(env, b) {
  if (googleEnabled(env)) {
    try {
      const ev = await gcal(env, "POST", `/calendars/${calendarId(env)}/events?conferenceDataVersion=1&sendUpdates=none`, {
        summary: `${b.typeName}: ${b.name}`,
        description: `${b.typeName} booked from ahmedeldegla.com\n\nWith: ${b.name} <${b.email}>\n\n${b.summary || ""}`.trim(),
        start: { dateTime: b.start },
        end: { dateTime: b.end },
        attendees: [{ email: b.email, displayName: b.name }],
        conferenceData: { createRequest: { requestId: b.id, conferenceSolutionKey: { type: "hangoutsMeet" } } },
        reminders: { useDefault: true }
      });
      const meet = ev.hangoutLink
        || (ev.conferenceData?.entryPoints || []).find((p) => p.entryPointType === "video")?.uri;
      if (meet) return { meetUrl: meet, eventId: ev.id };
      return { meetUrl: jitsiUrl(), eventId: ev.id };
    } catch (err) {
      console.error("Google Calendar create failed, using Jitsi", err);
    }
  }
  return { meetUrl: jitsiUrl(), eventId: "" };
}

export async function moveMeeting(env, eventId, start, end) {
  if (!eventId || !googleEnabled(env)) return;
  try {
    await gcal(env, "PATCH", `/calendars/${calendarId(env)}/events/${encodeURIComponent(eventId)}?sendUpdates=none`, {
      start: { dateTime: start }, end: { dateTime: end }
    });
  } catch (err) {
    console.error("Google Calendar move failed", err);
  }
}

export async function cancelMeeting(env, eventId) {
  if (!eventId || !googleEnabled(env)) return;
  try {
    await gcal(env, "DELETE", `/calendars/${calendarId(env)}/events/${encodeURIComponent(eventId)}?sendUpdates=none`);
  } catch (err) {
    console.error("Google Calendar delete failed", err);
  }
}

// Busy intervals from Ahmed's Google Calendar, cached briefly. Empty when Google isn't set up.
let busyCache = { key: "", at: 0, busy: [] };
export async function googleBusy(env, fromIso, toIso) {
  if (!googleEnabled(env)) return [];
  const key = `${fromIso}|${toIso}`;
  if (busyCache.key === key && Date.now() - busyCache.at < 60000) return busyCache.busy;
  try {
    const id = env.GOOGLE_CALENDAR_ID || "primary";
    const data = await gcal(env, "POST", "/freeBusy", { timeMin: fromIso, timeMax: toIso, items: [{ id }] });
    const busy = (data.calendars?.[id]?.busy || []).map((x) => ({
      start: new Date(x.start).toISOString(),
      end: new Date(x.end).toISOString()
    }));
    busyCache = { key, at: Date.now(), busy };
    return busy;
  } catch (err) {
    console.error("Google free/busy failed", err);
    return [];
  }
}
