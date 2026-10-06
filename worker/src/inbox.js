// Contact form + AI-assistant leads (saved to the admin inbox) and privacy-friendly analytics.
import { json, readJson, makeLimiter } from "./http.js";
import { notifyTelegram } from "./notify.js";
import { getSetting } from "./settings.js";
import { mailEnabled, mailOwnerMessage } from "./mail.js";

const contactLimited = makeLimiter(6, 60 * 60 * 1000);
const trackLimited = makeLimiter(150, 10 * 60 * 1000);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const clean = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function handleContact(request, env, ctx, headers, ip) {
  if (contactLimited(ip)) return json(429, { error: "rate_limited" }, headers);
  const body = await readJson(request);
  if (!body) return json(400, { error: "bad_json" }, headers);
  if (body.website) return json(200, { ok: true }, headers);   // honeypot

  const kind = body.kind === "lead" ? "lead" : "contact";
  const name = clean(body.name, 100).replace(/\s+/g, " ");
  const email = clean(body.email, 200).toLowerCase();
  const message = clean(body.message, 5000);
  if (!name || !EMAIL_RE.test(email) || !message) return json(400, { error: "invalid" }, headers);

  const id = crypto.randomUUID();
  await env.DB
    .prepare("INSERT INTO messages (id, kind, name, email, body, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
    .bind(id, kind, name, email, message, new Date().toISOString())
    .run();

  const notif = await getSetting(env, "notifications");
  ctx.waitUntil(Promise.all([
    notif.emailOwner ? mailOwnerMessage(env, { kind, name, email, body: message }) : null,
    notif.telegram ? notifyTelegram(env, `${kind === "lead" ? "🤖 New lead from the AI assistant" : "✉️ New message"}\n👤 ${name}\n✉️ ${email}\n\n${message.slice(0, 1500)}`) : null
  ]));
  return json(200, { ok: true, emailed: mailEnabled(env) && notif.emailOwner }, headers);
}

const EVENT_TYPES = new Set(["pageview", "section", "book_open", "book_done", "chat_open", "contact"]);

export async function handleTrack(request, env, headers, ip) {
  if (trackLimited(ip)) return new Response(null, { status: 204, headers });
  let body = null;
  try { body = JSON.parse(await request.text()); } catch {}
  if (!body || !EVENT_TYPES.has(body.type)) return new Response(null, { status: 204, headers });

  let referrer = "";
  try { referrer = body.ref ? new URL(body.ref).hostname.replace(/^www\./, "") : ""; } catch {}
  const device = ["mobile", "tablet", "desktop"].includes(body.device) ? body.device : "";
  await env.DB
    .prepare("INSERT INTO events (type, name, path, referrer, country, device, visitor, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)")
    .bind(body.type, clean(body.name, 60), clean(body.path, 200), referrer.slice(0, 100),
      (request.cf && request.cf.country) || "", device, clean(body.vid, 40), new Date().toISOString())
    .run();
  return new Response(null, { status: 204, headers });
}
