import { corsHeaders, json } from "./http.js";
import { handleChat } from "./chat.js";
import { handleConfig, handleSlots, handleBook, handleManage } from "./booking.js";
import { handleContact, handleTrack } from "./inbox.js";
import { handleLogin, handleLogout } from "./auth.js";
import { handleAdmin } from "./admin.js";
import { runScheduled } from "./cron.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin, env);
    const ip = request.headers.get("CF-Connecting-IP") || "local";
    const method = request.method;

    if (method === "OPTIONS") {
      return new Response(null, { status: cors.ok ? 204 : 403, headers: cors.headers });
    }
    // Calendar files are opened straight from email links, so they don't send an Origin
    const originFree = path === "/manage/ics" && method === "GET";
    if (!cors.ok && !originFree) {
      return json(403, { error: "forbidden_origin" }, cors.headers);
    }

    try {
      if (path === "/chat" && method === "POST") return await handleChat(request, env, ctx, cors.headers, ip);
      if (path === "/booking/config" && method === "GET") return await handleConfig(env, cors.headers);
      if (path === "/slots" && method === "GET") return await handleSlots(request, env, cors.headers);
      if (path === "/book" && method === "POST") return await handleBook(request, env, ctx, cors.headers, ip);
      if (path === "/manage" || path.startsWith("/manage/")) return await handleManage(request, env, ctx, cors.headers, ip, path);
      if (path === "/contact" && method === "POST") return await handleContact(request, env, ctx, cors.headers, ip);
      if (path === "/track" && method === "POST") return await handleTrack(request, env, cors.headers, ip);
      if (path === "/admin/login" && method === "POST") return await handleLogin(request, env, cors.headers, ip);
      if (path === "/admin/logout" && method === "POST") return await handleLogout(request, env, cors.headers);
      if (path.startsWith("/admin/")) return await handleAdmin(request, env, ctx, cors.headers, ip, path);
    } catch (err) {
      console.error("Unhandled error", path, err);
      return json(500, { error: "server_error" }, cors.headers);
    }

    return json(404, { error: "not_found" }, cors.headers);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runScheduled(env));
  }
};
