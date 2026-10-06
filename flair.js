(() => {
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const clamp = (v, a, b) => Math.min(Math.max(v, a), b);

  // About: wrap words so they can light up with scroll progress
  function initHighlight() {
    const el = $(".about__big");
    if (!el) return null;
    const keys = /^(fast|predictable|debug)/i;
    el.innerHTML = el.textContent.trim().split(/\s+/)
      .map((w) => `<span class="hl${keys.test(w) ? " hl--key" : ""}">${w}</span>`)
      .join(" ");
    const words = $$(".hl", el);
    if (reduceMotion) words.forEach((w) => w.classList.add("on"));
    return { el, words };
  }

  // Giant outlined numerals behind each section title
  function initNumerals() {
    $$(".section__head").forEach((head) => {
      const idx = $(".section__index", head);
      if (idx) head.dataset.num = idx.textContent.trim();
    });
  }

  // Featured project: a code window that types a CQRS handler
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
    const re = /(\/\/.*)|\b(public|sealed|class|async|await|var|if|is|null|return|new|private|readonly)\b|\b([A-Z]\w*)(?=\()|\b([A-Z]\w*)\b|(=>|[{}[\]])/g;
    const out = [];
    let last = 0;
    let m;
    while ((m = re.exec(src))) {
      if (m.index > last) out.push(["", src.slice(last, m.index)]);
      const cls = m[1] ? "tk-c" : m[2] ? "tk-k" : m[3] ? "tk-m" : m[4] ? "tk-t" : "tk-p";
      out.push([cls, m[0]]);
      last = re.lastIndex;
    }
    if (last < src.length) out.push(["", src.slice(last)]);
    return out;
  }

  function initCodeWindow() {
    const card = $(".project--featured");
    if (!card) return;
    const edge = document.createElement("span");
    edge.className = "edge";
    card.prepend(edge);

    const lines = CODE.split("\n").length;
    const win = document.createElement("div");
    win.className = "codewin";
    win.setAttribute("aria-hidden", "true");
    win.innerHTML = `
      <div class="codewin__bar"><i></i><i></i><i></i><span class="codewin__tab">CreateProposalHandler.cs</span><span class="codewin__lang">C# · .NET 8</span></div>
      <div class="codewin__body"><div class="codewin__nums">${Array.from({ length: lines }, (_, i) => i + 1).join("\n")}</div><pre></pre></div>
      <div class="codewin__status"><b></b><span>Compiling…</span></div>`;
    card.appendChild(win);

    const pre = $("pre", win);
    const status = $(".codewin__status span", win);
    const tokens = tokenize(CODE);
    const done = () => {
      win.classList.add("is-done");
      status.textContent = "Build succeeded · 0 warnings · 0 errors";
    };

    if (reduceMotion) {
      tokens.forEach(([c, t]) => {
        pre.appendChild(c ? Object.assign(document.createElement("span"), { className: c, textContent: t }) : document.createTextNode(t));
      });
      done();
      return;
    }

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
        if (ti < tokens.length) requestAnimationFrame(step);
        else setTimeout(done, 300);
      };
      requestAnimationFrame(step);
    };

    const io = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting) return;
      io.disconnect();
      setTimeout(type, 400);
    }, { threshold: 0.35 });
    io.observe(win);
  }

  // Giant name: split letters and size the line to fill the container
  function initBigName() {
    const wrap = $(".bigname");
    const txt = $(".bigname__txt", wrap || document);
    if (!wrap || !txt) return;
    txt.innerHTML = txt.textContent.split("").map((c, i) =>
      c === " " ? " " : `<span class="bigname__ch" style="--i:${i}">${c}</span>`).join("");

    const fit = () => {
      txt.style.setProperty("--bn", "100px");
      const w = txt.getBoundingClientRect().width;
      const avail = wrap.clientWidth;
      if (w) txt.style.setProperty("--bn", Math.floor((100 * avail) / w * 0.98) + "px");
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

  // One frame loop: velocity marquees, ghost text, numerals, highlight, tag parallax
  function initLoop(hl) {
    if (reduceMotion) return;
    const ghost = $(".hero__ghost");
    const hero = $(".hero");
    const heads = $$(".section__head[data-num]");
    const tags = $$(".ftag").map((el) => ({ el, depth: Number(el.dataset.depth) || 0, x: 0, y: 0 }));

    const marquees = $$(".marquee").map((m) => {
      const track = $(".marquee__track", m);
      m.classList.add("is-js");
      const dir = m.dataset.dir === "1" ? 1 : -1;
      const state = { m, track, dir, x: 0, half: 0, visible: true };
      const io = new IntersectionObserver((e) => { state.visible = e[0].isIntersecting; });
      io.observe(m);
      return state;
    });
    const measure = () => marquees.forEach((s) => {
      s.half = s.track.scrollWidth / 2;
      if (s.dir === 1 && s.x === 0) s.x = -s.half;
    });
    measure();
    document.fonts?.ready.then(measure);
    window.addEventListener("resize", measure);

    let px = 0, py = 0;
    if (finePointer) {
      window.addEventListener("pointermove", (e) => {
        px = (e.clientX / innerWidth) * 2 - 1;
        py = (e.clientY / innerHeight) * 2 - 1;
      }, { passive: true });
    }

    let lastY = window.scrollY;
    let vel = 0;
    let scrollDir = 1;
    let prevY = -1;

    const frame = () => {
      const y = window.scrollY;
      const vh = innerHeight;
      const dy = y - lastY;
      lastY = y;
      vel += (dy - vel) * 0.12;
      if (Math.abs(dy) > 0.5) scrollDir = dy > 0 ? 1 : -1;

      // Marquees speed up with scroll velocity and flip with scroll direction
      const skew = clamp(-vel * 0.18, -9, 9);
      marquees.forEach((s) => {
        if (!s.visible || !s.half) return;
        const speed = 0.6 + Math.min(Math.abs(vel) * 0.9, 28);
        s.x += s.dir * scrollDir * speed;
        if (s.x <= -s.half) s.x += s.half;
        if (s.x > 0) s.x -= s.half;
        s.track.style.transform = `translate3d(${s.x}px,0,0) skewX(${skew}deg)`;
      });

      if (y !== prevY) {
        prevY = y;
        if (ghost && hero && hero.getBoundingClientRect().bottom > 0) ghost.style.setProperty("--gx", (-y * 0.45).toFixed(1) + "px");

        heads.forEach((h) => {
          const r = h.getBoundingClientRect();
          if (r.bottom < -400 || r.top > vh + 200) return;
          h.style.setProperty("--sy", ((r.top - vh * 0.5) * -0.18).toFixed(1) + "px");
        });

        if (hl) {
          const r = hl.el.getBoundingClientRect();
          const p = clamp((vh * 0.82 - r.top) / (r.height + vh * 0.3), 0, 1);
          const lit = Math.round(p * hl.words.length * 1.08);
          hl.words.forEach((w, i) => w.classList.toggle("on", i < lit));
        }
      }

      tags.forEach((t) => {
        t.x += (px * t.depth - t.x) * 0.06;
        t.y += (py * t.depth - t.y) * 0.06;
        t.el.style.transform = `translate3d(${t.x.toFixed(2)}px, ${t.y.toFixed(2)}px, 0)`;
      });

      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  function boot() {
    const hl = initHighlight();
    initNumerals();
    initCodeWindow();
    initBigName();
    initTilt();
    initLoop(hl);
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
