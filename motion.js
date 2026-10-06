(() => {
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
  const root = document.documentElement;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  // Wrap each word in a mask so it can slide up into place
  function splitWords(el) {
    const frag = document.createDocumentFragment();
    let i = 0;
    let last = null;
    const make = (node) => {
      const w = document.createElement("span");
      w.className = "w";
      const inner = document.createElement("span");
      inner.className = "w__i";
      inner.style.setProperty("--i", i++);
      inner.appendChild(node);
      w.appendChild(inner);
      frag.appendChild(w);
      last = inner;
    };
    Array.from(el.childNodes).forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        node.textContent.split(/(\s+)/).forEach((part, idx) => {
          if (!part) return;
          if (/^\s+$/.test(part)) {
            frag.appendChild(document.createTextNode(" "));
            last = null;
          } else if (idx === 0 && last) {
            // Punctuation glued to the previous word (e.g. "C++.") stays with it
            last.appendChild(document.createTextNode(part));
          } else {
            make(document.createTextNode(part));
          }
        });
      } else {
        make(node.cloneNode(true));
      }
    });
    el.textContent = "";
    el.appendChild(frag);
  }

  function initSplitText() {
    const hero = $(".hero__title");
    if (hero) {
      splitWords(hero);
      hero.classList.add("is-split");
      hero.style.setProperty("--wd", "250ms");
    }
    $$(".section__head").forEach((head) => {
      const title = $(".section__title", head);
      if (title) splitWords(title);
    });
    $$(".about__big.reveal, .contact__big, .ctaBand__title").forEach((el) => {
      splitWords(el);
      el.style.setProperty("--wd", "100ms");
      el.querySelectorAll(".w__i").forEach((w) => {
        w.style.transitionDelay = `calc(var(--i) * 18ms + var(--wd))`;
      });
    });
    // Titles inside a .reveal parent animate when that parent shows
    $$(".about__big.reveal").forEach((el) => el.classList.add("is-split"));
  }

  // Hero stagger after the loader + grid/list stagger elsewhere
  function initStagger() {
    const heroOrder = [".status", ".hero__lead", ".hero__cta", ".portrait", ".facts"];
    const heroDelays = [0.05, 0.55, 0.7, 0.3, 0.9];
    heroOrder.forEach((sel, i) => {
      const el = $(".hero " + sel);
      if (el) el.style.setProperty("--rd", heroDelays[i] + "s");
    });

    [".projects", ".skills", ".timeline", ".about__cols"].forEach((sel) => {
      const parent = $(sel);
      if (!parent) return;
      $$(":scope > .reveal", parent).forEach((el, i) => el.style.setProperty("--rd", (i % 3) * 0.12 + "s"));
    });
    $$(".contact__grid > .reveal").forEach((el, i) => el.style.setProperty("--rd", i * 0.15 + "s"));

    $$(".skillGroup__list").forEach((ul) => $$("li", ul).forEach((li, i) => li.style.setProperty("--i", i)));

    // Drop the delays once things are in, so hovers respond instantly
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        setTimeout(() => e.target.style.removeProperty("--rd"), 2600);
      });
    });
    $$(".reveal").forEach((el) => el.style.getPropertyValue("--rd") && io.observe(el));
  }

  // Count numbers up when they come into view
  function afterIntro(delay, fn) {
    if (!root.classList.contains("is-loading")) return setTimeout(fn, delay);
    document.addEventListener("ae:reveal", () => setTimeout(fn, delay), { once: true });
  }

  function initCounters() {
    const els = $$(".fact dd, .pstats dd").filter((el) => /^\d+/.test(el.textContent.trim()));
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        const el = e.target;
        const [, num, rest] = el.textContent.trim().match(/^(\d+)(.*)$/);
        const target = Number(num);
        const dur = 1400;
        el.textContent = "0" + rest;
        // While the intro is up, wait for it to hand over to the page
        afterIntro(root.classList.contains("is-loading") ? 1200 : 250, () => {
          const t0 = performance.now();
          const step = (now) => {
            const t = Math.min((now - t0) / dur, 1);
            el.textContent = Math.round(target * (1 - Math.pow(1 - t, 4))) + rest;
            if (t < 1) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        });
      });
    }, { threshold: 0.4 });
    els.forEach((el) => io.observe(el));
  }

  // Scramble the mono section numbers as they appear
  function initScramble() {
    const chars = "0123456789#%&*+<>/";
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        const el = e.target;
        const final = el.textContent;
        let frame = 0;
        const run = () => {
          frame++;
          el.textContent = final
            .split("")
            .map((c, i) => (frame > 4 + i * 2 ? c : chars[(Math.random() * chars.length) | 0]))
            .join("");
          if (frame < 4 + final.length * 2) setTimeout(run, 45);
          else el.textContent = final;
        };
        run();
      });
    }, { threshold: 1 });
    $$(".section__index, .job__when").forEach((el) => io.observe(el));
  }

  // One rAF loop for everything driven by scroll position
  function initScroll() {
    const progress = $(".progress");
    const nav = $("#nav");
    const timeline = $(".timeline");
    const jobs = $$(".job");
    const portrait = $(".portrait");
    const hero = $(".hero");
    let lastY = window.scrollY;
    let ticking = false;

    const update = () => {
      ticking = false;
      const y = window.scrollY;
      const vh = window.innerHeight;
      const max = document.documentElement.scrollHeight - vh;
      progress?.style.setProperty("--sp", max > 0 ? (y / max).toFixed(4) : "0");

      // Hide the nav when scrolling down, bring it back on the way up
      if (nav) {
        const menuOpen = nav.classList.contains("menu-open");
        if (y > 420 && y > lastY + 4 && !menuOpen) nav.classList.add("nav--hidden");
        else if (y < lastY - 4 || y <= 420) nav.classList.remove("nav--hidden");
      }
      lastY = y;

      if (timeline) {
        const r = timeline.getBoundingClientRect();
        const p = Math.min(Math.max((vh * 0.65 - r.top) / r.height, 0), 1);
        timeline.style.setProperty("--tl", p.toFixed(4));
        jobs.forEach((job) => job.classList.toggle("lit", job.getBoundingClientRect().top < vh * 0.65));
      }

      if (portrait && hero) {
        const r = hero.getBoundingClientRect();
        if (r.bottom > 0) portrait.style.setProperty("--py", (Math.max(-r.top, 0) * 0.06).toFixed(1) + "px");
      }
    };

    const onScroll = () => {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    update();
  }

  // Pointer-driven effects: background spotlight, cursor, glow cards, tilt, magnets
  function initPointer() {
    if (!finePointer) return;

    // Background spotlight
    const bg = $(".bgfx");
    let px = innerWidth / 2, py = innerHeight * 0.3;
    let queued = false;
    window.addEventListener("pointermove", (e) => {
      px = e.clientX; py = e.clientY;
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        bg?.style.setProperty("--mx", px + "px");
        bg?.style.setProperty("--my", py + "px");
      });
    }, { passive: true });

    // Custom cursor: a dot that sticks to the pointer and a ring that trails it
    const ring = document.createElement("div");
    ring.className = "cursor";
    ring.innerHTML = '<span class="cursor__ring"></span>';
    const dot = document.createElement("div");
    dot.className = "cursor-dot";
    document.body.append(ring, dot);
    root.classList.add("has-cursor");

    let rx = px, ry = py, shown = false;
    window.addEventListener("pointermove", (e) => {
      dot.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
      if (!shown) { shown = true; rx = e.clientX; ry = e.clientY; root.classList.add("cursor-on"); }
      const t = e.target;
      root.classList.toggle("cursor-hover", Boolean(t.closest?.("a, button, [data-book], .marquee__item, .portrait")));
      root.classList.toggle("cursor-text", Boolean(t.closest?.("input, textarea, .chat")));
    }, { passive: true });
    document.addEventListener("pointerleave", () => root.classList.remove("cursor-on"));
    document.addEventListener("pointerenter", () => shown && root.classList.add("cursor-on"));
    window.addEventListener("pointerdown", () => root.classList.add("cursor-down"));
    window.addEventListener("pointerup", () => root.classList.remove("cursor-down"));

    const follow = () => {
      rx += (px - rx) * 0.18;
      ry += (py - ry) * 0.18;
      ring.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
      requestAnimationFrame(follow);
    };
    requestAnimationFrame(follow);

    // Glow cards
    $$(".project, .skillGroup, .form, .ctaBand").forEach((el) => el.classList.add("glow"));
    document.addEventListener("pointermove", (e) => {
      const card = e.target.closest?.(".glow");
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", e.clientX - r.left + "px");
      card.style.setProperty("--my", e.clientY - r.top + "px");
    }, { passive: true });

    // Portrait tilt with glare
    const portrait = $(".portrait");
    if (portrait) {
      portrait.addEventListener("pointermove", (e) => {
        const r = portrait.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width;
        const y = (e.clientY - r.top) / r.height;
        portrait.style.transform = `perspective(900px) rotateX(${(0.5 - y) * 10}deg) rotateY(${(x - 0.5) * 12}deg) scale(1.02)`;
        portrait.style.setProperty("--gx", x * 100 + "%");
        portrait.style.setProperty("--gy", y * 100 + "%");
      });
      portrait.addEventListener("pointerleave", () => { portrait.style.transform = ""; });
    }

    // Magnetic buttons
    $$(".hero .btn, .hero .iconBtn, .ctaBand .btn, .nav__actions .btn, .nav__actions .iconBtn, .contact .iconBtn, .form .btn").forEach((el) => {
      el.classList.add("magnetic");
      el.addEventListener("pointermove", (e) => {
        const r = el.getBoundingClientRect();
        const x = e.clientX - r.left - r.width / 2;
        const y = e.clientY - r.top - r.height / 2;
        el.style.transform = `translate(${x * 0.28}px, ${y * 0.4}px)`;
      });
      el.addEventListener("pointerleave", () => { el.style.transform = ""; });
    });
  }

  // A pill that slides between nav links
  function initNavPill() {
    const wrap = $(".nav__links");
    if (!wrap) return;
    const links = $$(".nav__link", wrap);
    const pill = document.createElement("span");
    pill.className = "nav__pill";
    pill.setAttribute("aria-hidden", "true");
    wrap.prepend(pill);
    wrap.classList.add("has-pill");

    let hovering = false;
    const moveTo = (a) => {
      if (!a) { pill.style.opacity = "0"; return; }
      const fresh = pill.style.opacity !== "1";
      if (fresh) pill.style.transition = "none";
      pill.style.width = a.offsetWidth + "px";
      pill.style.transform = `translateX(${a.offsetLeft}px)`;
      if (fresh) { void pill.offsetWidth; pill.style.transition = ""; }
      pill.style.opacity = "1";
    };
    const active = () => links.find((a) => a.classList.contains("active"));

    links.forEach((a) => a.addEventListener("pointerenter", () => { hovering = true; moveTo(a); }));
    wrap.addEventListener("pointerleave", () => { hovering = false; moveTo(active()); });
    new MutationObserver(() => !hovering && moveTo(active()))
      .observe(wrap, { attributes: true, subtree: true, attributeFilter: ["class"] });
    window.addEventListener("resize", () => moveTo(active()));
  }

  function boot() {
    initSplitText();
    if (reduceMotion) {
      root.classList.remove("is-loading");
      return;
    }
    initStagger();
    initCounters();
    initScramble();
    initScroll();
    initPointer();
    initNavPill();
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
