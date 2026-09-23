(() => {
  // After `npx wrangler deploy`, paste your Worker URL here (it ends with /chat).
  // Until it's set, the chat button stays hidden so visitors never see a broken widget.
  const ENDPOINT = "https://ahmed-portfolio-chat.ahmedeldegla.workers.dev/chat";
  const LOCAL_ENDPOINT = "http://localhost:8787/chat"; // `npx wrangler dev`

  const EMAIL = "ahmeddagla99@gmail.com";
  const STORE_KEY = "ae_chat_v1";
  const GREETING = "Hi! I'm Ahmed's AI assistant. Ask me about his experience or projects, or leave a message and I'll pass it to him.";
  const SUGGESTIONS = ["What has Ahmed built?", "Tell me about his .NET experience", "Can I book a call?"];

  const isLocal = ["localhost", "127.0.0.1"].includes(location.hostname);
  const endpoint = isLocal ? LOCAL_ENDPOINT : ENDPOINT;
  if (!isLocal && endpoint.includes("YOUR-SUBDOMAIN")) return;

  // ---------- State ----------
  let messages = [];      // { role: "user" | "assistant", text }
  let leadSent = false;
  let busy = false;
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORE_KEY) || "null");
    if (saved && Array.isArray(saved.messages)) {
      messages = saved.messages;
      leadSent = Boolean(saved.leadSent);
    }
  } catch {}
  const save = () => {
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify({ messages, leadSent })); } catch {}
  };

  // ---------- Rendering helpers ----------
  const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function format(text) {
    const lines = esc(text).split("\n");
    let html = "";
    let inList = false;
    for (const raw of lines) {
      let line = raw
        .replace(/\[([^\]]+)\]\(#([a-z-]+)\)/g, '<a href="#$2" class="msg__jump">$1</a>')
        .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
        .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noreferrer">$2</a>')
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
      const bullet = /^\s*[-*•]\s+/.test(line);
      if (bullet) {
        if (!inList) { html += "<ul>"; inList = true; }
        html += `<li>${line.replace(/^\s*[-*•]\s+/, "")}</li>`;
      } else {
        if (inList) { html += "</ul>"; inList = false; }
        if (line.trim()) html += `<p>${line}</p>`;
      }
    }
    if (inList) html += "</ul>";
    return html;
  }

  // Hide the machine-readable lead line from the visitor
  const visible = (text) => {
    const i = text.indexOf("[[LEAD");
    return (i === -1 ? text : text.slice(0, i)).trimEnd();
  };

  // ---------- DOM ----------
  const root = document.createElement("div");
  root.className = "chat";
  root.innerHTML = `
    <button class="chat__launch" type="button" aria-expanded="false" aria-controls="chatPanel">
      <span class="chat__launchDot" aria-hidden="true"></span>
      <span class="chat__launchText">Ask my AI assistant</span>
    </button>
    <section class="chat__panel" id="chatPanel" role="dialog" aria-label="Chat with Ahmed's AI assistant" hidden>
      <header class="chat__head">
        <div class="chat__avatar mono" aria-hidden="true">AE</div>
        <div class="chat__who">
          <strong>Ahmed's assistant</strong>
          <span>AI · answers about Ahmed's work</span>
        </div>
        <button class="chat__close iconBtn" type="button" aria-label="Close chat">
          <svg width="18" height="18" viewBox="0 0 24 24" class="ico" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        </button>
      </header>
      <div class="chat__log" aria-live="polite"></div>
      <div class="chat__chips"></div>
      <form class="chat__form">
        <textarea class="chat__input" rows="1" maxlength="1200" placeholder="Ask about Ahmed's work…" aria-label="Your message"></textarea>
        <button class="chat__send" type="submit" aria-label="Send">
          <svg width="18" height="18" viewBox="0 0 24 24" class="ico" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </form>
      <p class="chat__note">AI can make mistakes. For anything important, email <a href="mailto:${EMAIL}">${EMAIL}</a>.</p>
    </section>`;
  document.body.appendChild(root);

  const launch = root.querySelector(".chat__launch");
  const panel = root.querySelector(".chat__panel");
  const log = root.querySelector(".chat__log");
  const chips = root.querySelector(".chat__chips");
  const form = root.querySelector(".chat__form");
  const input = root.querySelector(".chat__input");
  const sendBtn = root.querySelector(".chat__send");

  function bubble(role, html) {
    const el = document.createElement("div");
    el.className = `msg msg--${role}`;
    el.innerHTML = html;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }

  function note(text) {
    const el = document.createElement("div");
    el.className = "msg msg--note";
    el.textContent = text;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
  }

  function renderAll() {
    log.innerHTML = "";
    bubble("assistant", format(GREETING));
    messages.forEach((m) => bubble(m.role, m.role === "user" ? format(m.text) : format(visible(m.text))));
    if (leadSent) note("Your details were sent to Ahmed.");
    chips.innerHTML = messages.length ? "" : SUGGESTIONS.map((s) => `<button type="button" class="chip">${esc(s)}</button>`).join("");
  }

  function setOpen(open) {
    panel.hidden = !open;
    launch.setAttribute("aria-expanded", String(open));
    root.classList.toggle("is-open", open);
    if (open) {
      log.scrollTop = log.scrollHeight;
      if (window.matchMedia("(hover: hover)").matches) input.focus();
    } else {
      launch.focus();
    }
  }

  function autoGrow() {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 120) + "px";
    input.style.overflowY = input.scrollHeight > 120 ? "auto" : "hidden";
  }

  // ---------- Lead handling ----------
  async function handleLead(fullText) {
    if (leadSent) return;
    const m = fullText.match(/\[\[LEAD\]\]\s*(\{[\s\S]*?\})/);
    if (!m) return;
    let lead;
    try { lead = JSON.parse(m[1]); } catch { return; }
    if (!lead || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email || "")) return;

    const transcript = messages
      .map((x) => `${x.role === "user" ? "Visitor" : "Assistant"}: ${visible(x.text)}`)
      .join("\n\n");
    try {
      await window.AE_sendEmail({
        name: String(lead.name || "Portfolio visitor").slice(0, 120),
        email: lead.email,
        message: `[Via AI assistant]\nNeed: ${lead.need || "-"}\n\n--- Conversation ---\n${transcript}`.slice(0, 8000)
      });
      leadSent = true;
      save();
      note("Your details were sent to Ahmed.");
    } catch (err) {
      console.error("Lead email failed:", err);
      note(`Couldn't forward automatically. Please email ${EMAIL} directly.`);
    }
  }

  // ---------- Sending ----------
  async function send(text) {
    text = text.trim();
    if (!text || busy) return;
    busy = true;
    sendBtn.disabled = true;
    chips.innerHTML = "";

    messages.push({ role: "user", text });
    save();
    bubble("user", format(text));
    input.value = "";
    autoGrow();

    const out = bubble("assistant", '<span class="typing"><i></i><i></i><i></i></span>');
    let full = "";

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages })
      });

      if (!res.ok || !res.body) {
        const err = new Error("http");
        err.status = res.status;
        throw err;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          try {
            const data = JSON.parse(line.slice(5));
            const parts = data?.candidates?.[0]?.content?.parts || [];
            full += parts.map((p) => (p.thought ? "" : p.text || "")).join("");
          } catch {}
        }
        const shown = visible(full);
        if (shown) out.innerHTML = format(shown);
        log.scrollTop = log.scrollHeight;
      }

      if (!visible(full)) throw new Error("empty");
      messages.push({ role: "assistant", text: full });
      save();
      out.innerHTML = format(visible(full));
      await handleLead(full);
    } catch (err) {
      messages.pop(); // don't keep a question that never got an answer
      save();
      const busyMsg = err.status === 429
        ? "I'm getting a lot of messages right now. Please try again in a few minutes"
        : "I'm offline at the moment";
      out.classList.add("msg--error");
      out.innerHTML = format(`${busyMsg}. You can reach Ahmed directly at ${EMAIL}.`);
    } finally {
      busy = false;
      sendBtn.disabled = false;
    }
  }

  // ---------- Events ----------
  launch.addEventListener("click", () => setOpen(panel.hidden));
  root.querySelector(".chat__close").addEventListener("click", () => setOpen(false));
  panel.addEventListener("keydown", (e) => e.key === "Escape" && setOpen(false));
  // In-page links from the assistant (e.g. "Book a call") close the chat first
  log.addEventListener("click", (e) => {
    const jump = e.target.closest("a.msg__jump");
    if (!jump) return;
    // "#book" is handled by booking.js (opens the booking window); other anchors scroll
    const handled = e.defaultPrevented;
    e.preventDefault();
    if (!handled) {
      setOpen(false);
      document.querySelector(jump.getAttribute("href"))?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
  // Close the chat when the booking window opens
  document.addEventListener("ae:booking-open", () => {
    if (!panel.hidden) {
      panel.hidden = true;
      launch.setAttribute("aria-expanded", "false");
      root.classList.remove("is-open");
    }
  });
  chips.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (chip) send(chip.textContent);
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    send(input.value);
  });
  input.addEventListener("input", autoGrow);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      send(input.value);
    }
  });

  renderAll();
})();
