// Admin sign-in. The password is only ever checked once, at login; after that the
// dashboard uses a random session token. Only a hash of the token is stored.
import { json, readJson, makeLimiter } from "./http.js";

const SESSION_DAYS = 7;
const loginLimited = makeLimiter(8, 15 * 60 * 1000);   // 8 attempts per IP per 15 minutes

const enc = new TextEncoder();
export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomToken(bytes = 32) {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Compare hashes in constant time so response timing doesn't leak the password
async function passwordMatches(given, expected) {
  const [a, b] = await Promise.all([sha256Hex(given), sha256Hex(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function handleLogin(request, env, headers, ip) {
  if (!env.ADMIN_PASSWORD) return json(503, { error: "admin_not_configured" }, headers);
  if (loginLimited(ip)) return json(429, { error: "rate_limited" }, headers);
  const body = await readJson(request);
  const password = body && typeof body.password === "string" ? body.password : "";
  if (!password || !(await passwordMatches(password, env.ADMIN_PASSWORD))) {
    return json(401, { error: "wrong_password" }, headers);
  }
  const token = randomToken();
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 86400000);
  await env.DB
    .prepare("INSERT INTO sessions (token_hash, created_at, expires_at, user_agent) VALUES (?1, ?2, ?3, ?4)")
    .bind(await sha256Hex(token), now.toISOString(), expires.toISOString(), (request.headers.get("User-Agent") || "").slice(0, 200))
    .run();
  return json(200, { token, expiresAt: expires.toISOString() }, headers);
}

function bearer(request) {
  const auth = request.headers.get("Authorization") || "";
  return auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
}

export async function isAdmin(request, env) {
  const token = bearer(request);
  if (!/^[0-9a-f]{64}$/.test(token)) return false;
  const row = await env.DB
    .prepare("SELECT expires_at FROM sessions WHERE token_hash = ?1")
    .bind(await sha256Hex(token))
    .first();
  return Boolean(row && row.expires_at > new Date().toISOString());
}

export async function handleLogout(request, env, headers) {
  const token = bearer(request);
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?1").bind(await sha256Hex(token)).run();
  return json(200, { ok: true }, headers);
}
