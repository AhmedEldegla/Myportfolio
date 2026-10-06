(() => {
  const API = ["localhost", "127.0.0.1"].includes(location.hostname)
    ? "http://localhost:8787"
    : "https://ahmed-portfolio-chat.ahmedeldegla.workers.dev";
  const SETUP_URL = "https://github.com/AhmedEldegla/Myportfolio/blob/main/worker/SETUP.md";
  const C = window.AECharts;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const icon = (id, cls = "ico") => `<svg class="${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;
  const pad = (n) => String(n).padStart(2, "0");
  const DAY = 86400000;

  // ---------- Session ----------
  const S = { token: "", tz: "Africa/Cairo", me: null, route: "overview", param: "", cache: {}, counts: {} };
  try { S.token = localStorage.getItem("ae_admin_token") || sessionStorage.getItem("ae_admin_token") || ""; } catch {}

  async function api(path, opts = {}) {
    const res = await fetch(API + path, {
      ...opts,
      headers: { ...(opts.body ? { "Content-Type": "application/json" } : {}), ...(opts.headers || {}), Authorization: "Bearer " + S.token },
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    if (res.status === 401) { signOut("Your session ended. Please sign in again."); throw new Error("unauthorized"); }
    const data = res.headers.get("Content-Type")?.includes("json") ? await res.json() : res;
    if (!res.ok) { const err = new Error(data?.message || data?.error || String(res.status)); err.data = data; throw err; }
    return data;
  }

  // ---------- Time in Ahmed's timezone ----------
  const fmt = (iso, o) => new Date(iso).toLocaleString("en-GB", { timeZone: S.tz, ...o });
  const fmtDay = (iso) => fmt(iso, { weekday: "short", day: "numeric", month: "short" });
  const fmtTime = (iso) => fmt(iso, { hour: "2-digit", minute: "2-digit" });
  const fmtFull = (iso) => fmt(iso, { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  function wall(ts, tz = S.tz) {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit"
    }).formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
    return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, s: +p.second };
  }
  function zonedToUtc(y, m, d, h, min, tz = S.tz) {
    const off = (ts) => { const w = wall(ts, tz); return Date.UTC(w.y, w.m - 1, w.d, w.h, w.min, w.s) - Math.floor(ts / 1000) * 1000; };
    const guess = Date.UTC(y, m - 1, d, h, min);
    return guess - off(guess - off(guess));
  }
  const keyOf = (ts) => { const w = wall(ts); return `${w.y}-${pad(w.m)}-${pad(w.d)}`; };
  function ago(iso) {
    const s = (Date.now() - Date.parse(iso)) / 1000;
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
    return fmt(iso, { day: "numeric", month: "short" });
  }
  function until(iso) {
    const m = Math.round((Date.parse(iso) - Date.now()) / 60000);
    if (m < 0) return "";
    if (m < 60) return `in ${m} min`;
    if (m < 1440) return `in ${Math.round(m / 60)} h`;
    return `in ${Math.round(m / 1440)} d`;
  }

  // ---------- UI helpers ----------
  let toastTimer = 0;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
  }
  const STATUS = { confirmed: "Confirmed", completed: "Completed", no_show: "No-show", cancelled: "Cancelled" };
  const pill = (s) => `<span class="pill pill--${esc(s)}">${esc(STATUS[s] || s)}</span>`;
  const skeleton = (n = 3) => `<div class="grid g-tiles">${'<div class="skeleton"></div>'.repeat(n)}</div>`;

  function setHead(title, sub = "") {
    $("#pageTitle").textContent = title;
    $("#pageSub").textContent = sub;
    document.title = `${title} · Dashboard`;
  }

  // Small modal dialog that resolves with the submitted form data (or null)
  function dialog(html) {
    const dlg = $("#dlg");
    const body = $("#dlgBody");
    body.innerHTML = html;
    dlg.showModal();
    body.querySelector("input, textarea, select")?.focus();
    return new Promise((resolve) => {
      const done = (val) => { dlg.close(); body.onsubmit = null; resolve(val); };
      body.onsubmit = (e) => {
        e.preventDefault();
        if (e.submitter?.value === "cancel") return done(null);
        done(Object.fromEntries(new FormData(body)));
      };
      dlg.oncancel = () => done(null);
    });
  }

  // ---------- Sign in / out ----------
  function showLogin(msg = "") {
    $("#app").hidden = true;
    $("#login").hidden = false;
    $("#loginErr").textContent = msg;
    setTimeout(() => $("#pw").focus(), 50);
  }

  function signOut(msg = "") {
    if (S.token) fetch(API + "/admin/logout", { method: "POST", headers: { Authorization: "Bearer " + S.token } }).catch(() => {});
    S.token = "";
    try { localStorage.removeItem("ae_admin_token"); sessionStorage.removeItem("ae_admin_token"); } catch {}
    showLogin(msg);
  }

  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button");
    btn.disabled = true;
    btn.textContent = "Signing in…";
    $("#loginErr").textContent = "";
    try {
      const res = await fetch(API + "/admin/login", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: $("#pw").value })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        $("#loginErr").textContent = { wrong_password: "Wrong password.", rate_limited: "Too many attempts. Wait a few minutes.", admin_not_configured: "ADMIN_PASSWORD isn't set on the server yet." }[data.error] || "Couldn't sign in.";
        return;
      }
      S.token = data.token;
      try { ($("#remember").checked ? localStorage : sessionStorage).setItem("ae_admin_token", data.token); } catch {}
      $("#pw").value = "";
      start();
    } catch {
      $("#loginErr").textContent = "Can't reach the server.";
    } finally {
      btn.disabled = false;
      btn.textContent = "Sign in";
    }
  });

  // ---------- Router ----------
  const ROUTES = {
    overview: { title: "Overview", render: viewOverview },
    calendar: { title: "Calendar", render: viewCalendar },
    bookings: { title: "Bookings", render: viewBookings },
    inbox: { title: "Inbox", render: viewInbox },
    chats: { title: "AI chats", render: viewChats },
    analytics: { title: "Analytics", render: viewAnalytics },
    availability: { title: "Availability", render: viewAvailability },
    types: { title: "Meeting types", render: viewTypes },
    settings: { title: "Settings", render: viewSettings }
  };

  async function route() {
    const [, name = "overview", param = ""] = location.hash.match(/^#\/([a-z]+)\/?([^/]*)/) || [];
    const r = ROUTES[name] ? name : "overview";
    // #/bookings/<id> opens the drawer on top of the bookings list
    if (r === "bookings" && param && S.route === "bookings" && $("#view").dataset.route === "bookings") {
      return openBooking(param);
    }
    S.route = r;
    S.param = decodeURIComponent(param);
    $$("#nav a").forEach((a) => a.classList.toggle("is-on", a.dataset.route === r));
    $("#app").classList.remove("side-open");
    setHead(ROUTES[r].title);
    const view = $("#view");
    view.dataset.route = r;
    view.innerHTML = skeleton();
    view.style.animation = "none"; void view.offsetWidth; view.style.animation = "";
    try {
      await ROUTES[r].render(view);
    } catch (err) {
      if (err.message !== "unauthorized") view.innerHTML = `<div class="empty"><strong>Couldn't load this page</strong>${esc(err.message)}</div>`;
    }
    if (r === "bookings" && S.param) openBooking(S.param);
  }

  // ---------- Overview ----------
  async function viewOverview(view) {
    const d = await api("/admin/overview");
    const k = d.kpis;
    const hour = wall(Date.now()).h;
    setHead(`Good ${hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening"}, ${(S.me.owner.name || "").split(" ")[0]}`, fmt(Date.now(), { weekday: "long", day: "numeric", month: "long" }));
    const delta = (cur, prev) => {
      if (!prev && !cur) return `<span class="tile__delta">No change vs previous 30 days</span>`;
      if (!prev) return `<span class="tile__delta up">New this period</span>`;
      const p = Math.round(((cur - prev) / prev) * 100);
      return `<span class="tile__delta ${p > 0 ? "up" : p < 0 ? "down" : ""}">${p > 0 ? "+" : ""}${p}% vs previous 30 days</span>`;
    };
    const ints = S.me.integrations;
    const missing = [["google", "Connect Google Calendar for Meet links"], ["email", "Turn on emails (Resend)"], ["telegram", "Get instant Telegram alerts"]].filter(([key]) => !ints[key]);
    const feedIcon = { booking: "i-cal", cancelled: "i-x", message: "i-mail", lead: "i-chat", chat: "i-chat" };

    view.innerHTML = `
      <div class="grid g-tiles">
        <div class="card tile tile--hero" style="--i:0"><span class="tile__label">${icon("i-cal")} Upcoming calls</span><span class="tile__value">${k.upcoming}</span><span class="tile__delta">${k.nextWeek} in the next 7 days</span></div>
        <div class="card tile" style="--i:1"><span class="tile__label">Bookings · 30 days</span><span class="tile__value">${C.fmtN(k.bookings30)}</span>${delta(k.bookings30, k.bookingsPrev30)}</div>
        <div class="card tile" style="--i:2"><span class="tile__label">Visitors · 30 days</span><span class="tile__value">${C.fmtN(k.visitors30)}</span>${delta(k.visitors30, k.visitorsPrev30)}</div>
        <a class="card tile" href="#/inbox" style="--i:3"><span class="tile__label">${icon("i-inbox")} New messages</span><span class="tile__value">${k.newMessages}</span><span class="tile__delta">${k.chats30} AI chats in 30 days</span></a>
      </div>
      <div class="grid g-2 mt">
        <div class="card" style="--i:4"><div class="card__head"><div><h2>Bookings per week</h2><p>Calls booked, last 12 weeks</p></div></div>
          ${C.columns(d.weeks.map((w) => ({ label: fmt(w.start, { day: "numeric", month: "short" }), value: w.count, tip: `Week of ${fmt(w.start, { day: "numeric", month: "short" })}: ${w.count} booking${w.count === 1 ? "" : "s"}` })), { every: 3 })}</div>
        <div class="card" style="--i:5"><div class="card__head"><div><h2>Visitors per day</h2><p>Unique visitors, last 30 days</p></div><div class="tools"><a class="btn btn--ghost btn--sm" href="#/analytics">Details</a></div></div>
          ${C.area(d.visits.map((v) => ({ label: new Date(v.date + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short" }), value: v.visitors, tip: `${new Date(v.date + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}: ${v.visitors} visitor${v.visitors === 1 ? "" : "s"}` })))}</div>
      </div>
      <div class="grid g-3 mt">
        <div class="card" style="--i:6"><div class="card__head"><div><h2>Next up</h2><p>Your upcoming calls</p></div><div class="tools"><a class="btn btn--ghost btn--sm" href="#/calendar">Calendar</a></div></div>
          ${d.upcoming.length ? `<div class="rows">${d.upcoming.map(rowHtml).join("")}</div>` : `<div class="empty"><strong>No upcoming calls</strong>Share your booking link: <a href="${esc(S.me.site || "")}/#book" target="_blank" rel="noreferrer" style="color:var(--accent)">${esc((S.me.site || "").replace(/^https?:\/\//, ""))}/#book</a></div>`}</div>
        <div class="grid" style="align-content:start">
          ${missing.length ? `<div class="card" style="--i:7"><div class="card__head"><div><h2>Finish setup</h2><p>${3 - missing.length} of 3 done</p></div></div>
            <ul class="setup">${[["google", "Google Calendar & Meet"], ["email", "Booking emails"], ["telegram", "Telegram alerts"]].map(([key, label]) =>
              `<li><span class="dot ${ints[key] ? "is-ok" : ""}">${ints[key] ? icon("i-check") : ""}</span><a href="#/settings">${label}</a></li>`).join("")}</ul></div>` : ""}
          <div class="card" style="--i:8"><div class="card__head"><div><h2>Recent activity</h2></div></div>
            ${d.activity.length ? `<div class="feed">${d.activity.map((a) => `<a href="${esc(a.ref)}"><span class="feed__ico">${icon(feedIcon[a.kind] || "i-bell")}</span><span>${esc(a.text)}</span><time>${ago(a.at)}</time></a>`).join("")}</div>` : `<p class="muted">Nothing yet.</p>`}</div>
        </div>
      </div>`;
  }

  function rowHtml(b) {
    const soon = b.status === "confirmed" ? until(b.start) : "";
    return `
      <div class="row" data-open="${b.id}">
        <div class="row__when"><strong>${esc(fmtDay(b.start))}</strong><span>${fmtTime(b.start)} – ${fmtTime(b.end)}${soon ? ` · ${soon}` : ""}</span></div>
        <div class="row__who"><strong>${esc(b.name)}</strong><span>${esc(b.type.name)} · ${b.duration} min · ${esc(b.email)}</span></div>
        <div class="row__end">${pill(b.status)}${b.status === "confirmed" && b.meetUrl && Date.parse(b.end) > Date.now() ? `<a class="btn btn--line btn--sm" href="${esc(b.meetUrl)}" target="_blank" rel="noreferrer" data-stop>${icon("i-video")}Join</a>` : ""}</div>
      </div>`;
  }

  // ---------- Bookings ----------
  const BK = { scope: "upcoming", status: "", q: "", type: "" };
  async function viewBookings(view) {
    const types = (S.cache.settings || (S.cache.settings = await api("/admin/settings"))).meetingTypes;
    view.innerHTML = `
      <div class="toolbar">
        <div class="seg" data-seg="scope">${["upcoming", "past", "all"].map((s) => `<button type="button" data-v="${s}" class="${BK.scope === s ? "is-on" : ""}">${s[0].toUpperCase() + s.slice(1)}</button>`).join("")}</div>
        <label class="search">${icon("i-search")}<input id="bkQ" placeholder="Search name, email or answers" value="${esc(BK.q)}" /></label>
        <select class="select" id="bkStatus"><option value="">Any status</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${BK.status === k ? "selected" : ""}>${v}</option>`).join("")}</select>
        <select class="select" id="bkType"><option value="">All meeting types</option>${types.map((t) => `<option value="${esc(t.id)}" ${BK.type === t.id ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select>
        <button type="button" class="btn btn--line btn--sm" data-action="exportCsv" style="margin-left:auto">${icon("i-download")}Export CSV</button>
      </div>
      <div class="card" id="bkList">${skeleton(1)}</div>`;
    const load = async () => {
      const qs = new URLSearchParams({ scope: BK.scope, ...(BK.status && { status: BK.status }), ...(BK.q && { q: BK.q }), ...(BK.type && { type: BK.type }) });
      const d = await api(`/admin/bookings?${qs}`);
      const total = Object.values(d.counts).reduce((a, b) => a + b, 0);
      setHead("Bookings", `${total} total · ${d.counts.confirmed || 0} confirmed · ${d.counts.completed || 0} completed`);
      $("#bkList").innerHTML = d.bookings.length
        ? `<div class="rows">${d.bookings.map(rowHtml).join("")}</div>`
        : `<div class="empty"><strong>No bookings here</strong>${BK.q || BK.status || BK.type ? "Try clearing the filters." : "New bookings show up here as soon as they're made."}</div>`;
    };
    view.querySelector('[data-seg="scope"]').addEventListener("click", (e) => {
      const b = e.target.closest("button[data-v]");
      if (!b) return;
      BK.scope = b.dataset.v;
      $$('[data-seg="scope"] button').forEach((x) => x.classList.toggle("is-on", x === b));
      load();
    });
    let qTimer = 0;
    $("#bkQ").addEventListener("input", (e) => { clearTimeout(qTimer); qTimer = setTimeout(() => { BK.q = e.target.value.trim(); load(); }, 250); });
    $("#bkStatus").addEventListener("change", (e) => { BK.status = e.target.value; load(); });
    $("#bkType").addEventListener("change", (e) => { BK.type = e.target.value; load(); });
    S.reloadList = load;
    await load();
  }

  async function exportCsv() {
    const res = await api("/admin/bookings.csv");
    const blob = await res.blob();
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `bookings-${new Date().toISOString().slice(0, 10)}.csv` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ---------- Booking drawer ----------
  async function openBooking(id) {
    const drawer = $("#drawer");
    const panel = $("#drawerPanel");
    drawer.hidden = false;
    panel.innerHTML = `<div class="skeleton"></div><div class="skeleton"></div>`;
    try {
      const { booking: b } = await api(`/admin/bookings/${id}`);
      renderDrawer(b);
    } catch (err) {
      if (err.message !== "unauthorized") panel.innerHTML = `<div class="empty"><strong>Booking not found</strong></div>`;
    }
  }

  function renderDrawer(b) {
    const panel = $("#drawerPanel");
    const upcoming = b.status === "confirmed" && Date.parse(b.start) > Date.now();
    const past = Date.parse(b.end) < Date.now();
    const clientWhen = b.clientTz && b.clientTz !== S.tz
      ? new Date(b.start).toLocaleString("en-GB", { timeZone: b.clientTz, weekday: "short", hour: "2-digit", minute: "2-digit" }) + ` for them (${b.clientTz.replace(/_/g, " ")})`
      : "";
    const answers = (b.questions || []).filter((q) => b.answers[q.id]).map((q) => [q.label, b.answers[q.id]]);
    for (const [k, v] of Object.entries(b.answers)) if (!(b.questions || []).some((q) => q.id === k)) answers.push([k, v]);
    const mail = `mailto:${encodeURIComponent(b.email)}?subject=${encodeURIComponent(`Our ${b.type.name.toLowerCase()} on ${fmtDay(b.start)}`)}`;

    panel.innerHTML = `
      <div class="dr__top">
        <div><h2>${esc(b.name)}</h2><p>${esc(b.email)}</p></div>
        <button type="button" class="iconBtn" data-action="closeDrawer" aria-label="Close">${icon("i-x")}</button>
      </div>
      <div class="dr__pills">${pill(b.status)} <span class="pill">${esc(b.type.name)} · ${b.duration} min</span>${b.calendarSynced ? ` <span class="pill">Google Calendar</span>` : ""}</div>
      <div class="dr__when"><strong>${esc(fmtFull(b.start))}</strong><span>${fmtTime(b.start)} – ${fmtTime(b.end)} your time${clientWhen ? ` · ${esc(clientWhen)}` : ""}</span>
        ${b.status === "cancelled" ? `<span>Cancelled by ${esc(b.cancelledBy || "?")}${b.cancelReason ? `: “${esc(b.cancelReason)}”` : ""}</span>` : ""}</div>
      ${b.meetUrl && b.status !== "cancelled" ? `<div class="linkbox">${icon("i-video")}<a href="${esc(b.meetUrl)}" target="_blank" rel="noreferrer">${esc(b.meetUrl.replace(/^https:\/\//, ""))}</a><button type="button" class="iconBtn" data-copy="${esc(b.meetUrl)}" aria-label="Copy link">${icon("i-copy")}</button></div>` : ""}
      <div class="dr__actions">
        ${upcoming ? `<a class="btn btn--accent btn--sm" href="${esc(b.meetUrl)}" target="_blank" rel="noreferrer">${icon("i-video")}Join call</a>` : ""}
        <a class="btn btn--line btn--sm" href="${mail}">${icon("i-mail")}Email</a>
        ${upcoming ? `<button type="button" class="btn btn--line btn--sm" data-action="reschedule" data-id="${b.id}">${icon("i-cal")}Reschedule</button>
          <button type="button" class="btn btn--line btn--sm" data-action="cancelBooking" data-id="${b.id}">${icon("i-x")}Cancel</button>` : ""}
        ${b.status !== "cancelled" && past ? `
          <button type="button" class="btn ${b.status === "completed" ? "btn--solid" : "btn--line"} btn--sm" data-action="setStatus" data-id="${b.id}" data-status="completed">${icon("i-check")}Completed</button>
          <button type="button" class="btn ${b.status === "no_show" ? "btn--solid" : "btn--line"} btn--sm" data-action="setStatus" data-id="${b.id}" data-status="no_show">No-show</button>` : ""}
      </div>
      ${answers.length ? `<div class="dr__section"><h3>Their answers</h3><dl class="kv">${answers.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl></div>` : ""}
      <div class="dr__section"><h3>Private notes <span class="saved" id="notesSaved">Saved</span></h3>
        <textarea class="input" id="notes" rows="5" placeholder="Only you can see these. Prep, follow-ups, outcome…" style="width:100%">${esc(b.notes)}</textarea></div>
      <p class="muted" style="font-size:12.5px">Booked ${esc(fmtFull(b.createdAt))}${b.updatedAt && b.updatedAt !== b.createdAt ? ` · updated ${ago(b.updatedAt)}` : ""}</p>`;

    let t = 0;
    $("#notes").addEventListener("input", (e) => {
      clearTimeout(t);
      t = setTimeout(async () => {
        await api(`/admin/bookings/${b.id}`, { method: "PATCH", body: { notes: e.target.value } });
        $("#notesSaved").classList.add("is-on");
        setTimeout(() => $("#notesSaved")?.classList.remove("is-on"), 1400);
      }, 600);
    });
  }

  function closeDrawer() {
    $("#drawer").hidden = true;
    if (/^#\/bookings\/.+/.test(location.hash)) history.replaceState(null, "", "#/bookings");
  }

  async function afterChange() {
    refreshCounts();
    if (S.route === "bookings" && S.reloadList) S.reloadList();
    else if (S.route !== "bookings") route();
  }

  async function rescheduleFlow(id) {
    const { booking: b } = await api(`/admin/bookings/${id}`);
    const w = wall(Date.parse(b.start));
    const res = await dialog(`
      <h2>Move ${esc(b.name.split(" ")[0])}'s call</h2>
      <p>Times are in your timezone (${esc(S.tz.replace(/_/g, " "))}). Your weekly hours don't apply here, so any free time works.</p>
      <div class="dlg__row">
        <label class="fld">Date<input class="input" type="date" name="date" required value="${w.y}-${pad(w.m)}-${pad(w.d)}" /></label>
        <label class="fld">Start time<input class="input" type="time" name="time" required step="300" value="${pad(w.h)}:${pad(w.min)}" /></label>
      </div>
      <label class="check"><input type="checkbox" name="notify" checked /> Email ${esc(b.name.split(" ")[0])} the new time and an updated invite</label>
      <div class="dlg__actions"><button class="btn btn--ghost btn--sm" value="cancel" formnovalidate>Back</button><button class="btn btn--accent btn--sm" value="ok">Move call</button></div>`);
    if (!res) return;
    try {
      const d = await api(`/admin/bookings/${id}/reschedule`, { method: "POST", body: { date: res.date, time: res.time, notify: res.notify === "on" } });
      toast("Call moved");
      if (!$("#drawer").hidden) renderDrawer(d.booking);
      afterChange();
    } catch (err) {
      toast({ slot_unavailable: "That time overlaps another call or blocked time.", in_the_past: "Pick a time in the future.", bad_time: "Check the date and time." }[err.message] || "Couldn't move the call.");
    }
  }

  async function cancelFlow(id) {
    const { booking: b } = await api(`/admin/bookings/${id}`);
    const res = await dialog(`
      <h2>Cancel the call with ${esc(b.name)}?</h2>
      <p>${esc(fmtFull(b.start))}. The time opens up again${b.calendarSynced ? " and the Google Calendar event is removed" : ""}.</p>
      <label class="fld">Reason (shown to ${esc(b.name.split(" ")[0])})<textarea class="input" name="reason" rows="3" maxlength="500" placeholder="Optional"></textarea></label>
      <label class="check"><input type="checkbox" name="notify" checked /> Email ${esc(b.name.split(" ")[0])} that it's cancelled</label>
      <div class="dlg__actions"><button class="btn btn--ghost btn--sm" value="cancel" formnovalidate>Keep it</button><button class="btn btn--danger btn--sm" value="ok">Cancel call</button></div>`);
    if (!res) return;
    await api(`/admin/bookings/${id}/cancel`, { method: "POST", body: { reason: res.reason || "", notify: res.notify === "on" } });
    toast("Call cancelled");
    if (!$("#drawer").hidden) openBooking(id);
    afterChange();
  }

  // ---------- Calendar ----------
  const CAL = { offset: 0 };
  async function viewCalendar(view) {
    const today = wall(Date.now());
    const base = new Date(Date.UTC(today.y, today.m - 1, today.d));
    const dow = (base.getUTCDay() + 6) % 7;
    const monday = new Date(base.getTime() - dow * DAY + CAL.offset * 7 * DAY);
    const days = Array.from({ length: 7 }, (_, i) => new Date(monday.getTime() + i * DAY));
    const startTs = zonedToUtc(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate(), 0, 0);
    const endTs = startTs + 7 * DAY + 2 * 3600000;
    const d = await api(`/admin/calendar?from=${new Date(startTs).toISOString()}&to=${new Date(endTs).toISOString()}`);

    // Visible hours: weekly windows and bookings, padded, at least 9:00-20:00
    let minH = 9, maxH = 20;
    for (const day of Object.values(d.weekly || {})) for (const [a, b] of day) { minH = Math.min(minH, +a.slice(0, 2)); maxH = Math.max(maxH, Math.ceil(+b.slice(0, 2) + +b.slice(3) / 60)); }
    for (const b of d.bookings) { const w1 = wall(Date.parse(b.start)); const w2 = wall(Date.parse(b.end)); minH = Math.min(minH, w1.h); maxH = Math.max(maxH, w2.h + (w2.min ? 1 : 0)); }
    minH = Math.max(0, minH - 1); maxH = Math.min(24, maxH + 1);
    const HH = 52;
    const top = (h, m) => (h - minH + m / 60) * HH;
    const label = `${days[0].toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })} – ${days[6].toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}`;
    setHead("Calendar", `${label} · ${S.tz.replace(/_/g, " ")}`);

    const todayKey = `${today.y}-${pad(today.m)}-${pad(today.d)}`;
    const cols = days.map((day, i) => {
      const key = day.toISOString().slice(0, 10);
      const wins = key && (d.blockedDates || []).includes(key) ? [] : (d.weekly[day.getUTCDay()] || []);
      const avail = wins.map(([a, b]) => `<div class="wk__avail" style="top:${top(+a.slice(0, 2), +a.slice(3))}px;height:${top(+b.slice(0, 2), +b.slice(3)) - top(+a.slice(0, 2), +a.slice(3))}px"></div>`).join("");
      const dayStart = zonedToUtc(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), 0, 0);
      const dayEnd = dayStart + DAY;
      const clip = (s, e) => { const a = Math.max(Date.parse(s), dayStart); const b = Math.min(Date.parse(e), dayEnd); return b > a ? [a, b] : null; };
      const blocks = d.blocks.map((x) => {
        const c = clip(x.start, x.end); if (!c) return "";
        const w1 = wall(c[0]); const w2 = c[1] === dayEnd ? { h: 24, min: 0 } : wall(c[1]);
        const t1 = Math.max(0, top(w1.h, w1.min)); const t2 = Math.min((maxH - minH) * HH, top(w2.h, w2.min));
        return t2 > t1 ? `<div class="wk__block" style="top:${t1}px;height:${t2 - t1}px" data-block="${x.id}" title="Blocked${x.reason ? `: ${esc(x.reason)}` : ""}">${esc(x.reason || "Blocked")}</div>` : "";
      }).join("");
      const evs = d.bookings.map((b) => {
        const c = clip(b.start, b.end); if (!c) return "";
        const w1 = wall(c[0]); const w2 = wall(c[1]);
        const t1 = top(w1.h, w1.min); const h = Math.max(26, top(w2.h, w2.min) - t1);
        return `<div class="wk__ev is-${esc(b.status)}" style="top:${t1}px;height:${h}px" data-open="${b.id}"><strong>${esc(b.name)}</strong>${fmtTime(b.start)} · ${esc(b.type.name)}</div>`;
      }).join("");
      let now = "";
      if (key === todayKey) { const w = wall(Date.now()); if (w.h >= minH && w.h < maxH) now = `<div class="wk__now" style="top:${top(w.h, w.min)}px"></div>`; }
      const slots = Array.from({ length: maxH - minH }, (_, h) => `<div class="wk__slot" data-slot="${key}|${pad(minH + h)}:00"></div>`).join("");
      return `<div class="wk__col" style="grid-row:2;grid-column:${i + 2}">${slots}${avail}${blocks}${evs}${now}</div>`;
    }).join("");

    view.innerHTML = `
      <div class="toolbar">
        <div class="seg"><button type="button" data-cal="-1" aria-label="Previous week">‹</button><button type="button" data-cal="0" class="${CAL.offset === 0 ? "is-on" : ""}">This week</button><button type="button" data-cal="1" aria-label="Next week">›</button></div>
        <strong style="font-size:15px">${label}</strong>
        <span class="muted" style="margin-left:auto;font-size:13px">Click an empty hour to block time</span>
      </div>
      <div class="wk" style="--hh:${HH}px">
        <div class="wk__grid">
          <div class="wk__corner" style="grid-row:1;grid-column:1"></div>
          ${days.map((day, i) => { const key = day.toISOString().slice(0, 10); return `<div class="wk__head ${key === todayKey ? "is-today" : ""}" style="grid-row:1;grid-column:${i + 2}">${day.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" })}<strong>${day.getUTCDate()}</strong></div>`; }).join("")}
          <div class="wk__hours" style="grid-row:2;grid-column:1">${Array.from({ length: maxH - minH }, (_, h) => `<div class="wk__hour">${pad(minH + h)}:00</div>`).join("")}</div>
          ${cols}
        </div>
      </div>
      <div class="legend">
        <span><i style="background:color-mix(in srgb, var(--ok) 18%, transparent)"></i>Bookable hours</span>
        <span><i style="background:color-mix(in srgb, var(--accent) 40%, var(--surface));border-left:3px solid var(--accent)"></i>Call</span>
        <span><i style="background:repeating-linear-gradient(135deg, var(--line-strong) 0 3px, transparent 3px 6px)"></i>Blocked</span>
      </div>`;

    view.querySelector(".seg").addEventListener("click", (e) => {
      const b = e.target.closest("[data-cal]");
      if (!b) return;
      CAL.offset = b.dataset.cal === "0" ? 0 : CAL.offset + Number(b.dataset.cal);
      viewCalendar(view);
    });
    view.querySelector(".wk").addEventListener("click", async (e) => {
      const blk = e.target.closest("[data-block]");
      if (blk) {
        const ok = await dialog(`<h2>Remove this blocked time?</h2><p>${esc(blk.title)}</p><div class="dlg__actions"><button class="btn btn--ghost btn--sm" value="cancel" formnovalidate>Keep</button><button class="btn btn--danger btn--sm" value="ok">Remove</button></div>`);
        if (ok) { await api(`/admin/blocks/${blk.dataset.block}`, { method: "DELETE" }); toast("Time unblocked"); viewCalendar(view); }
        return;
      }
      const slot = e.target.closest("[data-slot]");
      if (slot && !e.target.closest("[data-open]")) {
        const [date, time] = slot.dataset.slot.split("|");
        blockFlow(date, time);
      }
    });
  }

  async function blockFlow(date, time) {
    const w = wall(Date.now());
    const d0 = date || `${w.y}-${pad(w.m)}-${pad(w.d)}`;
    const t0 = time || "13:00";
    const t1 = `${pad(Math.min(23, +t0.slice(0, 2) + 1))}:${t0.slice(3)}`;
    const res = await dialog(`
      <h2>Block time</h2>
      <p>Nobody can book during blocked time. Times are in ${esc(S.tz.replace(/_/g, " "))}.</p>
      <label class="check"><input type="checkbox" name="allDay" id="blkAll" /> Whole day(s)</label>
      <div class="dlg__row">
        <label class="fld">From date<input class="input" type="date" name="date" required value="${d0}" /></label>
        <label class="fld">To date<input class="input" type="date" name="endDate" value="${d0}" /></label>
      </div>
      <div class="dlg__row" id="blkTimes">
        <label class="fld">Start<input class="input" type="time" name="from" value="${t0}" step="900" /></label>
        <label class="fld">End<input class="input" type="time" name="to" value="${t1}" step="900" /></label>
      </div>
      <label class="fld">Reason (private)<input class="input" name="reason" maxlength="200" placeholder="Holiday, focus time, travel…" /></label>
      <div class="dlg__actions"><button class="btn btn--ghost btn--sm" value="cancel" formnovalidate>Cancel</button><button class="btn btn--accent btn--sm" value="ok">Block time</button></div>`);
    if (!res) return;
    try {
      await api("/admin/blocks", { method: "POST", body: { date: res.date, endDate: res.endDate || res.date, from: res.from, to: res.to, allDay: res.allDay === "on", reason: res.reason || "" } });
      toast("Time blocked");
      if (S.route === "calendar") viewCalendar($("#view"));
    } catch {
      toast("Check the dates and times: the end must be after the start.");
    }
  }
  document.addEventListener("change", (e) => {
    if (e.target.id === "blkAll") $("#blkTimes").hidden = e.target.checked;
  });

  // ---------- Inbox ----------
  const IN = { filter: "active", sel: "" };
  async function viewInbox(view) {
    const q = IN.filter === "active" ? "" : `?status=${IN.filter}`;
    const { messages } = await api(`/admin/messages${q}`);
    const unread = messages.filter((m) => m.status === "new").length;
    setHead("Inbox", `${messages.length} message${messages.length === 1 ? "" : "s"}${unread ? ` · ${unread} new` : ""}`);
    const sel = messages.find((m) => m.id === IN.sel);
    view.innerHTML = `
      <div class="toolbar"><div class="seg" id="inSeg">${[["active", "Inbox"], ["new", "New"], ["replied", "Replied"], ["archived", "Archived"]].map(([v, l]) => `<button type="button" data-v="${v}" class="${IN.filter === v ? "is-on" : ""}">${l}</button>`).join("")}</div></div>
      ${messages.length ? `<div class="panes ${sel ? "has-detail" : ""}">
        <div class="panes__list">${messages.map((m) => `
          <div class="panes__item ${m.id === IN.sel ? "is-on" : ""} ${m.status === "new" ? "is-new" : ""}" data-msg="${m.id}">
            <strong>${esc(m.name)}<time>${ago(m.created_at)}</time></strong>
            <p>${m.kind === "lead" ? "🤖 " : ""}${esc(m.body.slice(0, 160))}</p>
          </div>`).join("")}</div>
        <div class="panes__detail">${sel ? msgDetail(sel) : `<div class="empty"><strong>Pick a message</strong>Messages from your contact form and leads from the AI assistant land here.</div>`}</div>
      </div>` : `<div class="card empty"><strong>Nothing here</strong>Messages from your contact form and leads from the AI assistant land here.</div>`}`;
    view.querySelector("#inSeg").addEventListener("click", (e) => {
      const b = e.target.closest("[data-v]");
      if (!b) return;
      IN.filter = b.dataset.v; IN.sel = "";
      viewInbox(view);
    });
    if (sel && sel.status === "new") {
      api(`/admin/messages/${sel.id}`, { method: "PATCH", body: { status: "read" } }).then(refreshCounts).catch(() => {});
    }
  }

  function msgDetail(m) {
    const subject = encodeURIComponent(m.kind === "lead" ? "Following up on your chat with my assistant" : "Re: your message");
    return `
      <button type="button" class="btn btn--ghost btn--sm back-link" data-action="inboxBack">${icon("i-back")}All messages</button>
      <div class="dr__top"><div><h2>${esc(m.name)}</h2><p><a href="mailto:${esc(m.email)}" style="color:var(--accent)">${esc(m.email)}</a> · ${esc(fmtFull(m.created_at))}</p></div></div>
      <div class="dr__pills">${m.kind === "lead" ? `<span class="pill pill--new">AI assistant lead</span>` : `<span class="pill">Contact form</span>`} <span class="pill">${esc(m.status)}</span></div>
      <div class="msg__body">${esc(m.body)}</div>
      <div class="dr__actions">
        <a class="btn btn--accent btn--sm" href="mailto:${esc(m.email)}?subject=${subject}" data-reply="${m.id}">${icon("i-mail")}Reply</a>
        ${m.status !== "archived" ? `<button type="button" class="btn btn--line btn--sm" data-msg-status="archived" data-id="${m.id}">Archive</button>` : `<button type="button" class="btn btn--line btn--sm" data-msg-status="read" data-id="${m.id}">Move to inbox</button>`}
        <button type="button" class="btn btn--line btn--sm" data-msg-status="new" data-id="${m.id}">Mark unread</button>
        <button type="button" class="btn btn--ghost btn--sm" data-msg-delete="${m.id}">${icon("i-trash")}Delete</button>
      </div>`;
  }

  // ---------- AI chats ----------
  async function viewChats(view) {
    const { chats } = await api("/admin/chats");
    setHead("AI chats", `${chats.length} conversation${chats.length === 1 ? "" : "s"} with your assistant`);
    const sel = S.param && chats.find((c) => c.session_id === S.param);
    view.innerHTML = chats.length ? `
      <div class="panes ${sel ? "has-detail" : ""}">
        <div class="panes__list">${chats.map((c) => `
          <a class="panes__item ${sel && c.session_id === sel.session_id ? "is-on" : ""}" href="#/chats/${c.session_id}">
            <strong>${esc(Math.ceil(c.n / 2))} question${c.n > 2 ? "s" : ""}<time>${ago(c.last)}</time></strong>
            <p>${esc((c.first || "").slice(0, 160))}</p>
          </a>`).join("")}</div>
        <div class="panes__detail" id="chatDetail">${sel ? skeleton(1) : `<div class="empty"><strong>Pick a conversation</strong>See exactly what visitors ask your AI assistant.</div>`}</div>
      </div>` : `<div class="card empty"><strong>No conversations yet</strong>When visitors talk to your AI assistant, the conversations show up here.</div>`;
    if (sel) {
      const { messages } = await api(`/admin/chats/${sel.session_id}`);
      $("#chatDetail").innerHTML = `
        <a class="btn btn--ghost btn--sm back-link" href="#/chats">${icon("i-back")}All conversations</a>
        <div class="dr__top"><div><h2>Conversation</h2><p>${esc(fmtFull(sel.started))}</p></div>
          <button type="button" class="btn btn--ghost btn--sm" data-chat-delete="${sel.session_id}" style="margin-left:auto">${icon("i-trash")}Delete</button></div>
        <div class="bubbles">${messages.map((m) => `<div class="bubble bubble--${m.role === "user" ? "user" : "assistant"}">${esc(m.content)}<time>${fmtTime(m.created_at)}</time></div>`).join("")}</div>`;
    }
  }

  // ---------- Analytics ----------
  const AN = { days: 30 };
  async function viewAnalytics(view) {
    const d = await api(`/admin/analytics?days=${AN.days}`);
    setHead("Analytics", `Last ${AN.days} days · privacy-friendly, no cookies`);
    const f = d.funnel;
    const conv = f.visitors ? ((f.booked / f.visitors) * 100).toFixed(1) : "0.0";
    const every = AN.days <= 7 ? 1 : AN.days <= 30 ? 7 : 15;
    const SECTION = { about: "About", experience: "Experience", projects: "Projects", skills: "Skills", contact: "Contact" };
    view.innerHTML = `
      <div class="toolbar"><div class="seg" id="anSeg">${[7, 30, 90].map((n) => `<button type="button" data-v="${n}" class="${AN.days === n ? "is-on" : ""}">${n} days</button>`).join("")}</div></div>
      <div class="grid g-tiles">
        <div class="card tile tile--hero" style="--i:0"><span class="tile__label">Visitors</span><span class="tile__value">${C.fmtN(d.totals.visitors)}</span><span class="tile__delta">${C.fmtN(d.totals.views)} page views</span></div>
        <div class="card tile" style="--i:1"><span class="tile__label">Opened booking</span><span class="tile__value">${C.fmtN(f.openedBooking)}</span><span class="tile__delta">${f.visitors ? Math.round((f.openedBooking / f.visitors) * 100) : 0}% of visitors</span></div>
        <div class="card tile" style="--i:2"><span class="tile__label">Booked a call</span><span class="tile__value">${C.fmtN(f.booked)}</span><span class="tile__delta">${conv}% conversion</span></div>
        <div class="card tile" style="--i:3"><span class="tile__label">Talked to the AI</span><span class="tile__value">${C.fmtN(f.chatted)}</span><span class="tile__delta">${C.fmtN(f.contacted)} sent a message</span></div>
      </div>
      <div class="card mt" style="--i:4"><div class="card__head"><div><h2>Visitors per day</h2><p>Unique visitors</p></div></div>
        ${C.area(d.series.map((s) => { const dt = new Date(s.date + "T12:00:00Z"); return { label: dt.toLocaleDateString("en-GB", { day: "numeric", month: "short" }), value: s.visitors, tip: `${dt.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}: ${s.visitors} visitors · ${s.views} views` }; }), { every })}</div>
      <div class="grid g-2 mt">
        <div class="card" style="--i:5"><div class="card__head"><div><h2>Booking funnel</h2><p>Visitors who reached each step</p></div></div>
          ${C.bars([{ name: "Visited", value: f.visitors }, { name: "Opened booking", value: f.openedBooking }, { name: "Booked", value: f.booked }], { total: f.visitors })}</div>
        <div class="card" style="--i:6"><div class="card__head"><div><h2>Sections seen</h2><p>Share of visitors who scrolled to each section</p></div></div>
          ${C.bars(d.sections.map((s) => ({ name: SECTION[s.name] || s.name, value: s.n })), { total: d.totals.visitors })}</div>
        <div class="card" style="--i:7"><div class="card__head"><div><h2>Where visitors come from</h2></div></div>
          ${C.bars(d.referrers.map((r) => ({ name: r.name, value: r.n })), { total: d.totals.visitors })}</div>
        <div class="card" style="--i:8"><div class="card__head"><div><h2>Devices & countries</h2></div></div>
          ${C.bars(d.devices.map((r) => ({ name: r.name, value: r.n })), { total: d.totals.visitors })}
          <div class="mt">${C.bars(d.countries.map((r) => ({ name: countryName(r.name), value: r.n })), { total: d.totals.visitors })}</div></div>
      </div>`;
    view.querySelector("#anSeg").addEventListener("click", (e) => {
      const b = e.target.closest("[data-v]");
      if (!b) return;
      AN.days = Number(b.dataset.v);
      viewAnalytics(view);
    });
  }
  const regionNames = (() => { try { return new Intl.DisplayNames(["en"], { type: "region" }); } catch { return null; } })();
  const countryName = (code) => (code && code.length === 2 && regionNames ? regionNames.of(code) : code || "Unknown");

  // ---------- Availability ----------
  const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  async function viewAvailability(view) {
    const st = await api("/admin/settings");
    S.cache.settings = st;
    const av = structuredClone(st.availability);
    const blocks = await api(`/admin/calendar?from=${new Date().toISOString()}&to=${new Date(Date.now() + 120 * DAY).toISOString()}`).then((d) => d.blocks);
    const zones = (() => { try { return Intl.supportedValuesOf("timeZone"); } catch { return [av.timezone]; } })();
    let dirty = false;

    const draw = () => {
      view.innerHTML = `
        <div class="card" style="--i:0"><div class="card__head"><div><h2>Weekly hours</h2><p>When people can book you, in your timezone</p></div>
          <div class="tools"><button type="button" class="btn btn--ghost btn--sm" data-av="copyMon">Copy Monday to weekdays</button></div></div>
          <div class="days">${[1, 2, 3, 4, 5, 6, 0].map((d) => {
            const wins = av.weekly[d] || [];
            return `<div class="day">
              <div class="day__name"><label class="switch"><input type="checkbox" data-av="toggle" data-day="${d}" ${wins.length ? "checked" : ""} aria-label="${DAYS[d]} available"/><span></span></label>${DAYS[d]}</div>
              <div class="day__wins">${wins.length ? wins.map(([a, b], i) => `
                <div class="win"><input class="input" type="time" step="900" value="${a}" data-av="from" data-day="${d}" data-i="${i}" aria-label="${DAYS[d]} start"/> – <input class="input" type="time" step="900" value="${b}" data-av="to" data-day="${d}" data-i="${i}" aria-label="${DAYS[d]} end"/>
                  <button type="button" class="iconBtn" data-av="rm" data-day="${d}" data-i="${i}" aria-label="Remove">${icon("i-x")}</button>
                  ${i === wins.length - 1 ? `<button type="button" class="iconBtn" data-av="add" data-day="${d}" aria-label="Add hours">${icon("i-plus")}</button>` : ""}</div>`).join("")
                : `<p class="day__off">Unavailable</p>`}</div>
            </div>`;
          }).join("")}</div></div>
        <div class="card mt" style="--i:1"><div class="card__head"><div><h2>Booking rules</h2></div></div>
          <div class="rules">
            <label class="fld">Timezone<input class="input" list="tzList" data-av="tz" value="${esc(av.timezone)}"/><datalist id="tzList">${zones.map((z) => `<option value="${esc(z)}">`).join("")}</datalist></label>
            <label class="fld">Minimum notice (hours)<input class="input" type="number" min="0" max="720" data-av="num" data-k="minNoticeHours" value="${av.minNoticeHours}"/></label>
            <label class="fld">Book up to (days ahead)<input class="input" type="number" min="1" max="120" data-av="num" data-k="daysAhead" value="${av.daysAhead}"/></label>
            <label class="fld">Buffer between calls (min)<input class="input" type="number" min="0" max="120" step="5" data-av="num" data-k="bufferMinutes" value="${av.bufferMinutes}"/></label>
            <label class="fld">Max calls per day (0 = no limit)<input class="input" type="number" min="0" max="50" data-av="num" data-k="maxPerDay" value="${av.maxPerDay}"/></label>
          </div></div>
        <div class="card mt" style="--i:2"><div class="card__head"><div><h2>Days off</h2><p>Whole days nobody can book</p></div>
          <div class="tools"><input class="input" type="date" id="offDate"/><button type="button" class="btn btn--line btn--sm" data-av="addOff">${icon("i-plus")}Add</button></div></div>
          <div class="chips">${av.blockedDates.length ? av.blockedDates.slice().sort().map((d) => `<span class="chip-x">${esc(new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }))}<button type="button" data-av="rmOff" data-d="${d}" aria-label="Remove">${icon("i-x")}</button></span>`).join("") : `<p class="muted">No days off planned.</p>`}</div></div>
        <div class="card mt" style="--i:3"><div class="card__head"><div><h2>Blocked time</h2><p>Hours you blocked from the calendar</p></div>
          <div class="tools"><button type="button" class="btn btn--line btn--sm" data-action="blockTime">${icon("i-plus")}Block time</button></div></div>
          ${blocks.length ? `<div class="rows">${blocks.map((b) => `<div class="row" style="cursor:default"><div class="row__when"><strong>${esc(fmtDay(b.start))}</strong><span>${fmtTime(b.start)} – ${esc(fmtDay(b.end))} ${fmtTime(b.end)}</span></div><div class="row__who"><strong>${esc(b.reason || "Blocked")}</strong></div><div class="row__end"><button type="button" class="iconBtn" data-av="rmBlock" data-id="${b.id}" aria-label="Remove">${icon("i-trash")}</button></div></div>`).join("")}</div>` : `<p class="muted">Nothing blocked.</p>`}</div>
        ${dirty ? `<div class="savebar"><p>You have unsaved changes</p><button type="button" class="btn btn--ghost btn--sm" data-av="reset">Discard</button><button type="button" class="btn btn--accent btn--sm" data-av="save">Save changes</button></div>` : ""}`;
    };
    const touch = () => { dirty = true; draw(); };
    draw();

    view.oninput = (e) => {
      const t = e.target;
      const a = t.dataset.av;
      if (a === "from" || a === "to") { av.weekly[t.dataset.day][t.dataset.i][a === "from" ? 0 : 1] = t.value; if (!dirty) touch(); }
      if (a === "num") { av[t.dataset.k] = Number(t.value); if (!dirty) touch(); }
      if (a === "tz") { av.timezone = t.value; if (!dirty) touch(); }
    };
    view.onchange = (e) => {
      const t = e.target;
      if (t.dataset.av === "toggle") { av.weekly[t.dataset.day] = t.checked ? [["09:00", "17:00"]] : []; touch(); }
    };
    view.onclick = async (e) => {
      const t = e.target.closest("[data-av]");
      if (!t || t.tagName === "INPUT") return;
      const a = t.dataset.av;
      const d = t.dataset.day;
      if (a === "rm") { av.weekly[d].splice(Number(t.dataset.i), 1); touch(); }
      if (a === "add") { const last = av.weekly[d][av.weekly[d].length - 1]; const h = Math.min(22, +last[1].slice(0, 2) + 1); av.weekly[d].push([`${pad(h)}:00`, `${pad(Math.min(23, h + 2))}:00`]); touch(); }
      if (a === "copyMon") { for (const x of [2, 3, 4, 5]) av.weekly[x] = structuredClone(av.weekly[1] || []); touch(); }
      if (a === "addOff") { const v = $("#offDate").value; if (v && !av.blockedDates.includes(v)) { av.blockedDates.push(v); touch(); } }
      if (a === "rmOff") { av.blockedDates = av.blockedDates.filter((x) => x !== t.dataset.d); touch(); }
      if (a === "rmBlock") { await api(`/admin/blocks/${t.dataset.id}`, { method: "DELETE" }); toast("Time unblocked"); viewAvailability(view); }
      if (a === "reset") viewAvailability(view);
      if (a === "save") {
        try {
          await api("/admin/settings/availability", { method: "PUT", body: { value: av } });
          S.tz = av.timezone;
          S.cache.settings = null;
          dirty = false;
          draw();
          toast("Availability saved. Visitors see the new times right away.");
        } catch (err) {
          toast(err.data?.message || "Couldn't save. Check the times.");
        }
      }
    };
  }

  // ---------- Meeting types ----------
  async function viewTypes(view) {
    const st = await api("/admin/settings");
    S.cache.settings = st;
    const types = structuredClone(st.meetingTypes);
    let dirty = false;
    const DUR = [15, 20, 30, 45, 60, 90, 120];
    setHead("Meeting types", "What visitors can book, and what you ask them");

    const draw = () => {
      view.innerHTML = types.map((t, ti) => `
        <div class="card type-card ${ti ? "mt" : ""}" style="--i:${ti}">
          <div class="card__head">
            <label class="switch" title="Bookable"><input type="checkbox" data-t="active" data-ti="${ti}" ${t.active ? "checked" : ""} aria-label="Bookable"/><span></span></label>
            <input class="input" data-t="name" data-ti="${ti}" value="${esc(t.name)}" aria-label="Name"/>
            <select class="select" data-t="duration" data-ti="${ti}" aria-label="Duration">${DUR.map((n) => `<option value="${n}" ${t.duration === n ? "selected" : ""}>${n} min</option>`).join("")}</select>
            ${types.length > 1 ? `<button type="button" class="iconBtn" data-t="rmType" data-ti="${ti}" aria-label="Delete type">${icon("i-trash")}</button>` : ""}
          </div>
          <label class="fld">Description<textarea class="input" rows="2" maxlength="300" data-t="description" data-ti="${ti}">${esc(t.description)}</textarea></label>
          <div class="qs">${t.questions.map((q, qi) => `
            <div class="q">
              <input class="input" data-q="label" data-ti="${ti}" data-qi="${qi}" value="${esc(q.label)}" aria-label="Question"/>
              <select class="select" data-q="type" data-ti="${ti}" data-qi="${qi}" aria-label="Answer type">${[["text", "Short answer"], ["textarea", "Paragraph"], ["select", "Choice"]].map(([v, l]) => `<option value="${v}" ${q.type === v ? "selected" : ""}>${l}</option>`).join("")}</select>
              <label class="check"><input type="checkbox" data-q="required" data-ti="${ti}" data-qi="${qi}" ${q.required ? "checked" : ""}/> Required</label>
              <button type="button" class="iconBtn" data-t="rmQ" data-ti="${ti}" data-qi="${qi}" aria-label="Remove question">${icon("i-x")}</button>
              ${q.type === "select" ? `<input class="input q__opts" data-q="options" data-ti="${ti}" data-qi="${qi}" value="${esc((q.options || []).join(", "))}" placeholder="Choices, separated by commas"/>` : ""}
            </div>`).join("")}</div>
          <button type="button" class="btn btn--ghost btn--sm mt" data-t="addQ" data-ti="${ti}">${icon("i-plus")}Add question</button>
        </div>`).join("") + `
        <button type="button" class="btn btn--line mt" data-t="addType">${icon("i-plus")}New meeting type</button>
        ${dirty ? `<div class="savebar"><p>You have unsaved changes</p><button type="button" class="btn btn--ghost btn--sm" data-t="reset">Discard</button><button type="button" class="btn btn--accent btn--sm" data-t="save">Save changes</button></div>` : ""}`;
    };
    const touch = () => { const had = dirty; dirty = true; if (!had) draw(); };
    draw();

    view.oninput = (e) => {
      const t = e.target;
      if (t.dataset.t && ["name", "description"].includes(t.dataset.t)) { types[t.dataset.ti][t.dataset.t] = t.value; touch(); }
      if (t.dataset.q === "label") { types[t.dataset.ti].questions[t.dataset.qi].label = t.value; touch(); }
      if (t.dataset.q === "options") { types[t.dataset.ti].questions[t.dataset.qi].options = t.value.split(",").map((s) => s.trim()).filter(Boolean); touch(); }
    };
    view.onchange = (e) => {
      const t = e.target;
      if (t.dataset.t === "active") { types[t.dataset.ti].active = t.checked; dirty = true; draw(); }
      if (t.dataset.t === "duration") { types[t.dataset.ti].duration = Number(t.value); touch(); }
      if (t.dataset.q === "type") { const q = types[t.dataset.ti].questions[t.dataset.qi]; q.type = t.value; if (t.value === "select" && !q.options) q.options = ["Option 1", "Option 2"]; dirty = true; draw(); }
      if (t.dataset.q === "required") { types[t.dataset.ti].questions[t.dataset.qi].required = t.checked; touch(); }
    };
    view.onclick = async (e) => {
      const t = e.target.closest("[data-t]");
      if (!t || ["INPUT", "SELECT", "TEXTAREA"].includes(t.tagName)) return;
      const a = t.dataset.t;
      const ti = Number(t.dataset.ti);
      if (a === "addQ") { const qs = types[ti].questions; let n = qs.length + 1; while (qs.some((q) => q.id === `q${n}`)) n++; qs.push({ id: `q${n}`, label: "New question", type: "text", required: false }); dirty = true; draw(); }
      if (a === "rmQ") { types[ti].questions.splice(Number(t.dataset.qi), 1); dirty = true; draw(); }
      if (a === "rmType") { types.splice(ti, 1); dirty = true; draw(); }
      if (a === "addType") { let n = types.length + 1; while (types.some((x) => x.id === `type-${n}`)) n++; types.push({ id: `type-${n}`, name: "New meeting", duration: 30, description: "", active: false, questions: [] }); dirty = true; draw(); }
      if (a === "reset") viewTypes(view);
      if (a === "save") {
        try {
          await api("/admin/settings/meetingTypes", { method: "PUT", body: { value: types } });
          S.cache.settings = null;
          dirty = false;
          draw();
          toast("Meeting types saved");
        } catch (err) {
          toast(err.data?.message || "Couldn't save.");
        }
      }
    };
  }

  // ---------- Settings ----------
  async function viewSettings(view) {
    const st = await api("/admin/settings");
    S.cache.settings = st;
    const n = st.notifications;
    const ints = st.integrations;
    const intCard = (key, title, on, off, ico) => `
      <div class="int"><span class="int__ico">${icon(ico)}</span>
        <div><h3>${title}</h3><p>${ints[key] ? on : off}</p></div>
        ${ints[key] ? `<span class="pill pill--confirmed">Connected</span>` : `<a class="btn btn--line btn--sm" href="${SETUP_URL}" target="_blank" rel="noreferrer">How to connect</a>`}</div>`;
    view.innerHTML = `
      <div class="card" style="--i:0"><div class="card__head"><div><h2>Integrations</h2><p>Each one is optional. Everything keeps working without it.</p></div></div>
        <div class="grid">
          ${intCard("google", "Google Calendar & Meet", "Bookings appear in your calendar with a Google Meet link, and your busy times are hidden from visitors.", "Not connected: calls get a free Jitsi video link instead.", "i-cal")}
          ${intCard("email", "Booking emails (Resend)", "Clients get confirmations, invites, reminders and updates. You get a copy of each booking.", "Not connected: no emails are sent; the confirmation screen shows the video link.", "i-mail")}
          ${intCard("telegram", "Telegram alerts", "Instant alerts on your phone for bookings, cancellations and messages.", "Not connected.", "i-bell")}
          ${intCard("ai", "AI assistant (Gemini)", "Answers visitors' questions on your website.", "Not connected.", "i-chat")}
        </div></div>
      <div class="card mt" style="--i:1"><div class="card__head"><div><h2>Notifications</h2></div></div>
        ${[["emailOwner", "Email me", "A copy of every booking, change and message"], ["telegram", "Telegram alerts", "Instant alerts (needs Telegram connected)"], ["reminders", "Remind clients", "Emails 24 hours and 1 hour before each call"]].map(([k, l, p]) => `
          <div class="toggle-row"><div><strong>${l}</strong><p>${p}</p></div><label class="switch"><input type="checkbox" data-n="${k}" ${n[k] ? "checked" : ""} aria-label="${l}"/><span></span></label></div>`).join("")}</div>
      <div class="card mt" style="--i:2"><div class="card__head"><div><h2>Your booking page</h2><p>Share this link anywhere: email signature, LinkedIn, proposals</p></div></div>
        <div class="linkbox"><a href="${esc(S.me.site)}/#book" target="_blank" rel="noreferrer">${esc((S.me.site || "").replace(/^https?:\/\//, ""))}/#book</a><button type="button" class="iconBtn" data-copy="${esc(S.me.site)}/#book" aria-label="Copy link">${icon("i-copy")}</button></div></div>
      <div class="card mt" style="--i:3"><div class="card__head"><div><h2>Install the dashboard</h2><p>Add it to your phone's home screen: open this page in Safari or Chrome, then Share → Add to Home Screen. It opens like an app.</p></div></div>
        <button type="button" class="btn btn--line btn--sm" data-action="logout">${icon("i-logout")}Log out of this device</button></div>`;
    view.onchange = async (e) => {
      const k = e.target.dataset.n;
      if (!k) return;
      n[k] = e.target.checked;
      try { await api("/admin/settings/notifications", { method: "PUT", body: { value: n } }); toast("Saved"); }
      catch { toast("Couldn't save"); e.target.checked = !e.target.checked; }
    };
  }

  // ---------- Global events ----------
  document.addEventListener("click", async (e) => {
    const copy = e.target.closest("[data-copy]");
    if (copy) {
      navigator.clipboard?.writeText(copy.dataset.copy).then(() => toast("Copied")).catch(() => {});
      return;
    }
    if (e.target.closest("[data-stop]")) return;

    const open = e.target.closest("[data-open]");
    if (open) {
      if (S.route === "bookings") history.replaceState(null, "", `#/bookings/${open.dataset.open}`);
      return openBooking(open.dataset.open);
    }

    const msg = e.target.closest("[data-msg]");
    if (msg) { IN.sel = msg.dataset.msg; return viewInbox($("#view")); }
    const ms = e.target.closest("[data-msg-status]");
    if (ms) {
      await api(`/admin/messages/${ms.dataset.id}`, { method: "PATCH", body: { status: ms.dataset.msgStatus } });
      if (ms.dataset.msgStatus === "archived") IN.sel = "";
      toast(ms.dataset.msgStatus === "archived" ? "Archived" : "Updated");
      refreshCounts();
      return viewInbox($("#view"));
    }
    const reply = e.target.closest("[data-reply]");
    if (reply) { api(`/admin/messages/${reply.dataset.reply}`, { method: "PATCH", body: { status: "replied" } }).then(refreshCounts).catch(() => {}); return; }
    const md = e.target.closest("[data-msg-delete]");
    if (md) {
      const ok = await dialog(`<h2>Delete this message?</h2><p>This can't be undone.</p><div class="dlg__actions"><button class="btn btn--ghost btn--sm" value="cancel" formnovalidate>Keep</button><button class="btn btn--danger btn--sm" value="ok">Delete</button></div>`);
      if (!ok) return;
      await api(`/admin/messages/${md.dataset.msgDelete}`, { method: "DELETE" });
      IN.sel = "";
      refreshCounts();
      return viewInbox($("#view"));
    }
    const cd = e.target.closest("[data-chat-delete]");
    if (cd) {
      const ok = await dialog(`<h2>Delete this conversation?</h2><p>This can't be undone.</p><div class="dlg__actions"><button class="btn btn--ghost btn--sm" value="cancel" formnovalidate>Keep</button><button class="btn btn--danger btn--sm" value="ok">Delete</button></div>`);
      if (!ok) return;
      await api(`/admin/chats/${cd.dataset.chatDelete}`, { method: "DELETE" });
      location.hash = "#/chats";
      return;
    }

    const a = e.target.closest("[data-action]")?.dataset.action;
    const id = e.target.closest("[data-action]")?.dataset.id;
    if (!a) return;
    if (a === "logout") return signOut();
    if (a === "refresh") { refreshCounts(); return route(); }
    if (a === "theme") {
      const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try { localStorage.setItem("ae_theme", next); } catch {}
      return;
    }
    if (a === "openSide") return $("#app").classList.add("side-open");
    if (a === "closeSide") return $("#app").classList.remove("side-open");
    if (a === "closeDrawer") return closeDrawer();
    if (a === "blockTime") return blockFlow();
    if (a === "exportCsv") return exportCsv().catch(() => toast("Export failed"));
    if (a === "inboxBack") { IN.sel = ""; return viewInbox($("#view")); }
    if (a === "reschedule") return rescheduleFlow(id);
    if (a === "cancelBooking") return cancelFlow(id);
    if (a === "setStatus") {
      const d = await api(`/admin/bookings/${id}`, { method: "PATCH", body: { status: e.target.closest("[data-status]").dataset.status } });
      renderDrawer(d.booking);
      toast("Marked as " + STATUS[d.booking.status].toLowerCase());
      afterChange();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("#drawer").hidden && !$("#dlg").open) closeDrawer();
  });
  window.addEventListener("hashchange", route);

  // ---------- Badges + live updates ----------
  async function refreshCounts() {
    try {
      const d = await api("/admin/overview");
      const k = d.kpis;
      const set = (el, n) => { el.hidden = !n; el.textContent = n; };
      set($("#bUpcoming"), k.upcoming);
      set($("#bInbox"), k.newMessages);
      if (S.counts.upcoming !== undefined && (k.bookings30 > S.counts.bookings30)) toast("New booking just came in");
      else if (S.counts.newMessages !== undefined && k.newMessages > S.counts.newMessages) toast("New message in your inbox");
      S.counts = k;
      document.title = `${k.newMessages ? `(${k.newMessages}) ` : ""}${$("#pageTitle").textContent} · Dashboard`;
    } catch {}
  }

  // ---------- Start ----------
  async function start() {
    try {
      S.me = await api("/admin/me");
    } catch (err) {
      if (err.message !== "unauthorized") showLogin("Can't reach the server.");
      return;
    }
    S.tz = S.me.timezone || S.tz;
    $("#login").hidden = true;
    $("#app").hidden = false;
    C.bindTooltips($("#tip"));
    await route();
    refreshCounts();
    clearInterval(S.poll);
    S.poll = setInterval(() => { if (!document.hidden) refreshCounts(); }, 60000);
  }

  if (S.token) start(); else showLogin();
})();
