(() => {
  const API = ["localhost", "127.0.0.1"].includes(location.hostname)
    ? "http://localhost:8787"
    : "https://ahmed-portfolio-chat.ahmedeldegla.workers.dev";
  const EMAIL = "ahmeddagla99@gmail.com";

  const root = document.getElementById("bookingApp");
  if (!root) return;

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "your timezone";
  const state = { slots: [], slotMinutes: 30, day: null, slot: null, busy: false, ownerTz: "Africa/Cairo", draft: { name: "", email: "", topic: "" } };

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const dayKey = (iso) => new Date(iso).toLocaleDateString("en-CA"); // YYYY-MM-DD in visitor's timezone
  const fmtDay = (iso, opts) => new Date(iso).toLocaleDateString("en-GB", opts);
  const fmtTime = (iso) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  function byDay() {
    const map = new Map();
    for (const s of state.slots) {
      const k = dayKey(s);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(s);
    }
    return map;
  }

  // ---------- Views ----------

  function renderMessage(html) {
    root.innerHTML = `<div class="book__msg">${html}</div>`;
  }

  // Keep what the visitor typed when the form is re-rendered
  function saveDraft() {
    const f = root.querySelector("#bookForm");
    if (f) state.draft = { name: f.name.value, email: f.email.value, topic: f.topic.value };
  }

  function renderPicker(notice = "") {
    saveDraft();
    const days = byDay();
    if (!days.size) {
      renderMessage(`No open times in the next two weeks. Email <a href="mailto:${EMAIL}">${EMAIL}</a> and we'll find a time.`);
      return;
    }
    if (!state.day || !days.has(state.day)) state.day = days.keys().next().value;
    const slots = days.get(state.day);

    root.innerHTML = `
      ${notice ? `<p class="book__notice" role="alert">${esc(notice)}</p>` : ""}
      <div class="book__step">
        <p class="book__label mono">1 · Pick a day</p>
        <div class="days" role="listbox" aria-label="Available days">
          ${[...days.entries()].map(([k, list]) => `
            <button type="button" class="day${k === state.day ? " is-active" : ""}" data-day="${k}" role="option" aria-selected="${k === state.day}">
              <span class="day__dow">${fmtDay(list[0], { weekday: "short" })}</span>
              <span class="day__num">${fmtDay(list[0], { day: "numeric" })}</span>
              <span class="day__mon">${fmtDay(list[0], { month: "short" })}</span>
            </button>`).join("")}
        </div>
      </div>
      <div class="book__step">
        <p class="book__label mono">2 · Pick a time <span class="book__tz">(${esc(tz)})</span></p>
        <div class="times">
          ${slots.map((s) => `<button type="button" class="time${s === state.slot ? " is-active" : ""}" data-slot="${s}">${fmtTime(s)}</button>`).join("")}
        </div>
      </div>
      ${state.slot ? renderForm() : ""}`;

    const active = root.querySelector(".day.is-active");
    if (active) active.scrollIntoView({ block: "nearest", inline: "nearest" });
    if (state.slot && !state.draft.name) root.querySelector("#bkName")?.focus({ preventScroll: true });
  }

  function renderForm() {
    return `
      <form class="book__form" id="bookForm" novalidate>
        <p class="book__label mono">3 · Your details</p>
        <p class="book__picked">
          ${fmtDay(state.slot, { weekday: "long", day: "numeric", month: "long" })}, ${fmtTime(state.slot)} · ${state.slotMinutes} min video call
        </p>
        <div class="form__row">
          <label class="field"><span>Name</span><input id="bkName" name="name" autocomplete="name" maxlength="100" required value="${esc(state.draft.name)}" /></label>
          <label class="field"><span>Email</span><input id="bkEmail" name="email" type="email" autocomplete="email" maxlength="200" required value="${esc(state.draft.email)}" /></label>
        </div>
        <label class="field"><span>What would you like to discuss? <em>(optional)</em></span>
          <textarea id="bkTopic" name="topic" rows="3" maxlength="500">${esc(state.draft.topic)}</textarea>
        </label>
        <label class="hp" aria-hidden="true">Website <input name="website" tabindex="-1" autocomplete="off" /></label>
        <button class="btn btn--solid" type="submit">Confirm booking</button>
      </form>`;
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

  function renderDone(b, name) {
    const cal = calendarLinks(b.start, b.end);
    root.innerHTML = `
      <div class="book__done">
        <div class="book__check" aria-hidden="true">✓</div>
        <h3>You're booked, ${esc(name.split(" ")[0])}.</h3>
        <p class="book__when">${fmtDay(b.start, { weekday: "long", day: "numeric", month: "long" })} at ${fmtTime(b.start)} <span class="muted">(${esc(tz)})</span></p>
        <p class="muted">Ahmed will email you the video call link before the call. Need to change it? Email <a href="mailto:${EMAIL}">${EMAIL}</a>.</p>
        <div class="book__cal">
          <a class="btn btn--line btn--sm" href="${cal.google}" target="_blank" rel="noreferrer">Add to Google Calendar</a>
          <a class="btn btn--line btn--sm" href="${cal.ics}" download="call-with-ahmed.ics">Download .ics</a>
        </div>
      </div>`;
  }

  // ---------- Data ----------

  async function loadSlots(notice = "") {
    try {
      const res = await fetch(`${API}/slots`);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      state.slots = data.slots || [];
      state.slotMinutes = data.slotMinutes || 30;
      state.ownerTz = data.timezone || state.ownerTz;
      if (state.slot && !state.slots.includes(state.slot)) state.slot = null;
      renderPicker(notice);
    } catch {
      renderMessage(`Online booking isn't available right now. Email <a href="mailto:${EMAIL}">${EMAIL}</a> to set up a call.`);
    }
  }

  async function submit(form) {
    if (state.busy) return;
    const name = form.name.value.trim();
    const email = form.email.value.trim();
    const topic = form.topic.value.trim();
    if (!name) return form.name.focus();
    if (!form.email.checkValidity() || !email) return form.email.focus();

    state.busy = true;
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    btn.textContent = "Booking…";

    try {
      const res = await fetch(`${API}/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start: state.slot, name, email, topic, website: form.website.value })
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.ok) {
        renderDone(data, name);
        // Email Ahmed as well (works even without Telegram set up)
        window.AE_sendEmail?.({
          name, email,
          message: `[New call booking]\nWhen: ${new Date(data.start).toLocaleString("en-GB", { timeZone: state.ownerTz, dateStyle: "full", timeStyle: "short" })} (${state.ownerTz}), ${state.slotMinutes} min\nVisitor timezone: ${tz}\nTopic: ${topic || "-"}\n\nSend the meeting link from ${location.origin}/admin.html`
        }).catch(() => {});
        return;
      }
      if (data.error === "slot_unavailable") {
        state.slot = null;
        return loadSlots("Sorry, that time was just taken. Please pick another.");
      }
      const msg = {
        email_invalid: "Please enter a valid email address.",
        too_many_bookings: "You already have upcoming calls booked. Email Ahmed to change them.",
        rate_limited: "Too many attempts. Please try again later."
      }[data.error] || "Something went wrong. Please try again.";
      renderPicker(msg);
    } catch {
      renderPicker("Couldn't reach the booking server. Please try again.");
    } finally {
      state.busy = false;
    }
  }

  // ---------- Events ----------

  root.addEventListener("click", (e) => {
    const day = e.target.closest(".day");
    if (day) {
      state.day = day.dataset.day;
      state.slot = null;
      renderPicker();
      return;
    }
    const time = e.target.closest(".time");
    if (time) {
      state.slot = time.dataset.slot;
      renderPicker();
      root.querySelector("#bookForm")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  });
  root.addEventListener("submit", (e) => {
    if (e.target.id !== "bookForm") return;
    e.preventDefault();
    submit(e.target);
  });

  // Load only when the section is near the viewport
  const io = new IntersectionObserver((entries) => {
    if (entries.some((x) => x.isIntersecting)) {
      io.disconnect();
      loadSlots();
    }
  }, { rootMargin: "400px 0px" });
  io.observe(root);
})();
