(() => {
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
  const root = document.documentElement;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const wide = window.matchMedia("(min-width: 961px) and (min-height: 620px)");
  const clamp = (v, a, b) => Math.min(Math.max(v, a), b);

  // Smooth, inertial scrolling. Starts once the intro has handed over the page.
  let lenis = null;
  function initSmoothScroll() {
    if (reduceMotion || !window.Lenis) return;
    const start = () => {
      if (lenis) return;
      lenis = new window.Lenis({
        lerp: 0.09,
        wheelMultiplier: 1,
        anchors: { offset: -16 },
        prevent: (node) => Boolean(node.closest?.("dialog, .chat, [data-lenis-prevent]")),
      });
      const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
      requestAnimationFrame(raf);
      // Pause while the booking window is open
      new MutationObserver(() => {
        root.classList.contains("modal-open") ? lenis.stop() : lenis.start();
      }).observe(root, { attributes: true, attributeFilter: ["class"] });
    };
    if (root.classList.contains("intro-on")) {
      const wait = new MutationObserver(() => {
        if (root.classList.contains("intro-on")) return;
        wait.disconnect();
        start();
      });
      wait.observe(root, { attributes: true, attributeFilter: ["class"] });
    } else {
      start();
    }
  }

  // About: wrap words so they can light up with scroll progress, and pin the section
  function initAbout() {
    const section = $("#about");
    const el = $(".about__big");
    if (!section || !el) return null;
    const keys = /^(fast|predictable|debug)/i;
    el.innerHTML = el.textContent.trim().split(/\s+/)
      .map((w) => `<span class="hl${keys.test(w) ? " hl--key" : ""}">${w}</span>`)
      .join(" ");
    const words = $$(".hl", el);
    if (reduceMotion) {
      words.forEach((w) => w.classList.add("on"));
      return null;
    }

    const sticky = document.createElement("div");
    sticky.className = "pin__sticky";
    while (section.firstChild) sticky.appendChild(section.firstChild);
    const bar = document.createElement("div");
    bar.className = "pin__bar";
    bar.innerHTML = "<i></i>";
    sticky.appendChild(bar);
    section.appendChild(sticky);
    section.classList.add("pin");

    // Pin only when the whole section fits on screen with room to breathe
    const apply = () => {
      section.classList.remove("is-pinned");
      const need = sticky.offsetHeight + parseFloat(getComputedStyle(root).getPropertyValue("--nav-h") || 68) + 96;
      section.classList.toggle("is-pinned", need <= window.innerHeight);
    };
    apply();
    document.fonts?.ready.then(apply);
    window.addEventListener("resize", apply);
    return { section, el, words };
  }

  // Projects: on wide screens the list becomes a sideways gallery pinned in place
  const CODE = `// Sample: CQRS command handler (MediatR)
public sealed class CreateProposalHandler(
    IAppDbContext db, ICurrentUser user)
    : IRequestHandler<CreateProposal, Result<Guid>>
{
    public async Task<Result<Guid>> Handle(
        CreateProposal cmd, CancellationToken ct)
    {
        var project = await db.Projects
            .FindAsync([cmd.ProjectId], ct);
        if (project is null)
            return ProjectErrors.NotFound;

        var proposal = Proposal.Create(
            project.Id, user.Id, cmd.Bid);
        db.Proposals.Add(proposal);
        await db.SaveChangesAsync(ct);

        return proposal.Id;
    }
}`;

  function tokenize(src) {
    const re = /(\/\/.*)|\b(public|sealed|class|async|await|var|if|is|null|return|new)\b|\b([A-Z]\w*)(?=\()|\b([A-Z]\w*)\b|(=>|[{}[\]])/g;
    const out = [];
    let last = 0;
    let m;
    while ((m = re.exec(src))) {
      if (m.index > last) out.push(["", src.slice(last, m.index)]);
      out.push([m[1] ? "tk-c" : m[2] ? "tk-k" : m[3] ? "tk-m" : m[4] ? "tk-t" : "tk-p", m[0]]);
      last = re.lastIndex;
    }
    if (last < src.length) out.push(["", src.slice(last)]);
    return out;
  }

  function buildCodePanel() {
    const lines = CODE.split("\n").length;
    const panel = document.createElement("div");
    panel.className = "codepanel";
    panel.setAttribute("aria-hidden", "true");
    panel.innerHTML = `
      <p class="codepanel__cap">How I write it</p>
      <div class="codewin">
        <div class="codewin__bar"><i></i><i></i><i></i><span class="codewin__tab">CreateProposalHandler.cs</span><span class="codewin__lang">C# · .NET 8</span></div>
        <div class="codewin__body"><div class="codewin__nums">${Array.from({ length: lines }, (_, i) => i + 1).join("\n")}</div><pre></pre></div>
        <div class="codewin__status"><b></b><span>Compiling…</span></div>
      </div>`;

    const win = $(".codewin", panel);
    const pre = $("pre", panel);
    const status = $(".codewin__status span", panel);
    const tokens = tokenize(CODE);
    const caret = document.createElement("span");
    caret.className = "codewin__caret";
    pre.appendChild(caret);

    const type = () => {
      let ti = 0, ci = 0, node = null;
      const step = () => {
        let budget = 3;
        while (budget-- > 0 && ti < tokens.length) {
          const [cls, text] = tokens[ti];
          if (!node) {
            node = cls ? Object.assign(document.createElement("span"), { className: cls }) : document.createTextNode("");
            pre.insertBefore(node, caret);
          }
          const ch = text[ci++];
          node.textContent += ch;
          if (ci >= text.length) { ti++; ci = 0; node = null; }
          if (ch === "\n") budget = 0;
        }
        if (ti < tokens.length) return requestAnimationFrame(step);
        setTimeout(() => {
          win.classList.add("is-done");
          status.textContent = "Build succeeded · 0 warnings · 0 errors";
        }, 300);
      };
      requestAnimationFrame(step);
    };
    const io = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting) return;
      io.disconnect();
      setTimeout(type, 300);
    }, { threshold: 0.4 });
    io.observe(win);
    return panel;
  }

  function initGallery() {
    const section = $("#projects");
    const list = $("#projectsList");
    if (!section || !list) return null;

    const featured = $(".project--featured", list);
    if (featured) {
      const edge = document.createElement("span");
      edge.className = "edge";
      featured.prepend(edge);
    }
    if (reduceMotion) return null;

    const total = $$(".project", list).length;
    if (featured) featured.after(buildCodePanel());

    const sticky = document.createElement("div");
    sticky.className = "hs__sticky";
    while (section.firstChild) sticky.appendChild(section.firstChild);
    const meta = document.createElement("div");
    meta.className = "hs__meta";
    meta.innerHTML = `<span class="hs__count">01 / ${String(total).padStart(2, "0")}</span><span class="hs__bar"><i></i></span><span>Scroll</span>`;
    sticky.appendChild(meta);
    section.appendChild(sticky);
    section.classList.add("hscroll");

    const state = { section, list, sticky, count: $(".hs__count", meta), total, max: 0, on: false };
    const measure = () => {
      state.on = wide.matches;
      section.classList.toggle("is-on", state.on);
      if (!state.on) {
        section.style.height = "";
        list.style.removeProperty("--hx");
        return;
      }
      const gut = parseFloat(getComputedStyle(sticky).paddingLeft) || 24;
      state.max = Math.max(list.scrollWidth + gut * 2 - window.innerWidth, 0);
      section.style.height = state.max + window.innerHeight + "px";
    };
    measure();
    document.fonts?.ready.then(measure);
    window.addEventListener("resize", measure);
    wide.addEventListener("change", measure);
    return state;
  }

  // Giant name: split letters and size the line to fill the container
  function initBigName() {
    const wrap = $(".bigname");
    const txt = wrap && $(".bigname__txt", wrap);
    if (!txt) return;
    txt.innerHTML = txt.textContent.split("").map((c, i) =>
      c === " " ? " " : `<span class="bigname__ch" style="--i:${i}">${c}</span>`).join("");
    const fit = () => {
      txt.style.setProperty("--bn", "100px");
      const w = txt.getBoundingClientRect().width;
      if (w) txt.style.setProperty("--bn", Math.floor((100 * wrap.clientWidth) / w * 0.98) + "px");
    };
    fit();
    document.fonts?.ready.then(fit);
    window.addEventListener("resize", fit);
    if (reduceMotion) { wrap.classList.add("show"); return; }
    const io = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting) return;
      wrap.classList.add("show");
      io.disconnect();
    }, { threshold: 0.3 });
    io.observe(wrap);
  }

  // Project cards tilt toward the pointer
  function initTilt() {
    if (!finePointer || reduceMotion) return;
    $$(".project:not(.project--featured)").forEach((card) => {
      card.addEventListener("pointerenter", () => { card.style.transition = "transform .18s ease-out, border-color .25s ease"; });
      card.addEventListener("pointermove", (e) => {
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform = `perspective(800px) rotateX(${-y * 7}deg) rotateY(${x * 9}deg) translateY(-4px)`;
      });
      card.addEventListener("pointerleave", () => {
        card.style.transition = "transform .7s cubic-bezier(.16,1,.3,1), border-color .25s ease";
        card.style.transform = "";
      });
    });
  }

  // One frame loop for everything tied to scroll position
  function initLoop(about, gallery) {
    if (reduceMotion) return;
    const heroCopy = $(".hero__copy");
    const hero = $(".hero");
    const lines = $$(".bigtype__line");
    const bigtype = $(".bigtype");

    const marquees = $$(".marquee").map((m) => {
      const track = $(".marquee__track", m);
      m.classList.add("is-js");
      const state = { track, x: 0, half: 0, visible: true };
      new IntersectionObserver((e) => { state.visible = e[0].isIntersecting; }).observe(m);
      return state;
    });
    const measure = () => marquees.forEach((s) => { s.half = s.track.scrollWidth / 2; });
    measure();
    document.fonts?.ready.then(measure);
    window.addEventListener("resize", measure);

    let lastY = window.scrollY, vel = 0, dir = 1, prevY = -1;

    const frame = () => {
      const y = window.scrollY;
      const vh = window.innerHeight;
      const dy = y - lastY;
      lastY = y;
      vel += (dy - vel) * 0.12;
      if (Math.abs(dy) > 0.5) dir = dy > 0 ? 1 : -1;

      const skew = clamp(-vel * 0.15, -7, 7);
      marquees.forEach((s) => {
        if (!s.visible || !s.half) return;
        s.x -= dir * (0.6 + Math.min(Math.abs(vel) * 0.8, 24));
        if (s.x <= -s.half) s.x += s.half;
        if (s.x > 0) s.x -= s.half;
        s.track.style.transform = `translate3d(${s.x}px,0,0) skewX(${skew}deg)`;
      });

      if (y !== prevY) {
        prevY = y;

        // Hero copy drifts up and fades as you leave it
        if (hero && heroCopy) {
          const h = hero.offsetHeight;
          if (y < h) {
            const p = y / h;
            heroCopy.style.transform = `translate3d(0, ${(-y * 0.18).toFixed(1)}px, 0)`;
            heroCopy.style.opacity = (1 - p * 0.9).toFixed(3);
          }
        }

        // About: words light up across the pinned stretch, then the columns arrive
        if (about) {
          let p;
          if (about.section.classList.contains("is-pinned")) {
            const top = about.section.offsetTop;
            p = clamp((y - top) / (about.section.offsetHeight - vh), 0, 1);
          } else {
            const r = about.el.getBoundingClientRect();
            p = clamp((vh * 0.82 - r.top) / (r.height + vh * 0.3), 0, 1);
          }
          const lit = Math.round(clamp(p / 0.75, 0, 1) * about.words.length);
          about.words.forEach((w, i) => w.classList.toggle("on", i < lit));
          about.section.style.setProperty("--cols", clamp((p - 0.7) / 0.2, 0, 1).toFixed(3));
          about.section.style.setProperty("--p", p.toFixed(4));
        }

        // Projects: vertical scroll drives the sideways track
        if (gallery && gallery.on) {
          const top = gallery.section.offsetTop;
          const p = clamp((y - top) / (gallery.section.offsetHeight - vh), 0, 1);
          gallery.list.style.setProperty("--hx", (-p * gallery.max).toFixed(1) + "px");
          gallery.sticky.style.setProperty("--p", p.toFixed(4));
          const n = Math.min(gallery.total, 1 + Math.floor(p * gallery.total));
          gallery.count.textContent = `${String(n).padStart(2, "0")} / ${String(gallery.total).padStart(2, "0")}`;
        }

        // Big type: the two lines slide past each other
        if (bigtype) {
          const r = bigtype.getBoundingClientRect();
          if (r.bottom > 0 && r.top < vh) {
            const p = (vh - r.top) / (vh + r.height);
            lines.forEach((l) => {
              const d = Number(l.dataset.dir) || 1;
              l.style.setProperty("--tx", (d * (p - 0.5) * window.innerWidth * 0.45).toFixed(1) + "px");
            });
          }
        }
      }

      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  function boot() {
    const about = initAbout();
    const gallery = initGallery();
    initBigName();
    initTilt();
    initLoop(about, gallery);
    initSmoothScroll();
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
