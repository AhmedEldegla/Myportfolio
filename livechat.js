// Real-time chat connection (SignalR), shared by the client account page and the admin dashboard.
// Needs vendor/signalr.min.js and auth.js.
window.AELive = (() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /** handlers: { message, typing, read, presence, adminPresence, state } (all optional). */
  function connect(handlers = {}) {
    const on = (name, ...args) => { try { handlers[name]?.(...args); } catch (err) { console.error(err); } };
    const conn = new signalR.HubConnectionBuilder()
      .withUrl(window.AE_API + "/hubs/chat", { accessTokenFactory: async () => (await window.AEAuth.accessToken()) || "" })
      .withAutomaticReconnect([0, 2000, 5000, 10000, 20000, 30000])
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    conn.on("message", (m) => on("message", m));
    conn.on("typing", (t) => on("typing", t));
    conn.on("read", (r) => on("read", r));
    conn.on("presence", (p) => on("presence", p));
    conn.on("adminPresence", (p) => on("adminPresence", p));
    conn.onreconnecting(() => on("state", "reconnecting"));
    conn.onreconnected(() => on("state", "connected"));
    conn.onclose(() => on("state", "disconnected"));

    let stopped = false;
    async function start(attempt = 0) {
      if (stopped) return;
      on("state", "connecting");
      try {
        await conn.start();
        on("state", "connected");
      } catch {
        on("state", "disconnected");
        // Keep trying in the background (the free server may be waking up)
        setTimeout(() => start(attempt + 1), Math.min(30000, 2000 * 2 ** attempt));
      }
    }
    start();

    // Reconnect when a sleeping tab wakes up
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && conn.state === signalR.HubConnectionState.Disconnected && !stopped) start();
    });

    let lastTyping = 0;
    return {
      get connected() { return conn.state === signalR.HubConnectionState.Connected; },
      send: (body, conversationId = null) => conn.invoke("SendMessage", body, conversationId),
      typing(conversationId = null) {
        if (Date.now() - lastTyping < 2500 || conn.state !== signalR.HubConnectionState.Connected) return;
        lastTyping = Date.now();
        conn.invoke("Typing", conversationId).catch(() => {});
      },
      markRead: (conversationId = null) => conn.state === signalR.HubConnectionState.Connected ? conn.invoke("MarkRead", conversationId).catch(() => {}) : Promise.resolve(),
      stop() { stopped = true; return conn.stop(); }
    };
  }

  // ---------- Shared rendering helpers ----------

  const time = (iso) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  function dayLabel(iso) {
    const d = new Date(iso);
    const today = new Date();
    const yesterday = new Date(Date.now() - 86400000);
    if (d.toDateString() === today.toDateString()) return "Today";
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
  }

  function lastSeen(iso) {
    if (!iso) return "Offline";
    const s = (Date.now() - Date.parse(iso)) / 1000;
    if (s < 60) return "Last seen just now";
    if (s < 3600) return `Last seen ${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `Last seen ${Math.floor(s / 3600)} h ago`;
    return `Last seen ${new Date(iso).toLocaleDateString([], { day: "numeric", month: "short" })}`;
  }

  function avatar(person, size = 40) {
    const name = person?.name || "?";
    const initials = name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
    return `<span class="lc-avatar${person?.online ? " is-online" : ""}" style="--s:${size}px">${
      person?.avatarUrl ? `<img src="${esc(person.avatarUrl)}" alt="" />` : `<span>${esc(initials)}</span>`}</span>`;
  }

  /** Escapes text, keeps line breaks and turns URLs into links. */
  function richText(text) {
    return esc(text)
      .replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, '<a href="$1" target="_blank" rel="noreferrer noopener">$1</a>')
      .replace(/\n/g, "<br>");
  }

  /** Message bubbles with day separators. mine(m) says which side a message belongs to. */
  function bubbles(messages, mine) {
    let lastDay = "";
    return messages.map((m) => {
      const day = dayLabel(m.sentAt);
      const sep = day !== lastDay ? `<div class="lc-day"><span>${esc(day)}</span></div>` : "";
      lastDay = day;
      const own = mine(m);
      const ticks = own ? `<span class="lc-ticks${m.readAt ? " is-read" : ""}" title="${m.readAt ? "Seen" : "Sent"}">${m.readAt ? "✓✓" : "✓"}</span>` : "";
      return `${sep}<div class="lc-msg${own ? " is-mine" : ""}${m.pending ? " is-pending" : ""}" data-id="${m.id}">
        <div class="lc-bubble">${richText(m.body)}<span class="lc-meta">${time(m.sentAt)}${ticks}</span></div></div>`;
    }).join("");
  }

  return { connect, esc, avatar, bubbles, lastSeen, time, richText };
})();
