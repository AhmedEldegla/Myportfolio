import { corsHeaders, json } from "./http.js";
import { handleChat } from "./chat.js";
import { handleSlots, handleBook, handleAdmin } from "./booking.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin, env);
    const ip = request.headers.get("CF-Connecting-IP") || "local";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: cors.ok ? 204 : 403, headers: cors.headers });
    }
    if (!cors.ok) {
      return json(403, { error: "forbidden_origin" }, cors.headers);
    }

    try {
      if (path === "/chat" && request.method === "POST") return await handleChat(request, env, cors.headers, ip);
      if (path === "/slots" && request.method === "GET") return await handleSlots(env, cors.headers);
      if (path === "/book" && request.method === "POST") return await handleBook(request, env, ctx, cors.headers, ip);
      if (path.startsWith("/admin/")) return await handleAdmin(request, env, cors.headers, ip, path);
    } catch (err) {
      console.error("Unhandled error", path, err);
      return json(500, { error: "server_error" }, cors.headers);
    }

    return json(404, { error: "not_found" }, cors.headers);
  }
};
