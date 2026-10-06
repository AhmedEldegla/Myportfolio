// Shared by the booking window (booking.js) and the reschedule page (manage.js):
// API address, formatting helpers and the month calendar + time list picker.
window.AEBooking = (() => {
  const API = ["localhost", "127.0.0.1"].includes(location.hostname)
    ? "http://localhost:8787"
    : "https://ahmed-portfolio-chat.ahmedeldegla.workers.dev";
  const EMAIL = "ahmeddagla99@gmail.com";
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const tzLabel = tz.replace(/_/g, " ");

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pad = (n) => String(n).padStart(2, "0");
  const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; // local date
  const monthOf = (k) => k.slice(0, 7);
  const fromKey = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
  const fmtTime = (iso) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const fmtLong = (iso) => new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const icon = (id, size = 18) => `<svg width="${size}" height="${size}" class="ico" aria-hidden="true"><use href="#${id}"/></svg>`;

  function byDay(slots) {
    const map = new Map();
    for (const s of slots) {
      const k = keyOf(new Date(s));
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(s);
    }
    return map;
  }

  // p = { slots, month, day } (month/day are filled in on first render)
  function pickerHtml(p) {
    const days = byDay(p.slots);
    const keys = [...days.keys()];
    const months = [...new Set(keys.map(monthOf))];
    if (!p.day || !days.has(p.day)) p.day = keys[0];
    if (!p.month || !months.includes(p.month)) p.month = monthOf(p.day);

    const [y, m] = p.month.split("-").map(Number);
    const first = new Date(y, m - 1, 1);
    const lead = (first.getDay() + 6) % 7; // Monday-first grid
    const count = new Date(y, m, 0).getDate();
    const todayKey = keyOf(new Date());
    const mi = months.indexOf(p.month);

    let cells = "";
    for (let i = 0; i < lead; i++) cells += `<span class="cal__pad"></span>`;
    for (let d = 1; d <= count; d++) {
      const k = `${p.month}-${pad(d)}`;
      const avail = days.has(k);
      const cls = ["cal__day", avail && "is-avail", k === p.day && "is-selected", k === todayKey && "is-today"].filter(Boolean).join(" ");
      const label = fromKey(k).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
      cells += avail
        ? `<button type="button" class="${cls}" data-day="${k}" aria-pressed="${k === p.day}" aria-label="${label}, ${days.get(k).length} times available">${d}</button>`
        : `<span class="${cls}" aria-hidden="true">${d}</span>`;
    }

    const times = days.get(p.day) || [];
    const dayTitle = fromKey(p.day).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
    return `
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
          <p class="cal__tz">${icon("i-globe", 15)} Times in ${esc(tzLabel)}</p>
        </div>
        <div class="times">
          <p class="times__day">${dayTitle}</p>
          <p class="times__count">${times.length} time${times.length === 1 ? "" : "s"} available</p>
          <div class="times__list">
            ${times.map((s, i) => `<button type="button" class="time" data-slot="${s}" style="--i:${i}"><span class="time__dot"></span>${fmtTime(s)}</button>`).join("")}
          </div>
        </div>
      </div>`;
  }

  // Returns "slot" (with p.slot set), "render" or "" (not a picker click)
  function pickerClick(e, p) {
    const day = e.target.closest("[data-day]");
    if (day) { p.day = day.dataset.day; return "render"; }
    const nav = e.target.closest("[data-month]");
    if (nav) {
      const keys = [...byDay(p.slots).keys()];
      const months = [...new Set(keys.map(monthOf))];
      const next = months[months.indexOf(p.month) + Number(nav.dataset.month)];
      if (next) {
        p.month = next;
        p.day = keys.find((k) => monthOf(k) === next);
      }
      return "render";
    }
    const time = e.target.closest("[data-slot]");
    if (time) { p.slot = time.dataset.slot; return "slot"; }
    return "";
  }

  function googleLink({ title, start, end, details, location }) {
    const stamp = (iso) => iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    return "https://calendar.google.com/calendar/render?action=TEMPLATE"
      + `&text=${encodeURIComponent(title)}&dates=${stamp(start)}/${stamp(end)}`
      + `&details=${encodeURIComponent(details || "")}` + (location ? `&location=${encodeURIComponent(location)}` : "");
  }

  return { API, EMAIL, tz, tzLabel, esc, fmtTime, fmtLong, icon, pickerHtml, pickerClick, googleLink };
})();
