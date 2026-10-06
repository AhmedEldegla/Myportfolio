// manage.html?t=TOKEN: the client's private page to see, reschedule or cancel their call.
(() => {
  const B = window.AEBooking;
  const root = document.getElementById("manageApp");
  if (!B || !root) return;
  const { API, EMAIL, esc, fmtTime, fmtLong, icon } = B;

  const token = new URLSearchParams(location.search).get("t") || "";
  // The page sets <meta name="referrer" content="no-referrer">, so the token never leaks to other sites

  const state = { view: "loading", booking: null, canChange: false, picker: { slots: [] }, notice: "", busy: false };

  const post = (path, body) => fetch(API + path, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ t: token, ...body })
  }).then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => ({})) }));

  function whenBlock(b) {
    return `
      <div class="bm__when">
        <p class="bm__summaryDate">${fmtLong(b.start)}</p>
        <p class="bm__summaryTime">${fmtTime(b.start)} – ${fmtTime(b.end)} <span class="muted">· ${esc(B.tzLabel)}</span></p>
      </div>`;
  }

  function render() {
    const b = state.booking;
    let html = "";
    if (state.view === "loading") {
      html = `<div class="bm__msg"><span class="typing"><i></i><i></i><i></i></span> Loading…</div>`;
    } else if (state.view === "missing") {
      html = `<div class="bm__msg"><p>This link isn't valid anymore.<br>Email <a href="mailto:${EMAIL}">${EMAIL}</a> if you need to change your call.</p></div>`;
    } else if (state.view === "view") {
      const status = b.status === "confirmed" ? (state.canChange ? "Confirmed" : "Done") : b.status === "cancelled" ? "Cancelled" : b.status.replace("_", " ");
      html = `
        <span class="mg__status is-${esc(b.status)}">${esc(status)}</span>
        <h1 class="mg__title">${esc(b.type.name)} with Ahmed</h1>
        <p class="muted">${b.duration} min · booked by ${esc(b.name)}</p>
        ${state.notice ? `<p class="bm__notice" role="status" style="margin-top:16px">${esc(state.notice)}</p>` : ""}
        ${whenBlock(b)}
        ${b.meetUrl ? `<div class="bm__link">${icon("i-video")}<a href="${esc(b.meetUrl)}" target="_blank" rel="noreferrer">${esc(b.meetUrl.replace(/^https:\/\//, ""))}</a>
          <button type="button" class="iconBtn" data-copy="${esc(b.meetUrl)}" aria-label="Copy video link">${icon("i-copy")}</button></div>` : ""}
        <div class="mg__actions">
          ${b.status === "confirmed" && state.canChange ? `
            <a class="btn btn--accent" href="${esc(b.meetUrl)}" target="_blank" rel="noreferrer">${icon("i-video")} Join the call</a>
            <button type="button" class="btn btn--line" data-act="reschedule">${icon("i-cal")} Reschedule</button>
            <a class="btn btn--line" href="${API}/manage/ics?t=${token}">Add to calendar</a>
            <button type="button" class="btn btn--line" data-act="cancel">Cancel call</button>`
            : `<a class="btn btn--accent" href="./#book">Book a new call</a>`}
        </div>`;
    } else if (state.view === "pick") {
      html = `
        <button type="button" class="bm__back" data-act="view">${icon("i-back")} Back</button>
        <h1 class="mg__title" style="margin-top:0">Pick a new time</h1>
        <p class="muted" style="margin-bottom:22px">Currently ${esc(fmtLong(b.start))}, ${fmtTime(b.start)}.</p>
        ${state.notice ? `<p class="bm__notice" role="alert">${esc(state.notice)}</p>` : ""}
        ${state.picker.slots.length ? B.pickerHtml(state.picker) : `<div class="bm__msg"><p>No other open times right now. Email <a href="mailto:${EMAIL}">${EMAIL}</a>.</p></div>`}`;
    } else if (state.view === "confirmMove") {
      const end = new Date(Date.parse(state.picker.slot) + b.duration * 60000).toISOString();
      html = `
        <button type="button" class="bm__back" data-act="pick">${icon("i-back")} Change time</button>
        <h1 class="mg__title" style="margin-top:0">Move your call to</h1>
        <div class="bm__when"><p class="bm__summaryDate">${fmtLong(state.picker.slot)}</p>
          <p class="bm__summaryTime">${fmtTime(state.picker.slot)} – ${fmtTime(end)} <span class="muted">· ${esc(B.tzLabel)}</span></p></div>
        <div class="mg__actions"><button type="button" class="btn btn--accent" data-act="doMove">Confirm new time</button></div>`;
    } else if (state.view === "cancel") {
      html = `
        <button type="button" class="bm__back" data-act="view">${icon("i-back")} Back</button>
        <h1 class="mg__title" style="margin-top:0">Cancel your call?</h1>
        ${whenBlock(b)}
        <form class="mg__cancel" id="cancelForm">
          <label class="field"><span>Reason <em>(optional, helps Ahmed)</em></span><textarea name="reason" rows="3" maxlength="500"></textarea></label>
          <div class="mg__actions" style="margin-top:0">
            <button type="submit" class="btn btn--danger">Cancel the call</button>
            <button type="button" class="btn btn--line" data-act="reschedule">Reschedule instead</button>
          </div>
        </form>`;
    }
    root.innerHTML = `<div class="bview">${html}</div>`;
  }

  async function load(notice = "") {
    if (!/^[0-9a-f]{48}$/.test(token)) { state.view = "missing"; return render(); }
    try {
      const res = await fetch(`${API}/manage?t=${token}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      state.booking = data.booking;
      state.canChange = data.canChange;
      state.notice = notice;
      state.view = "view";
    } catch {
      state.view = "missing";
    }
    render();
  }

  async function openPicker(notice = "") {
    state.view = "loading";
    render();
    try {
      const res = await fetch(`${API}/manage/slots?t=${token}`);
      const data = await res.json();
      state.picker = { slots: data.slots || [] };
    } catch {
      state.picker = { slots: [] };
    }
    state.notice = notice;
    state.view = "pick";
    render();
  }

  root.addEventListener("click", async (e) => {
    const copy = e.target.closest("[data-copy]");
    if (copy) {
      navigator.clipboard?.writeText(copy.dataset.copy).then(() => {
        copy.classList.add("is-copied");
        setTimeout(() => copy.classList.remove("is-copied"), 1400);
      }).catch(() => {});
      return;
    }
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "view") { state.view = "view"; state.notice = ""; return render(); }
    if (act === "reschedule") return openPicker();
    if (act === "pick") { state.view = "pick"; return render(); }
    if (act === "cancel") { state.view = "cancel"; return render(); }
    if (act === "doMove" && !state.busy) {
      state.busy = true;
      e.target.closest("button").disabled = true;
      const { ok, data } = await post("/manage/reschedule", { start: state.picker.slot });
      state.busy = false;
      if (ok) return load("Done! Your call has a new time. An updated invite is on its way.");
      return openPicker("Sorry, that time was just taken. Please pick another.");
    }
    if (state.view === "pick") {
      const r = B.pickerClick(e, state.picker);
      if (r === "slot") { state.view = "confirmMove"; render(); }
      else if (r === "render") render();
    }
  });

  root.addEventListener("submit", async (e) => {
    if (e.target.id !== "cancelForm" || state.busy) return;
    e.preventDefault();
    state.busy = true;
    e.target.querySelector("[type=submit]").disabled = true;
    const { ok } = await post("/manage/cancel", { reason: e.target.elements.reason.value.trim() });
    state.busy = false;
    load(ok ? "Your call is cancelled. Ahmed has been notified." : "Couldn't cancel. Please email Ahmed.");
  });

  load();
})();
