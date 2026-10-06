// "Book a call" window: meeting type -> date & time -> details -> confirmation with the video link.
(() => {
  const B = window.AEBooking;
  const dialog = document.getElementById("bookModal");
  const root = document.getElementById("bookingApp");
  if (!B || !dialog || !root) return;
  const { API, EMAIL, esc, fmtTime, fmtLong, icon } = B;

  const $info = {
    title: document.getElementById("bmTitle"),
    dur: document.getElementById("bmDur"),
    desc: document.getElementById("bmDesc"),
    tz: document.getElementById("bmTz")
  };
  if ($info.tz) $info.tz.textContent = B.tzLabel;

  const state = {
    view: "loading",            // loading | error | types | pick | form | done
    config: null, type: null,
    picker: { slots: [], month: null, day: null, slot: null },
    ownerTz: "Africa/Cairo", notice: "", busy: false, booked: null,
    draft: { name: "", email: "", answers: {} }
  };

  // ---------- Left panel follows the chosen meeting type ----------
  function syncInfo() {
    const t = state.type;
    if ($info.title) $info.title.textContent = t ? t.name : "Book a call";
    if ($info.dur) $info.dur.textContent = t ? `${t.duration} min` : "15–60 min";
    if ($info.desc) $info.desc.textContent = t ? t.description : "Pick the kind of call that fits. Arabic or English.";
  }

  function steps() {
    const order = ["types", "pick", "form"];
    const at = state.view === "done" ? 3 : order.indexOf(state.view);
    if (at < 0) return "";
    return `<ol class="bsteps" aria-label="Booking steps">${["Type", "Time", "Details"].map((s, i) =>
      `<li class="${i < at ? "is-done" : i === at ? "is-on" : ""}"><span>${i < at ? "✓" : i + 1}</span>${s}</li>`).join("")}</ol>`;
  }

  // ---------- Views ----------
  function saveDraft() {
    const f = root.querySelector("#bookForm");
    if (!f) return;
    state.draft.name = f.elements.name.value;
    state.draft.email = f.elements.email.value;
    for (const q of state.type?.questions || []) {
      const el = f.elements[`q_${q.id}`];
      if (el) state.draft.answers[q.id] = el.value;
    }
  }

  function render() {
    saveDraft();
    syncInfo();
    root.dataset.view = state.view;
    let html = "";
    if (state.view === "loading") {
      html = `<div class="bm__msg"><span class="typing"><i></i><i></i><i></i></span> Loading…</div>`;
    } else if (state.view === "error") {
      html = `<div class="bm__msg">Online booking isn't available right now.<br>Email <a href="mailto:${EMAIL}">${EMAIL}</a> and we'll find a time.</div>`;
    } else if (state.view === "types") {
      html = viewTypes();
    } else if (state.view === "pick") {
      html = viewPick();
    } else if (state.view === "form") {
      html = viewForm();
    } else if (state.view === "done") {
      html = viewDone();
    }
    root.innerHTML = `${steps()}<div class="bview">${html}</div>`;
  }

  function viewTypes() {
    const types = state.config.types;
    return `
      <h3 class="bhead">What would you like to talk about?</h3>
      <div class="btypes">
        ${types.map((t, i) => `
          <button type="button" class="btype" data-type="${esc(t.id)}" style="--i:${i}">
            <span class="btype__dur">${t.duration}<small>min</small></span>
            <span class="btype__body"><strong>${esc(t.name)}</strong><span>${esc(t.description)}</span></span>
            <span class="btype__go">${icon("i-chev")}</span>
          </button>`).join("")}
      </div>`;
  }

  function viewPick() {
    const back = state.config.types.length > 1 ? `<button type="button" class="bm__back" data-back="types">${icon("i-back")} Meeting type</button>` : "";
    if (!state.picker.slots.length) {
      return `${back}<div class="bm__msg">No open times in the next ${state.config.daysAhead} days.<br>Email <a href="mailto:${EMAIL}">${EMAIL}</a> and we'll find a time.</div>`;
    }
    return `${back}${state.notice ? `<p class="bm__notice" role="alert">${esc(state.notice)}</p>` : ""}${B.pickerHtml(state.picker)}`;
  }

  function question(q) {
    const name = `q_${q.id}`;
    const val = state.draft.answers[q.id] || "";
    const label = `<span>${esc(q.label)}${q.required ? "" : " <em>(optional)</em>"}</span>`;
    if (q.type === "textarea") return `<label class="field">${label}<textarea name="${name}" rows="3" maxlength="1500" ${q.required ? "required" : ""}>${esc(val)}</textarea></label>`;
    if (q.type === "select") {
      return `<label class="field">${label}<select name="${name}" ${q.required ? "required" : ""}>
        <option value="">Choose…</option>${q.options.map((o) => `<option ${o === val ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></label>`;
    }
    return `<label class="field">${label}<input name="${name}" maxlength="200" value="${esc(val)}" ${q.required ? "required" : ""} /></label>`;
  }

  function viewForm() {
    const slot = state.picker.slot;
    const end = new Date(Date.parse(slot) + state.type.duration * 60000).toISOString();
    return `
      <button type="button" class="bm__back" data-back="pick">${icon("i-back")} Change time</button>
      <div class="bm__summary">
        <span class="bm__summaryType">${esc(state.type.name)} · ${state.type.duration} min</span>
        <p class="bm__summaryDate">${fmtLong(slot)}</p>
        <p class="bm__summaryTime">${fmtTime(slot)} – ${fmtTime(end)} <span class="muted">· ${esc(B.tzLabel)}</span></p>
      </div>
      ${state.notice ? `<p class="bm__notice" role="alert">${esc(state.notice)}</p>` : ""}
      <form class="bm__form" id="bookForm" novalidate>
        <div class="form__row">
          <label class="field"><span>Your name</span><input name="name" autocomplete="name" maxlength="100" required value="${esc(state.draft.name)}" /></label>
          <label class="field"><span>Email</span><input name="email" type="email" autocomplete="email" maxlength="200" required value="${esc(state.draft.email)}" /></label>
        </div>
        ${(state.type.questions || []).map(question).join("")}
        <label class="hp" aria-hidden="true">Website <input name="website" tabindex="-1" autocomplete="off" /></label>
        <button class="btn btn--accent btn--block" type="submit">Confirm booking</button>
        <p class="bm__fine">You'll get a confirmation with the video link and a calendar invite.</p>
      </form>`;
  }

  function viewDone() {
    const b = state.booked;
    const token = (b.manageUrl || "").split("t=")[1] || "";
    const gcal = B.googleLink({
      title: `${b.type.name} with Ahmed Eldegla`, start: b.start, end: b.end,
      details: `Join: ${b.meetUrl}\nReschedule or cancel: ${b.manageUrl}`, location: b.meetUrl
    });
    return `
      <div class="bm__done">
        <div class="bm__check" aria-hidden="true"><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24"/><path d="M15 27l7 7 15-16"/></svg></div>
        <h3>You're booked, ${esc(b.name.split(" ")[0])}!</h3>
        <p class="muted">${esc(b.type.name)} · ${b.type.duration} min</p>
        <div class="bm__when">
          <p class="bm__summaryDate">${fmtLong(b.start)}</p>
          <p class="bm__summaryTime">${fmtTime(b.start)} – ${fmtTime(b.end)} <span class="muted">· ${esc(B.tzLabel)}</span></p>
        </div>
        <div class="bm__link">
          ${icon("i-video")}<a href="${esc(b.meetUrl)}" target="_blank" rel="noreferrer">${esc(b.meetUrl.replace(/^https:\/\//, ""))}</a>
          <button type="button" class="iconBtn" data-copy="${esc(b.meetUrl)}" aria-label="Copy video link">${icon("i-copy")}</button>
        </div>
        <p class="muted bm__fine">${b.emailed
          ? `A confirmation with the calendar invite is on its way to <strong>${esc(b.email)}</strong>.`
          : "Save the video link above. You can also add the call to your calendar now."}</p>
        <div class="bm__cal">
          <a class="btn btn--line btn--sm" href="${gcal}" target="_blank" rel="noreferrer">Google Calendar</a>
          ${token ? `<a class="btn btn--line btn--sm" href="${API}/manage/ics?t=${token}">Apple / Outlook (.ics)</a>` : ""}
          ${b.manageUrl ? `<a class="btn btn--line btn--sm" href="${esc(b.manageUrl)}" target="_blank" rel="noreferrer">Reschedule or cancel</a>` : ""}
        </div>
        <button type="button" class="btn btn--solid btn--sm" data-close>Done</button>
      </div>`;
  }

  // ---------- Data ----------
  async function loadConfig() {
    if (state.config) return true;
    try {
      const res = await fetch(`${API}/booking/config`);
      if (!res.ok) throw new Error(String(res.status));
      state.config = await res.json();
      state.ownerTz = state.config.timezone || state.ownerTz;
      return state.config.types.length > 0;
    } catch {
      return false;
    }
  }

  async function chooseType(id) {
    state.type = state.config.types.find((t) => t.id === id) || state.config.types[0];
    state.picker = { slots: [], month: null, day: null, slot: null };
    state.notice = "";
    await loadSlots();
  }

  async function loadSlots(notice = "") {
    if (!state.picker.slots.length) { state.view = "loading"; render(); }
    try {
      const res = await fetch(`${API}/slots?type=${encodeURIComponent(state.type.id)}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      state.picker.slots = data.slots || [];
      state.notice = notice;
      state.view = "pick";
    } catch {
      state.view = "error";
    }
    render();
  }

  async function submit(form) {
    if (state.busy) return;
    saveDraft();
    const f = form.elements;
    const name = state.draft.name.trim();
    const email = state.draft.email.trim();
    if (!name) return f.name.focus();
    if (!email || !f.email.checkValidity()) {
      state.notice = "Please enter a valid email address.";
      render();
      return root.querySelector('[name="email"]')?.focus();
    }
    const answers = {};
    for (const q of state.type.questions || []) {
      const v = (state.draft.answers[q.id] || "").trim();
      if (q.required && !v) {
        state.notice = `Please answer: ${q.label}`;
        render();
        return root.querySelector(`[name="q_${q.id}"]`)?.focus();
      }
      if (v) answers[q.id] = v;
    }

    state.busy = true;
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    btn.textContent = "Booking…";
    try {
      const res = await fetch(`${API}/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: state.type.id, start: state.picker.slot, name, email, tz: B.tz, answers, website: f.website.value })
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.ok) {
        state.booked = { ...data, name, email };
        state.picker.slots = state.picker.slots.filter((s) => s !== state.picker.slot);
        state.notice = "";
        state.draft = { name: "", email: "", answers: {} };
        state.view = "done";
        render();
        window.AE_track?.("book_done", state.type.id);
        // Until the server sends its own emails, let Ahmed know through EmailJS
        if (!data.emailed) {
          const lines = (state.type.questions || []).filter((q) => answers[q.id]).map((q) => `${q.label}: ${answers[q.id]}`).join("\n");
          window.AE_sendEmail?.({
            name, email,
            message: `[New booking: ${state.type.name}]\nWhen: ${new Date(data.start).toLocaleString("en-GB", { timeZone: state.ownerTz, dateStyle: "full", timeStyle: "short" })} (${state.ownerTz}), ${state.type.duration} min\nVisitor timezone: ${B.tz}\nVideo: ${data.meetUrl}\n${lines}\n\nDashboard: ${location.origin}/admin.html`
          }).catch(() => {});
        }
        return;
      }
      if (data.error === "slot_unavailable") {
        state.picker.slot = null;
        state.picker.slots = [];
        return loadSlots("Sorry, that time was just taken. Please pick another.");
      }
      state.notice = {
        email_invalid: "Please enter a valid email address.",
        answer_required: "Please answer the required questions.",
        too_many_bookings: "You already have upcoming calls booked. Use the link in your confirmation email to change them.",
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
  async function open() {
    if (dialog.open) return;
    document.dispatchEvent(new CustomEvent("ae:booking-open"));
    window.AE_track?.("book_open");
    document.documentElement.classList.add("modal-open");
    dialog.showModal();
    if (state.view === "done") { state.view = "types"; state.type = null; }
    state.notice = "";
    if (!(await loadConfig())) { state.view = "error"; return render(); }
    if (state.config.types.length === 1) return chooseType(state.config.types[0].id);
    if (state.type && state.view !== "types") return loadSlots(); // refresh, so taken times disappear
    state.view = "types";
    render();
  }
  const unlock = () => document.documentElement.classList.remove("modal-open");
  function close() {
    unlock();
    if (dialog.open) dialog.close();
  }
  dialog.addEventListener("cancel", unlock);
  dialog.addEventListener("close", unlock);

  // Any "Book a call" trigger on the page (buttons, #book links, links from the AI chat)
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-book], a[href='#book']");
    if (!t) return;
    e.preventDefault();
    open();
  }, true);

  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) return close();
    if (e.target.closest("[data-close]")) return close();

    const type = e.target.closest("[data-type]");
    if (type) return chooseType(type.dataset.type);

    const copy = e.target.closest("[data-copy]");
    if (copy) {
      navigator.clipboard?.writeText(copy.dataset.copy).then(() => {
        copy.classList.add("is-copied");
        setTimeout(() => copy.classList.remove("is-copied"), 1400);
      }).catch(() => {});
      return;
    }

    const back = e.target.closest("[data-back]");
    if (back) {
      state.view = back.dataset.back;
      state.notice = "";
      if (state.view === "types") state.type = null;
      return render();
    }

    if (state.view === "pick") {
      const r = B.pickerClick(e, state.picker);
      if (r === "slot") { state.notice = ""; state.view = "form"; render(); root.querySelector('[name="name"]')?.focus(); }
      else if (r === "render") { state.notice = ""; render(); root.querySelector(".times")?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
    }
  });

  root.addEventListener("submit", (e) => {
    if (e.target.id !== "bookForm") return;
    e.preventDefault();
    submit(e.target);
  });

  // Deep link: ahmedeldegla.com/#book opens the booking window
  if (location.hash === "#book") {
    if (document.documentElement.classList.contains("intro-on")) {
      document.addEventListener("ae:reveal", () => setTimeout(open, 900), { once: true });
    } else {
      open();
    }
  }
})();
