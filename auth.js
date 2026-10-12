// Accounts: sign in, sign up, and an authenticated fetch that renews the session by itself.
// The session (short-lived access token + rotating refresh token) lives in localStorage and is
// shared by every tab; renewals are serialized across tabs so two tabs never use the same token.
window.AEAuth = (() => {
  const API = window.AE_API;
  const KEY = "ae_session";
  const listeners = new Set();
  let session = read();

  function read() {
    try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; }
  }
  function write(s) {
    session = s;
    try { s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY); } catch {}
    listeners.forEach((cb) => { try { cb(session?.user || null); } catch {} });
  }
  // Another tab signed in, out, or renewed
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY) return;
    session = read();
    listeners.forEach((cb) => { try { cb(session?.user || null); } catch {} });
  });

  const fromResponse = (r) => ({
    accessToken: r.accessToken, accessExpiresAt: r.accessExpiresAt,
    refreshToken: r.refreshToken, refreshExpiresAt: r.refreshExpiresAt, user: r.user
  });

  class ApiError extends Error {
    constructor(status, data) {
      super((data && (data.message || data.error)) || `Request failed (${status})`);
      this.status = status;
      this.code = data?.error || "";
      this.field = data?.field || "";
      this.data = data;
    }
  }

  async function call(path, { method = "GET", body, token } = {}) {
    const headers = {};
    if (body !== undefined && !(body instanceof FormData)) headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = "Bearer " + token;
    let res;
    try {
      res = await fetch(API + path, { method, headers, body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined });
    } catch {
      throw new ApiError(0, { error: "network", message: "Can't reach the server. Check your connection and try again." });
    }
    const isJson = res.headers.get("Content-Type")?.includes("json");
    const data = isJson ? await res.json().catch(() => null) : null;
    if (!res.ok) throw new ApiError(res.status, data);
    return isJson ? data : res;
  }

  let renewing = null;
  async function renew() {
    if (renewing) return renewing;
    const run = async () => {
      // Another tab may have renewed while we waited for the lock
      const latest = read();
      if (latest && session && latest.refreshToken !== session.refreshToken && Date.parse(latest.accessExpiresAt) - Date.now() > 30000) {
        session = latest;
        return session;
      }
      const current = latest || session;
      if (!current?.refreshToken) return null;
      try {
        write(fromResponse(await call("/auth/refresh", { method: "POST", body: { refreshToken: current.refreshToken } })));
        return session;
      } catch (err) {
        if (err.status === 401) write(null);
        throw err;
      }
    };
    renewing = (navigator.locks ? navigator.locks.request("ae_session_renew", run) : run()).finally(() => { renewing = null; });
    return renewing;
  }

  /** A valid access token, renewing it if it expires within a minute. Null when signed out. */
  async function accessToken() {
    if (!session) session = read();
    if (!session) return null;
    if (Date.parse(session.accessExpiresAt) - Date.now() < 60000) {
      try { await renew(); } catch (err) { if (err.status === 401) return null; throw err; }
    }
    return session?.accessToken || null;
  }

  /** JSON request with the signed-in user's token. Throws ApiError. */
  async function json(path, opts = {}) {
    const token = await accessToken();
    try {
      return await call(path, { ...opts, token });
    } catch (err) {
      if (err.status !== 401 || !session) throw err;
      await renew();
      return call(path, { ...opts, token: session?.accessToken });
    }
  }

  return {
    ApiError,
    call,
    json,
    accessToken,
    get user() { return session?.user || null; },
    get signedIn() { return Boolean(session?.refreshToken); },
    get isAdmin() { return Boolean(session?.user?.roles?.includes("Admin")); },
    onChange(cb) { listeners.add(cb); return () => listeners.delete(cb); },
    setUser(user) { if (session) write({ ...session, user }); },
    adopt(response) { write(fromResponse(response)); return session.user; },

    async login(email, password) {
      write(fromResponse(await call("/auth/login", { method: "POST", body: { email, password } })));
      return session.user;
    },
    async register(email, password, displayName) {
      const r = await call("/auth/register", { method: "POST", body: { email, password, displayName } });
      if (r.session) write(fromResponse(r.session));
      return r;
    },
    async verify(userId, token) {
      write(fromResponse(await call("/auth/verify-email", { method: "POST", body: { userId, token } })));
      return session.user;
    },
    resend: (email) => call("/auth/resend-verification", { method: "POST", body: { email } }),
    forgot: (email) => call("/auth/forgot-password", { method: "POST", body: { email } }),
    reset: (userId, token, password) => call("/auth/reset-password", { method: "POST", body: { userId, token, password } }),
    async logout() {
      const refreshToken = session?.refreshToken;
      write(null);
      if (refreshToken) await call("/auth/logout", { method: "POST", body: { refreshToken } }).catch(() => {});
    }
  };
})();
