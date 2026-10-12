// account.html: sign in / sign up, then the client's space: profile, bookings, live chat with Ahmed, security.
(() => {
  const Auth = window.AEAuth;
  const B = window.AEBooking;
  const Live = window.AELive;
  const root = document.getElementById("accountApp");
  if (!Auth || !root) return;

  const esc = Live.esc;
  const icon = (id, size = 18) => `<svg width="${size}" height="${size}" class="ico" aria-hidden="true"><use href="#${id}"/></svg>`;
  const $ = (s, r = root) => r.querySelector(s);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  let toastTimer = 0;
  function toast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
  }

  const MESSAGES = {
    network: "Can't reach the server. Check your connection and try again.",
    invalid_credentials: "Wrong email or password.",
    locked: "Too many attempts. Try again in a few minutes.",
    email_not_verified: "Confirm your email first. Check your inbox for the link.",
    email_taken: "An account with this email already exists. Sign in instead.",
    invalid_link: "This link has expired or was already used. Request a new one.",
    wrong_password: "That password isn't right.",
    rate_limited: "Too many attempts. Please wait a few minutes.",
    slot_unavailable: "Sorry, that time was just taken. Please pick another.",
    not_changeable: "This call can't be changed anymore."
  };
  const errText = (err) => (err?.code === "validation" && err.message) ? err.message : MESSAGES[err?.code] || err?.message || "Something went wrong. Please try again.";

  // Read one-time links (?mode=verify|reset&uid=…&token=…), then drop them from the address bar
  const params = new URLSearchParams(location.search);
  const link = { mode: params.get("mode"), uid: params.get("uid"), token: params.get("token") };
  if (link.mode) history.replaceState(null, "", location.pathname + location.hash);

  const S = {
    view: "signin",        // signed out: signin | register | forgot | sent | verify | reset
    tab: (location.hash.slice(1) || "bookings"),
    notice: "",
    email: "",
    bookings: null,
    picker: null,          // reschedule: { booking, slots, month, day, slot }
    chat: { conversationId: null, admin: null, messages: [], hasMore: false, typing: false, state: "connecting", loaded: false },
    live: null
  };
  const TABS = [["bookings", "Bookings", "i-cal"], ["chat", "Messages", "i-chat"], ["profile", "Profile", "i-user"], ["security", "Security", "i-shield"]];

  // ---------- Signed out ----------

  function authCard(inner) {
    return `<section class="acc-auth"><div class="acc-auth__card">${inner}</div></section>`;
  }
  const notice = () => S.notice ? `<p class="bm__notice" role="alert">${esc(S.notice)}</p>` : "";
  const pwField = (name, label, autocomplete) => `
    <label class="field"><span>${label}</span><input name="${name}" type="password" autocomplete="${autocomplete}" minlength="8" maxlength="128" required /></label>`;

  function viewSignedOut() {
    if (S.view === "verify") return authCard(`<div class="bm__msg"><span class="typing"><i></i><i></i><i></i></span> Confirming your email…</div>`);
    if (S.view === "sent") {
      return authCard(`
        <div class="acc-auth__icon">${icon("i-mail", 26)}</div>
        <h1 class="acc-auth__title">Check your inbox</h1>
        <p class="muted">We sent a link to <strong>${esc(S.email)}</strong>. Open it to ${S.sentFor === "reset" ? "choose a new password" : "confirm your email and sign in"}.</p>
        ${notice()}
        <div class="acc-auth__alt">
          ${S.sentFor === "reset" ? "" : `<button type="button" class="linkBtn" data-act="resend">Send the link again</button> · `}
          <button type="button" class="linkBtn" data-view="signin">Back to sign in</button>
        </div>`);
    }
    if (S.view === "reset") {
      return authCard(`
        <h1 class="acc-auth__title">Choose a new password</h1>
        <p class="muted">At least 8 characters, with a number and a lowercase letter.</p>
        ${notice()}
        <form class="acc-form" data-form="reset">
          ${pwField("password", "New password", "new-password")}
          <button class="btn btn--accent btn--block" type="submit">Save and sign in</button>
        </form>`);
    }
    if (S.view === "forgot") {
      return authCard(`
        <h1 class="acc-auth__title">Forgot your password?</h1>
        <p class="muted">Enter your email and we'll send you a link to choose a new one.</p>
        ${notice()}
        <form class="acc-form" data-form="forgot">
          <label class="field"><span>Email</span><input name="email" type="email" autocomplete="email" required value="${esc(S.email)}" /></label>
          <button class="btn btn--accent btn--block" type="submit">Send the link</button>
        </form>
        <div class="acc-auth__alt"><button type="button" class="linkBtn" data-view="signin">Back to sign in</button></div>`);
    }
    const register = S.view === "register";
    return authCard(`
      <div class="acc-tabs" role="tablist">
        <button type="button" role="tab" aria-selected="${!register}" class="acc-tabs__btn${register ? "" : " is-on"}" data-view="signin">Sign in</button>
        <button type="button" role="tab" aria-selected="${register}" class="acc-tabs__btn${register ? " is-on" : ""}" data-view="register">Create account</button>
      </div>
      <h1 class="acc-auth__title">${register ? "Create your account" : "Welcome back"}</h1>
      <p class="muted">${register ? "Book and manage calls, and message Ahmed directly." : "Sign in to see your calls and messages."}</p>
      ${notice()}
      <form class="acc-form" data-form="${register ? "register" : "signin"}">
        ${register ? `<label class="field"><span>Your name</span><input name="name" autocomplete="name" maxlength="100" required /></label>` : ""}
        <label class="field"><span>Email</span><input name="email" type="email" autocomplete="email" maxlength="200" required value="${esc(S.email)}" /></label>
        ${pwField("password", "Password", register ? "new-password" : "current-password")}
        ${register ? `<p class="bm__fine">At least 8 characters, with a number and a lowercase letter.</p>` : ""}
        <button class="btn btn--accent btn--block" type="submit">${register ? "Create account" : "Sign in"}</button>
      </form>
      ${register ? "" : `<div class="acc-auth__alt"><button type="button" class="linkBtn" data-view="forgot">Forgot your password?</button></div>`}`);
  }

  // ---------- Signed in ----------

  function viewShell(inner) {
    const u = Auth.user;
    const person = { name: u.displayName || u.email, avatarUrl: u.avatarUrl };
    const unread = S.chat.unread ? `<span class="acc-badge">${S.chat.unread}</span>` : "";
    return `
      <section class="acc-shell">
        <aside class="acc-side">
          <div class="acc-me">${Live.avatar(person, 52)}<div><strong>${esc(person.name)}</strong><span class="muted">${esc(u.email)}</span></div></div>
          <nav class="acc-nav" aria-label="Account">
            ${TABS.map(([id, label, ic]) => `<a href="#${id}" class="acc-nav__link${S.tab === id ? " is-on" : ""}">${icon(ic)} ${label}${id === "chat" ? unread : ""}</a>`).join("")}
            <button type="button" class="acc-nav__link" data-act="signout">${icon("i-logout")} Sign out</button>
          </nav>
        </aside>
        <div class="acc-main">${inner}</div>
      </section>`;
  }

  function fmtWhen(iso) { return `${B.fmtLong(iso)}, ${B.fmtTime(iso)}`; }

  function viewBookings() {
    if (S.picker) return viewReschedule();
    if (!S.bookings) return `<h1 class="acc-h">Your calls</h1><div class="bm__msg"><span class="typing"><i></i><i></i><i></i></span> Loading…</div>`;
    const upcoming = S.bookings.filter((b) => b.canChange);
    const past = S.bookings.filter((b) => !b.canChange);
    const card = (b) => `
      <article class="acc-booking${b.canChange ? "" : " is-past"}">
        <div class="acc-booking__when">
          <span class="mg__status is-${esc(b.status)}">${esc(b.canChange ? "Upcoming" : b.status.replace("_", " "))}</span>
          <h3>${esc(b.type.name)} · ${b.duration} min</h3>
          <p class="muted">${esc(fmtWhen(b.start))} <span class="faint">· ${esc(B.tzLabel)}</span></p>
        </div>
        ${b.canChange ? `<div class="acc-booking__actions">
          ${b.meetUrl ? `<a class="btn btn--accent btn--sm" href="${esc(b.meetUrl)}" target="_blank" rel="noreferrer">${icon("i-video")} Join</a>` : ""}
          <button type="button" class="btn btn--line btn--sm" data-act="reschedule" data-id="${b.id}">Reschedule</button>
          <button type="button" class="btn btn--line btn--sm" data-act="cancel" data-id="${b.id}">Cancel</button>
        </div>` : ""}
      </article>`;
    return `
      <div class="acc-head"><h1 class="acc-h">Your calls</h1><a class="btn btn--accent btn--sm" href="./#book">${icon("i-cal")} Book a call</a></div>
      ${S.notice ? `<p class="bm__notice" role="status">${esc(S.notice)}</p>` : ""}
      ${upcoming.length ? upcoming.map(card).join("") : `<div class="acc-empty"><p>No upcoming calls.</p><a class="linkBtn" href="./#book">Book one now</a></div>`}
      ${past.length ? `<h2 class="acc-sub">Past and cancelled</h2>${past.map(card).join("")}` : ""}`;
  }

  function viewReschedule() {
    const p = S.picker;
    if (!p.slots) return `<div class="bm__msg"><span class="typing"><i></i><i></i><i></i></span> Loading times…</div>`;
    if (p.slot) {
      const end = new Date(Date.parse(p.slot) + p.booking.duration * 60000).toISOString();
      return `
        <button type="button" class="bm__back" data-act="pickAgain">${icon("i-back")} Change time</button>
        <h1 class="acc-h">Move your call to</h1>
        <div class="bm__when"><p class="bm__summaryDate">${B.fmtLong(p.slot)}</p>
          <p class="bm__summaryTime">${B.fmtTime(p.slot)} – ${B.fmtTime(end)} <span class="muted">· ${esc(B.tzLabel)}</span></p></div>
        <div class="mg__actions"><button type="button" class="btn btn--accent" data-act="doMove">Confirm new time</button></div>`;
    }
    return `
      <button type="button" class="bm__back" data-act="closePicker">${icon("i-back")} Back to your calls</button>
      <h1 class="acc-h">Pick a new time</h1>
      <p class="muted" style="margin-bottom:20px">Currently ${esc(fmtWhen(p.booking.start))}.</p>
      ${S.notice ? `<p class="bm__notice" role="alert">${esc(S.notice)}</p>` : ""}
      ${p.slots.length ? B.pickerHtml(p) : `<div class="acc-empty"><p>No other open times right now. Send Ahmed a message instead.</p></div>`}`;
  }

  function chatStatus() {
    const a = S.chat.admin;
    if (S.chat.typing) return `<span class="lc-status is-typing">typing…</span>`;
    if (!a) return "";
    return `<span class="lc-status${a.online ? " is-online" : ""}">${a.online ? "Online" : esc(Live.lastSeen(a.lastSeenAt))}</span>`;
  }

  function chatBanner() {
    const st = S.chat.state;
    return st === "connected" ? "" : `<div class="lc-banner">${st === "reconnecting" ? "Reconnecting…" : st === "connecting" ? "Connecting…" : "You're offline. Reconnecting when the connection is back…"}</div>`;
  }

  function viewChat() {
    const c = S.chat;
    const a = c.admin || { name: "Ahmed Eldegla" };
    const banner = chatBanner();
    return `
      <section class="lc">
        <header class="lc-head">${Live.avatar(a, 44)}<div><strong>${esc(a.name)}</strong><div id="lcStatus">${chatStatus()}</div></div></header>
        <div id="lcBanner">${banner}</div>
        <div class="lc-list" id="lcList">
          ${c.hasMore ? `<button type="button" class="linkBtn lc-more" data-act="older">Load earlier messages</button>` : ""}
          ${!c.loaded ? `<div class="bm__msg"><span class="typing"><i></i><i></i><i></i></span></div>` : c.messages.length
            ? Live.bubbles(c.messages, (m) => !m.fromAdmin)
            : `<div class="lc-empty">${Live.avatar(a, 64)}<p><strong>Message ${esc(a.name.split(" ")[0])} directly</strong></p><p class="muted">Ask about a project, a role, or anything else. You'll get an email when he replies.</p></div>`}
        </div>
        <form class="lc-compose" data-form="chat">
          <textarea name="body" rows="1" maxlength="4000" placeholder="Write a message…" aria-label="Message" required></textarea>
          <button class="btn btn--accent lc-send" type="submit" aria-label="Send">${icon("i-send")}</button>
        </form>
      </section>`;
  }

  function viewProfile() {
    const u = Auth.user;
    const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [tz];
    const current = u.timeZone || tz;
    return `
      <h1 class="acc-h">Profile</h1>
      <div class="acc-avatarRow">
        ${Live.avatar({ name: u.displayName || u.email, avatarUrl: u.avatarUrl }, 88)}
        <div>
          <label class="btn btn--line btn--sm acc-upload">${icon("i-camera")} ${u.avatarUrl ? "Change photo" : "Add a photo"}<input type="file" accept="image/*" data-act="avatar" hidden /></label>
          ${u.avatarUrl ? `<button type="button" class="linkBtn" data-act="removeAvatar">Remove</button>` : ""}
          <p class="bm__fine">JPG, PNG or WebP. It's resized before uploading.</p>
        </div>
      </div>
      <form class="acc-form acc-form--wide" data-form="profile">
        <div class="form__row">
          <label class="field"><span>Name</span><input name="displayName" maxlength="100" required value="${esc(u.displayName)}" /></label>
          <label class="field"><span>Company <em>(optional)</em></span><input name="company" maxlength="100" value="${esc(u.company)}" /></label>
        </div>
        <label class="field"><span>Timezone</span><select name="timeZone">${zones.map((z) => `<option ${z === current ? "selected" : ""}>${esc(z)}</option>`).join("")}</select></label>
        <label class="field"><span>Email</span><input value="${esc(u.email)}" disabled /></label>
        <div><button class="btn btn--accent" type="submit">Save changes</button></div>
      </form>`;
  }

  function viewSecurity() {
    return `
      <h1 class="acc-h">Security</h1>
      <form class="acc-form acc-form--wide" data-form="password">
        <h2 class="acc-sub">Change password</h2>
        ${pwField("currentPassword", "Current password", "current-password")}
        ${pwField("newPassword", "New password", "new-password")}
        <p class="bm__fine">Other devices will be signed out.</p>
        <div><button class="btn btn--accent" type="submit">Update password</button></div>
      </form>
      <form class="acc-form acc-form--wide acc-danger" data-form="delete">
        <h2 class="acc-sub">Delete account</h2>
        <p class="muted">Your profile, photo and messages are deleted. Calls you booked stay on Ahmed's calendar.</p>
        ${pwField("password", "Confirm with your password", "current-password")}
        <div><button class="btn btn--danger" type="submit">Delete my account</button></div>
      </form>`;
  }

  function viewAdmin() {
    return authCard(`
      <h1 class="acc-auth__title">Hi ${esc(Auth.user.displayName || "")}</h1>
      <p class="muted">You're signed in with the admin account.</p>
      <div class="mg__actions"><a class="btn btn--accent" href="./admin.html">Open the dashboard</a><button type="button" class="btn btn--line" data-act="signout">Sign out</button></div>`);
  }

  // ---------- Render ----------

  function render() {
    if (!Auth.signedIn) { stopChat(); root.innerHTML = viewSignedOut(); focusFirst(); return; }
    if (Auth.isAdmin) { root.innerHTML = viewAdmin(); return; }
    if (!TABS.some(([id]) => id === S.tab)) S.tab = "bookings";
    const views = { bookings: viewBookings, chat: viewChat, profile: viewProfile, security: viewSecurity };
    root.innerHTML = viewShell(views[S.tab]());
    if (S.tab === "chat") afterChatRender();
  }
  function focusFirst() { root.querySelector("form input:not([disabled])")?.focus(); }

  // Updates only the chat pieces, so typing in the box isn't interrupted
  function renderChatList(stick = true) {
    const list = $("#lcList");
    if (!list || S.tab !== "chat") return;
    const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 120;
    const c = S.chat;
    const a = c.admin || { name: "Ahmed Eldegla" };
    list.innerHTML = `${c.hasMore ? `<button type="button" class="linkBtn lc-more" data-act="older">Load earlier messages</button>` : ""}${c.messages.length
      ? Live.bubbles(c.messages, (m) => !m.fromAdmin)
      : `<div class="lc-empty">${Live.avatar(a, 64)}<p><strong>Message ${esc(a.name.split(" ")[0])} directly</strong></p><p class="muted">Ask about a project, a role, or anything else. You'll get an email when he replies.</p></div>`}`;
    if (stick && nearBottom) list.scrollTop = list.scrollHeight;
  }
  function renderChatStatus() {
    const el = $("#lcStatus");
    if (el) el.innerHTML = chatStatus();
  }
  function afterChatRender() {
    const list = $("#lcList");
    if (list) list.scrollTop = list.scrollHeight;
    const box = $(".lc-compose textarea");
    if (box) { box.focus(); autosize(box); }
    markRead();
  }
  function autosize(t) { t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 160) + "px"; }

  // ---------- Data ----------

  async function loadBookings() {
    try {
      S.bookings = (await Auth.json("/account/bookings")).bookings;
    } catch (err) {
      S.bookings = [];
      S.notice = errText(err);
    }
    if (S.tab === "bookings") render();
  }

  async function startChat() {
    if (S.live || !Auth.signedIn || Auth.isAdmin || !window.signalR) return;
    try {
      const data = await Auth.json("/live/me");
      Object.assign(S.chat, { conversationId: data.conversationId, admin: data.admin, messages: data.messages, hasMore: data.hasMore, unread: data.unread, loaded: true });
    } catch {
      S.chat.loaded = true;
    }
    S.live = Live.connect({
      state(state) {
        const was = S.chat.state;
        S.chat.state = state;
        if (state === "connected" && was !== "connected") refreshChat();
        const el = $("#lcBanner");
        if (el) el.innerHTML = chatBanner();
      },
      message(m) {
        if (S.chat.messages.some((x) => x.id === m.id)) return;
        S.chat.messages.push(m);
        if (m.fromAdmin) {
          S.chat.typing = false;
          if (S.tab === "chat" && !document.hidden) markRead();
          else { S.chat.unread = (S.chat.unread || 0) + 1; notify(m); }
        }
        if (S.tab === "chat") { renderChatList(); renderChatStatus(); } else render();
      },
      typing(t) {
        if (!t.fromAdmin) return;
        S.chat.typing = true;
        renderChatStatus();
        clearTimeout(S.typingTimer);
        S.typingTimer = setTimeout(() => { S.chat.typing = false; renderChatStatus(); }, 4000);
      },
      read(r) {
        if (!r.byAdmin) return;
        S.chat.messages.forEach((m) => { if (!m.fromAdmin && !m.readAt) m.readAt = r.readAt; });
        renderChatList(false);
      },
      adminPresence(p) {
        if (!S.chat.admin) return;
        S.chat.admin.online = p.online;
        if (p.lastSeenAt) S.chat.admin.lastSeenAt = p.lastSeenAt;
        renderChatStatus();
      }
    });
    if (S.tab === "chat") render();
  }

  // After a reconnect, pick up anything that arrived while offline
  async function refreshChat() {
    try {
      const data = await Auth.json("/live/me");
      Object.assign(S.chat, { admin: data.admin, messages: data.messages, hasMore: data.hasMore, unread: data.unread });
      if (S.tab === "chat") { renderChatList(); renderChatStatus(); markRead(); }
    } catch {}
  }

  function stopChat() {
    S.live?.stop();
    S.live = null;
  }

  function markRead() {
    if (S.tab !== "chat" || document.hidden) return;
    const unread = S.chat.messages.some((m) => m.fromAdmin && !m.readAt);
    S.chat.unread = 0;
    if (unread) {
      S.chat.messages.forEach((m) => { if (m.fromAdmin && !m.readAt) m.readAt = new Date().toISOString(); });
      S.live?.markRead();
    }
    root.querySelector(".acc-badge")?.remove();
  }

  function notify(m) {
    toast(`New message from ${S.chat.admin?.name || "Ahmed"}`);
    if (document.hidden && "Notification" in window && Notification.permission === "granted") {
      try { new Notification(S.chat.admin?.name || "New message", { body: m.body.slice(0, 120), icon: "./assets/favicon-192.png" }); } catch {}
    }
  }

  // Shrinks the photo in the browser before upload (max 512 px, WebP or JPEG)
  function resizeImage(file, max = 512) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        canvas.toBlob((blob) => {
          if (blob && blob.type === "image/webp") return resolve(blob);
          canvas.toBlob((jpeg) => (jpeg ? resolve(jpeg) : reject(new Error("resize"))), "image/jpeg", 0.88);
        }, "image/webp", 0.88);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("unreadable")); };
      img.src = url;
    });
  }

  // ---------- Events ----------

  async function busy(btn, label, work) {
    const original = btn?.innerHTML;
    if (btn) { btn.disabled = true; btn.textContent = label; }
    try { return await work(); } finally { if (btn && btn.isConnected) { btn.disabled = false; btn.innerHTML = original; } }
  }

  root.addEventListener("submit", async (e) => {
    const form = e.target.closest("form[data-form]");
    if (!form) return;
    e.preventDefault();
    const kind = form.dataset.form;
    const f = Object.fromEntries(new FormData(form));
    const btn = form.querySelector("[type=submit]");

    if (kind === "chat") {
      const body = (f.body || "").trim();
      if (!body) return;
      if (!S.live?.connected) { toast("Not connected yet. Try again in a moment."); return; }
      const box = form.elements.body;
      box.value = "";
      autosize(box);
      const temp = { id: "tmp" + Date.now(), body, fromAdmin: false, sentAt: new Date().toISOString(), pending: true };
      S.chat.messages.push(temp);
      renderChatList();
      $("#lcList").scrollTop = 1e9;
      try {
        const saved = await S.live.send(body);
        const i = S.chat.messages.indexOf(temp);
        if (S.chat.messages.some((m) => m.id === saved.id)) S.chat.messages.splice(i, 1);
        else S.chat.messages[i] = saved;
      } catch {
        S.chat.messages.splice(S.chat.messages.indexOf(temp), 1);
        box.value = body;
        toast("Couldn't send. Please try again.");
      }
      renderChatList();
      return;
    }

    S.notice = "";
    try {
      if (kind === "signin") {
        S.email = f.email.trim();
        await busy(btn, "Signing in…", () => Auth.login(S.email, f.password));
        afterSignIn();
      } else if (kind === "register") {
        S.email = f.email.trim();
        const r = await busy(btn, "Creating…", () => Auth.register(S.email, f.password, f.name.trim()));
        if (r.needsVerification) { S.view = "sent"; S.sentFor = "verify"; render(); } else afterSignIn();
      } else if (kind === "forgot") {
        S.email = f.email.trim();
        await busy(btn, "Sending…", () => Auth.forgot(S.email));
        S.view = "sent"; S.sentFor = "reset"; render();
      } else if (kind === "reset") {
        await busy(btn, "Saving…", () => Auth.reset(link.uid, link.token, f.password));
        toast("Password changed. Sign in with your new password.");
        S.view = "signin"; render();
      } else if (kind === "profile") {
        const user = await busy(btn, "Saving…", () => Auth.json("/account/me", { method: "PUT", body: { displayName: f.displayName.trim(), company: f.company.trim(), timeZone: f.timeZone } }));
        Auth.setUser(user);
        toast("Profile saved");
        render();
      } else if (kind === "password") {
        const r = await busy(btn, "Updating…", () => Auth.json("/account/change-password", { method: "POST", body: { currentPassword: f.currentPassword, newPassword: f.newPassword } }));
        Auth.adopt(r);
        form.reset();
        toast("Password updated. Other devices were signed out.");
      } else if (kind === "delete") {
        if (!confirm("Delete your account? This can't be undone.")) return;
        await busy(btn, "Deleting…", () => Auth.json("/account/delete", { method: "POST", body: { password: f.password } }));
        await Auth.logout();
        toast("Your account was deleted");
        S.view = "signin";
        render();
      }
    } catch (err) {
      if (err.code === "email_not_verified") { S.view = "sent"; S.sentFor = "verify"; S.notice = errText(err); render(); return; }
      if (kind === "signin" || kind === "register" || kind === "forgot" || kind === "reset") { S.notice = errText(err); render(); return; }
      toast(errText(err));
    }
  });

  root.addEventListener("click", async (e) => {
    const view = e.target.closest("[data-view]")?.dataset.view;
    if (view) { S.view = view; S.notice = ""; render(); return; }
    const actEl = e.target.closest("[data-act]");
    const act = actEl?.dataset.act;

    if (act === "signout") { await Auth.logout(); S.view = "signin"; S.bookings = null; render(); return; }
    if (act === "resend") {
      try { await Auth.resend(S.email); S.notice = "Sent again. It can take a minute to arrive."; } catch (err) { S.notice = errText(err); }
      render();
      return;
    }
    if (act === "removeAvatar") {
      try { Auth.setUser(await Auth.json("/account/avatar", { method: "DELETE" })); render(); } catch (err) { toast(errText(err)); }
      return;
    }
    if (act === "older") {
      const first = S.chat.messages.find((m) => typeof m.id === "number");
      if (!first) return;
      const list = $("#lcList");
      const before = list.scrollHeight;
      try {
        const data = await Auth.json(`/live/me/messages?before=${first.id}`);
        S.chat.messages = data.messages.concat(S.chat.messages);
        S.chat.hasMore = data.hasMore;
        renderChatList(false);
        list.scrollTop = list.scrollHeight - before;
      } catch (err) { toast(errText(err)); }
      return;
    }

    // Bookings
    const booking = S.bookings?.find((b) => b.id === actEl?.dataset.id);
    if (act === "cancel" && booking) {
      const reason = prompt("Cancel this call? You can add a reason for Ahmed (optional):", "");
      if (reason === null) return;
      try {
        await Auth.json(`/account/bookings/${booking.id}/cancel`, { method: "POST", body: { reason } });
        S.notice = "Your call is cancelled. Ahmed has been notified.";
        loadBookings();
      } catch (err) { toast(errText(err)); }
      return;
    }
    if (act === "reschedule" && booking) {
      S.picker = { booking, slots: null };
      S.notice = "";
      render();
      try { S.picker.slots = (await Auth.json(`/account/bookings/${booking.id}/slots`)).slots; } catch { S.picker.slots = []; }
      render();
      return;
    }
    if (act === "closePicker") { S.picker = null; S.notice = ""; render(); return; }
    if (act === "pickAgain") { S.picker.slot = null; render(); return; }
    if (act === "doMove" && S.picker?.slot) {
      actEl.disabled = true;
      try {
        await Auth.json(`/account/bookings/${S.picker.booking.id}/reschedule`, { method: "POST", body: { start: S.picker.slot } });
        S.picker = null;
        S.notice = "Done! Your call has a new time. An updated invite is on its way.";
        loadBookings();
      } catch (err) {
        S.picker.slot = null;
        S.notice = errText(err);
        try { S.picker.slots = (await Auth.json(`/account/bookings/${S.picker.booking.id}/slots`)).slots; } catch {}
        render();
      }
      return;
    }
    if (S.picker?.slots && !S.picker.slot) {
      const r = B.pickerClick(e, S.picker);
      if (r) render();
    }
  });

  root.addEventListener("change", async (e) => {
    if (e.target.dataset.act !== "avatar" || !e.target.files?.[0]) return;
    const file = e.target.files[0];
    const label = e.target.closest("label");
    label.classList.add("is-busy");
    try {
      const blob = await resizeImage(file);
      const form = new FormData();
      form.append("file", blob, blob.type === "image/webp" ? "avatar.webp" : "avatar.jpg");
      Auth.setUser(await Auth.json("/account/avatar", { method: "POST", body: form }));
      toast("Photo updated");
      render();
    } catch (err) {
      toast(err.message === "unreadable" ? "That file isn't an image we can read." : errText(err));
      label.classList.remove("is-busy");
    }
  });

  root.addEventListener("keydown", (e) => {
    const box = e.target.closest(".lc-compose textarea");
    if (!box) return;
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      box.form.requestSubmit();
    }
  });
  root.addEventListener("input", (e) => {
    const box = e.target.closest(".lc-compose textarea");
    if (!box) return;
    autosize(box);
    S.live?.typing();
  });

  window.addEventListener("hashchange", () => {
    S.tab = location.hash.slice(1) || "bookings";
    S.picker = null;
    S.notice = "";
    if (S.tab === "chat" && "Notification" in window && Notification.permission === "default") Notification.requestPermission().catch(() => {});
    render();
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) markRead(); });

  Auth.onChange((user) => {
    if (!user) { stopChat(); S.bookings = null; render(); }
  });

  function afterSignIn() {
    S.notice = "";
    if (Auth.isAdmin) { location.href = "./admin.html"; return; }
    if (!location.hash) history.replaceState(null, "", "#bookings");
    S.tab = location.hash.slice(1) || "bookings";
    render();
    loadBookings();
    startChat();
  }

  // ---------- Start ----------
  (async () => {
    if (link.mode === "verify" && link.uid && link.token) {
      S.view = "verify";
      render();
      try {
        await Auth.verify(link.uid, link.token);
        toast("Email confirmed. Welcome!");
        afterSignIn();
      } catch (err) {
        S.view = "signin";
        S.notice = errText(err);
        render();
      }
      return;
    }
    if (link.mode === "reset" && link.uid && link.token) {
      if (Auth.signedIn) await Auth.logout();
      S.view = "reset";
      render();
      return;
    }
    if (Auth.signedIn) {
      // Make sure the stored session still works (and refresh the profile)
      try { Auth.setUser(await Auth.json("/account/me")); } catch (err) { if (err.status === 401) await Auth.logout(); }
    }
    if (Auth.signedIn) afterSignIn(); else render();
  })();
})();
