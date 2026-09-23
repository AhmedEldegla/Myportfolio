(() => {
  const API = ["localhost", "127.0.0.1"].includes(location.hostname)
    ? "http://localhost:8787"
    : "https://ahmed-portfolio-chat.ahmedeldegla.workers.dev";
  const EMAIL = "ahmeddagla99@gmail.com";

  const dialog = document.getElementById("bookModal");
  const root = document.getElementById("bookingApp");
  if (!dialog || !root) return;

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "your timezone";
  const tzLabel = document.getElementById("bmTz");
  if (tzLabel) tzLabel.textContent = tz.replace(/_/g, " ");

  const state = {
    slots: [], slotMinutes: 30, ownerTz: "Africa/Cairo",
    month: null, day: null, slot: null,
    view: "loading", busy: false, notice: "", booked: null,
    draft: { name: "", email: "", topic: "" }
  };

  // ---------- Helpers ----------
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pad = (n) => String(n).padStart(2, "0");
  const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; // local date
  const monthOf = (k) => k.slice(0, 7);
  const fromKey = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
  const fmtTime = (iso) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const fmtLong = (iso) => new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const icon = (id) => `<svg width="18" height="18" class="ico" aria-hidden="true"><use href="#${id}"/></svg>`;

  function slotsByDay() {
    const map = new Map();
    for (const s of state.slots) {
      const k = keyOf(new Date(s));
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(s);
    }
    return map;
  }

  function saveDraft() {
    const f = root.querySelector("#bookForm");
    if (f) state.draft = { name: f.elements.name.value, email: f.elements.email.value, topic: f.elements.topic.value };
  }

  // ---------- Views ----------
  function render() {
    saveDraft();
    root.dataset.view = state.view;
    if (state.view === "loading") {
      root.innerHTML = `<div class="bm__msg"><span class="typing"><i></i><i></i><i></i></span> Loading available times…</div>`;
    } else if (state.view === "error") {
      root.innerHTML = `<div class="bm__msg">Online booking isn't available right now.<br>Email <a href="mailto:${EMAIL}">${EMAIL}</a> and we'll find a time.</div>`;
    } else if (state.view === "pick") {
      renderPick();
    } else if (state.view === "form") {
      renderForm();
    } else if (state.view === "done") {
      renderDone();
    }
  }

  function renderPick() {
    const days = slotsByDay();
    if (!days.size) {
      root.innerHTML = `<div class="bm__msg">No open times in the next two weeks.<br>Email <a href="mailto:${EMAIL}">${EMAIL}</a> and we'll find a time.</div>`;
      return;
    }
    const keys = [...days.keys()];
    const months = [...new Set(keys.map(monthOf))];
    if (!state.day || !days.has(state.day)) state.day = keys[0];
    if (!state.month || !months.includes(state.month)) state.month = monthOf(state.day);

    const [y, m] = state.month.split("-").map(Number);
    const first = new Date(y, m - 1, 1);
    const lead = (first.getDay() + 6) % 7; // Monday-first grid
    const count = new Date(y, m, 0).getDate();
    const todayKey = keyOf(new Date());
    const mi = months.indexOf(state.month);

    let cells = "";
    for (let i = 0; i < lead; i++) cells += `<span class="cal__pad"></span>`;
    for (let d = 1; d <= count; d++) {
      const k = `${state.month}-${pad(d)}`;
      const avail = days.has(k);
      const cls = ["cal__day", avail && "is-avail", k === state.day && "is-selected", k === todayKey && "is-today"].filter(Boolean).join(" ");
      const label = fromKey(k).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
      cells += avail
        ? `<button type="button" class="${cls}" data-day="${k}" aria-pressed="${k === state.day}" aria-label="${label}, ${days.get(k).length} times available">${d}</button>`
        : `<span class="${cls}" aria-hidden="true">${d}</span>`;
    }

    const times = days.get(state.day);
    const dayTitle = fromKey(state.day).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

    root.innerHTML = `
      ${state.notice ? `<p class="bm__notice" role="alert">${esc(state.notice)}</p>` : ""}
      <div class="bm__pick">
        <div class="cal">
          <div class="cal__head">
            <h3 class="cal__month">${first.toLocaleDateString("en-GB", { month: "long" })} <span>${y}</span></h3>
            <div class="cal__nav">
              <button type="button" class="iconBtn" data-month="-1" aria-label="Previous month" ${mi <= 0 ? "disabled" : ""}><span class="flip">${icon("i-chev")}</span></button>
              <button type="button" class="iconBtn" data-month="1" aria-label="Next month" ${mi >= months.length - 1 ? "disabled" : ""}>${icon("i-chev")}</button>
            </div>
          </div>
          <div class="cal__dow" aria-hidden="true"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div>
          <div class="cal__grid">${cells}</div>
        </div>
        <div class="times">
          <p class="times__day">${dayTitle}</p>
          <div class="times__list">
            ${times.map((s) => `<button type="button" class="time" data-slot="${s}"><span class="time__dot"></span>${fmtTime(s)}</button>`).join("")}
          </div>
        </div>
      </div>`;
  }

  function renderForm() {
    const end = new Date(Date.parse(state.slot) + state.slotMinutes * 60000).toISOString();
    root.innerHTML = `
      <button type="button" class="bm__back" data-back>${icon("i-back")} Back</button>
      <div class="bm__summary">
        <p class="bm__summaryDate">${fmtLong(state.slot)}</p>
        <p class="bm__summaryTime">${fmtTime(state.slot)} – ${fmtTime(end)} <span class="muted">· ${esc(tz.replace(/_/g, " "))}</span></p>
      </div>
      ${state.notice ? `<p class="bm__notice" role="alert">${esc(state.notice)}</p>` : ""}
      <form class="bm__form" id="bookForm" novalidate>
        <label class="field"><span>Your name</span><input name="name" autocomplete="name" maxlength="100" required value="${esc(state.draft.name)}" /></label>
        <label class="field"><span>Email</span><input name="email" type="email" autocomplete="email" maxlength="200" required value="${esc(state.draft.email)}" /></label>
        <label class="field"><span>What would you like to discuss? <em>(optional)</em></span>
          <textarea name="topic" rows="3" maxlength="500">${esc(state.draft.topic)}</textarea>
        </label>
        <label class="hp" aria-hidden="true">Website <input name="website" tabindex="-1" autocomplete="off" /></label>
        <button class="btn btn--accent btn--block" type="submit">Confirm booking</button>
      </form>`;
    if (!state.draft.name) root.querySelector('[name="name"]')?.focus();
  }

  function calendarLinks(start, end) {
    const stamp = (iso) => iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const title = "Call with Ahmed Eldegla";
    const details = `Ahmed will email you the video call link.\nQuestions: ${EMAIL}`;
    const google = "https://calendar.google.com/calendar/render?action=TEMPLATE"
      + `&text=${encodeURIComponent(title)}&dates=${stamp(start)}/${stamp(end)}&details=${encodeURIComponent(details)}`;
    const ics = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ahmedeldegla.com//booking//EN",
      "BEGIN:VEVENT",
      `UID:${stamp(start)}-${Math.random().toString(36).slice(2)}@ahmedeldegla.com`,
      `DTSTAMP:${stamp(new Date().toISOString())}`,
      `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`,
      `SUMMARY:${title}`, `DESCRIPTION:${details.replace(/\n/g, "\\n")}`,
      "END:VEVENT", "END:VCALENDAR"
    ].join("\r\n");
    return { google, ics: "data:text/calendar;charset=utf-8," + encodeURIComponent(ics) };
  }

  function renderDone() {
    const b = state.booked;
    const cal = calendarLinks(b.start, b.end);
    root.innerHTML = `
      <div class="bm__done">
        <div class="bm__check" aria-hidden="true">✓</div>
        <h3>You're booked, ${esc(b.name.split(" ")[0])}!</h3>
        <p class="bm__summaryDate">${fmtLong(b.start)}</p>
        <p class="bm__summaryTime">${fmtTime(b.start)} – ${fmtTime(b.end)} <span class="muted">· ${esc(tz.replace(/_/g, " "))}</span></p>
        <p class="muted">Ahmed will email the video call link to <strong>${esc(b.email)}</strong>. Need to change it? Email <a href="mailto:${EMAIL}">${EMAIL}</a>.</p>
        <div class="bm__cal">
          <a class="btn btn--line btn--sm" href="${cal.google}" target="_blank" rel="noreferrer">Add to Google Calendar</a>
          <a class="btn btn--line btn--sm" href="${cal.ics}" download="call-with-ahmed.ics">Download .ics</a>
        </div>
        <button type="button" class="btn btn--solid btn--sm" data-close>Done</button>
      </div>`;
  }

  // ---------- Data ----------
  async function loadSlots(notice = "") {
    if (!state.slots.length) { state.view = "loading"; render(); }
    try {
      const res = await fetch(`${API}/slots`);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      state.slots = data.slots || [];
      state.slotMinutes = data.slotMinutes || 30;
      state.ownerTz = data.timezone || state.ownerTz;
      state.notice = notice;
      state.view = "pick";
    } catch {
      state.view = "error";
    }
    render();
  }

  async function submit(form) {
    if (state.busy) return;
    const f = form.elements;
    const name = f.name.value.trim();
    const email = f.email.value.trim();
    const topic = f.topic.value.trim();
    if (!name) return f.name.focus();
    if (!email || !f.email.checkValidity()) {
      state.notice = "Please enter a valid email address.";
      render();
      return root.querySelector('[name="email"]')?.focus();
    }

    state.busy = true;
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    btn.textContent = "Booking…";

    try {
      const res = await fetch(`${API}/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start: state.slot, name, email, topic, website: f.website.value })
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.ok) {
        state.booked = { ...data, name, email };
        state.slots = state.slots.filter((s) => s !== state.slot);
        state.slot = null;
        state.notice = "";
        state.draft = { name: "", email: "", topic: "" };
        state.view = "done";
        render();
        // Email Ahmed as well (works even without Telegram set up)
        window.AE_sendEmail?.({
          name, email,
          message: `[New call booking]\nWhen: ${new Date(data.start).toLocaleString("en-GB", { timeZone: state.ownerTz, dateStyle: "full", timeStyle: "short" })} (${state.ownerTz}), ${state.slotMinutes} min\nVisitor timezone: ${tz}\nTopic: ${topic || "-"}\n\nSend the meeting link from ${location.origin}/admin.html`
        }).catch(() => {});
        return;
      }
      if (data.error === "slot_unavailable") {
        state.slot = null;
        state.view = "pick";
        saveDraft();
        return loadSlots("Sorry, that time was just taken. Please pick another.");
      }
      state.notice = {
        email_invalid: "Please enter a valid email address.",
        too_many_bookings: "You already have upcoming calls booked. Email Ahmed to change them.",
        rate_limited: "Too many attempts. Please try again later."
      }[data.error] || "Something went wrong. Please try again.";
      render();
    } catch {
      state.notice = "Couldn't reach the booking server. Please try again.";
      render();
    } finally {
      state.busy = false;
    }
  }

  // ---------- Open / close ----------
  function open() {
    if (dialog.open) return;
    document.dispatchEvent(new CustomEvent("ae:booking-open"));
    if (state.view === "done") { state.view = "pick"; state.notice = ""; }
    document.documentElement.classList.add("modal-open");
    dialog.showModal();
    loadSlots(); // always refresh, so taken times disappear
  }
  // Unlock page scroll right away; the dialog's own "close" event can arrive late
  const unlock = () => document.documentElement.classList.remove("modal-open");
  function close() {
    unlock();
    if (dialog.open) dialog.close();
  }
  dialog.addEventListener("cancel", unlock); // Esc key
  dialog.addEventListener("close", unlock);

  // Any "Book a call" trigger on the page (buttons, #book links, links from the AI chat)
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-book], a[href='#book']");
    if (!t) return;
    e.preventDefault();
    open();
  }, true);

  // Click on the dark backdrop closes
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) close();
  });

  dialog.addEventListener("click", (e) => {
    if (e.target.closest("[data-close]")) return close();

    const day = e.target.closest("[data-day]");
    if (day) {
      state.day = day.dataset.day;
      state.notice = "";
      render();
      root.querySelector(".times")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      return;
    }
    const nav = e.target.closest("[data-month]");
    if (nav) {
      const months = [...new Set([...slotsByDay().keys()].map(monthOf))];
      const i = months.indexOf(state.month) + Number(nav.dataset.month);
      if (months[i]) {
        state.month = months[i];
        state.day = [...slotsByDay().keys()].find((k) => monthOf(k) === state.month);
        render();
      }
      return;
    }
    const time = e.target.closest("[data-slot]");
    if (time) {
      state.slot = time.dataset.slot;
      state.notice = "";
      state.view = "form";
      render();
      return;
    }
    if (e.target.closest("[data-back]")) {
      state.view = "pick";
      state.notice = "";
      render();
    }
  });

  root.addEventListener("submit", (e) => {
    if (e.target.id !== "bookForm") return;
    e.preventDefault();
    submit(e.target);
  });

  // Deep link: ahmedeldegla.com/#book opens the booking window
  if (location.hash === "#book") open();
})();
