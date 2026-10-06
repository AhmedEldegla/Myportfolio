// Tiny SVG charts for the dashboard. Single-series only, so no legends: the card title names
// what is plotted. Marks use --chart (validated against both surfaces); text uses text tokens.
window.AECharts = (() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtN = (n) => (n >= 10000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1) + "K" : n.toLocaleString("en-US"));

  // Clean axis ticks: 0, step, 2*step... covering max
  function ticks(max, count = 4) {
    if (max <= 0) return [0, 1];
    const raw = max / count;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
    const out = [];
    for (let v = 0; v <= max + step * 0.001; v += step) out.push(Math.round(v * 100) / 100);
    if (out[out.length - 1] < max) out.push(out[out.length - 1] + step);
    return out;
  }

  // Columns from a shared baseline: <=24px thick, 4px rounded data-end, square at the baseline
  function columns(data, { height = 220, every = 1, unit = "" } = {}) {
    const W = 640, H = height, L = 34, R = 8, T = 12, B = 26;
    const max = Math.max(1, ...data.map((d) => d.value));
    const tk = ticks(max);
    const top = tk[tk.length - 1];
    const band = (W - L - R) / data.length;
    const bw = Math.min(24, band * 0.62);
    const y = (v) => T + (H - T - B) * (1 - v / top);
    let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Column chart">`;
    for (const t of tk) {
      s += `<line class="chart__grid" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/>`;
      s += `<text class="chart__tick" x="${L - 8}" y="${y(t) + 4}" text-anchor="end">${fmtN(t)}</text>`;
    }
    data.forEach((d, i) => {
      const cx = L + band * i + band / 2;
      const x = cx - bw / 2;
      const yv = y(d.value);
      const h = H - B - yv;
      if (d.value > 0) {
        const r = Math.min(4, h, bw / 2);
        s += `<path class="chart__bar" d="M${x},${H - B} V${yv + r} Q${x},${yv} ${x + r},${yv} H${x + bw - r} Q${x + bw},${yv} ${x + bw},${yv + r} V${H - B} Z"/>`;
      }
      if (i % every === 0 || i === data.length - 1) {
        s += `<text class="chart__tick" x="${cx}" y="${H - 8}" text-anchor="middle">${esc(d.label)}</text>`;
      }
      // Hit target: the whole band, taller than the mark
      s += `<rect class="chart__hit" x="${L + band * i}" y="${T}" width="${band}" height="${H - T - B}" data-tip="${esc(d.tip || `${d.label}: ${d.value}${unit}`)}"/>`;
    });
    return s + `<line class="chart__base" x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}"/></svg>`;
  }

  // Line (2px) with a 10% area wash, end marker with a surface ring, crosshair on hover
  function area(data, { height = 220, every = 7 } = {}) {
    const W = 640, H = height, L = 34, R = 14, T = 14, B = 26;
    const max = Math.max(1, ...data.map((d) => d.value));
    const tk = ticks(max);
    const top = tk[tk.length - 1];
    const step = (W - L - R) / Math.max(1, data.length - 1);
    const x = (i) => L + step * i;
    const y = (v) => T + (H - T - B) * (1 - v / top);
    const pts = data.map((d, i) => [x(i), y(d.value)]);
    const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
    let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Line chart">`;
    for (const t of tk) {
      s += `<line class="chart__grid" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/>`;
      s += `<text class="chart__tick" x="${L - 8}" y="${y(t) + 4}" text-anchor="end">${fmtN(t)}</text>`;
    }
    s += `<path class="chart__area" d="${line} L${x(data.length - 1)},${H - B} L${L},${H - B} Z"/>`;
    s += `<path class="chart__line" d="${line}"/>`;
    data.forEach((d, i) => {
      const last = data.length - 1;
      // Skip a regular label that would crowd the final one
      if ((i % every === 0 && (i === last || last - i >= every * 0.6)) || i === last) s += `<text class="chart__tick" x="${x(i)}" y="${H - 8}" text-anchor="${i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"}">${esc(d.label)}</text>`;
    });
    const last = pts[pts.length - 1];
    s += `<line class="chart__cross" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/>`;
    s += `<circle class="chart__dot chart__dot--hover" r="5" cx="0" cy="0" visibility="hidden"/>`;
    s += `<circle class="chart__dot" r="4.5" cx="${last[0]}" cy="${last[1]}"/>`;
    data.forEach((d, i) => {
      s += `<rect class="chart__hit" x="${x(i) - step / 2}" y="${T}" width="${step}" height="${H - T - B}" data-tip="${esc(d.tip || `${d.label}: ${d.value}`)}" data-cx="${x(i)}" data-cy="${pts[i][1]}"/>`;
    });
    return s + `<line class="chart__base" x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}"/></svg>`;
  }

  // Ranked horizontal bars as plain HTML (labels stay crisp and wrap-safe)
  function bars(items, { total = 0, empty = "No data yet" } = {}) {
    if (!items.length) return `<p class="chart__empty">${esc(empty)}</p>`;
    const max = Math.max(1, ...items.map((i) => i.value));
    return `<ul class="hbars">${items.map((i) => {
      const pct = total ? Math.round((i.value / total) * 100) : 0;
      return `<li data-tip="${esc(i.tip || `${i.name}: ${i.value}${total ? ` (${pct}%)` : ""}`)}">
        <span class="hbars__name">${esc(i.name)}</span>
        <span class="hbars__track"><span class="hbars__fill" style="width:${Math.max(2, (i.value / max) * 100)}%"></span></span>
        <span class="hbars__val">${fmtN(i.value)}${total ? `<small>${pct}%</small>` : ""}</span>
      </li>`;
    }).join("")}</ul>`;
  }

  // Tooltip + crosshair, one listener for every chart on the page
  function bindTooltips(tip) {
    let active = null;
    document.addEventListener("pointermove", (e) => {
      const t = e.target.closest?.("[data-tip]");
      if (active && active !== t) {
        active.classList.remove("is-hot");
        const svg = active.ownerSVGElement;
        if (svg) svg.querySelectorAll(".chart__cross, .chart__dot--hover").forEach((n) => n.setAttribute("visibility", "hidden"));
      }
      active = t;
      if (!t) { tip.hidden = true; return; }
      t.classList.add("is-hot");
      tip.textContent = t.dataset.tip;
      tip.hidden = false;
      const r = tip.getBoundingClientRect();
      const x = Math.min(innerWidth - r.width - 8, e.clientX + 14);
      const y = e.clientY - r.height - 12 < 8 ? e.clientY + 16 : e.clientY - r.height - 12;
      tip.style.transform = `translate(${x}px, ${y}px)`;
      if (t.dataset.cx && t.ownerSVGElement) {
        const svg = t.ownerSVGElement;
        const cross = svg.querySelector(".chart__cross");
        const dot = svg.querySelector(".chart__dot--hover");
        cross.setAttribute("x1", t.dataset.cx); cross.setAttribute("x2", t.dataset.cx); cross.setAttribute("visibility", "visible");
        dot.setAttribute("cx", t.dataset.cx); dot.setAttribute("cy", t.dataset.cy); dot.setAttribute("visibility", "visible");
      }
    }, { passive: true });
    document.addEventListener("pointerleave", () => { tip.hidden = true; });
  }

  return { columns, area, bars, bindTooltips, fmtN };
})();
