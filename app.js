(() => {
  const PROFILE = {
    email: "ahmeddagla99@gmail.com",
    roleTyping: [
      ".NET Backend Developer",
      "ASP.NET Core | Clean Architecture",
      "SQL Server | Docker | Git"
    ],
    skills: [
      { icon: "fa-brands fa-microsoft", name: ".NET", hint: "ASP.NET Core" },
      { icon: "fa-solid fa-database", name: "SQL Server", hint: "T-SQL" },
      { icon: "fa-brands fa-docker", name: "Docker", hint: "Containers" },
      { icon: "fa-brands fa-git-alt", name: "Git", hint: "Version control" },
      { icon: "fa-brands fa-github", name: "GitHub", hint: "Repos" },
      { icon: "fa-brands fa-gitlab", name: "GitLab", hint: "CI/CD" }
    ],
    projects: [
      {
        title: "Depi FreeLance Platform",
        desc: "Freelance platform concept with clean UI and modern flow.",
        tags: ["Platform", "Web"],
        category: "platform",
        live: "",
        github: ""
      },
      {
        title: "Smart Accountant",
        desc: "Dashboard-like experience for accounting workflows and business views.",
        tags: ["Dashboard", "Web"],
        category: "dashboard",
        live: "",
        github: ""
      }
    ]
  };

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));

  // Projects pagination state
  const PAGE_SIZE = 4;
  const projectState = { page: 1, filter: "all" };

  // Toast
  function toast(msg) {
    const t = $("#toast");
    if (!t) return;
    t.textContent = msg;
    t.style.display = "block";
    clearTimeout(window.__toastTimer);
    window.__toastTimer = setTimeout(() => (t.style.display = "none"), 2100);
  }

  // Theme
  const THEME_KEY = "ae_theme";
  function getPreferredTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "dark" || saved === "light") return saved;
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  function setTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);

    const isLight = theme === "light";
    const iconClass = isLight ? "fa-sun" : "fa-moon";
    const label = isLight ? "Light" : "Dark";

    const icon = $("#themeIcon");
    const text = $("#themeText");
    const iconM = $("#themeIconMobile");
    const textM = $("#themeTextMobile");

    if (icon) icon.className = `fa-solid ${iconClass}`;
    if (text) text.textContent = label;
    if (iconM) iconM.className = `fa-solid ${iconClass}`;
    if (textM) textM.textContent = label;

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", isLight ? "#f7f8fb" : "#0b1220");
  }
  function initTheme() {
    setTheme(getPreferredTheme());
    $("#themeToggle")?.addEventListener("click", () => {
      const curr = document.documentElement.getAttribute("data-theme") || "dark";
      setTheme(curr === "dark" ? "light" : "dark");
    });
    $("#themeToggleMobile")?.addEventListener("click", () => {
      const curr = document.documentElement.getAttribute("data-theme") || "dark";
      setTheme(curr === "dark" ? "light" : "dark");
    });
  }

  // Mobile menu
  function initMobileMenu() {
    const burger = $("#burger");
    const menu = $("#mobileMenu");
    if (!burger || !menu) return;

    const close = () => {
      menu.classList.remove("open");
      burger.setAttribute("aria-expanded", "false");
      menu.setAttribute("aria-hidden", "true");
    };

    burger.addEventListener("click", () => {
      const open = menu.classList.toggle("open");
      burger.setAttribute("aria-expanded", String(open));
      menu.setAttribute("aria-hidden", String(!open));
    });

    $$(".mobile__link").forEach((a) => a.addEventListener("click", close));
    window.addEventListener("keydown", (e) => e.key === "Escape" && close());
  }

  // Active nav
  function initActiveNav() {
    const links = $$(".nav__link");
    const ids = ["home", "skills", "experience", "projects", "contact"];
    const sections = ids.map((id) => document.getElementById(id)).filter(Boolean);

    const byHash = (hash) => links.find((a) => a.getAttribute("href") === hash);

    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((x) => x.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;

        links.forEach((a) => a.classList.remove("active"));
        const l = byHash("#" + visible.target.id);
        if (l) l.classList.add("active");
      },
      { rootMargin: "-45% 0px -50% 0px", threshold: [0.08, 0.2, 0.45] }
    );

    sections.forEach((s) => io.observe(s));
  }

  // Reveal
  function initReveal() {
    const els = $$(".reveal");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      els.forEach((el) => el.classList.add("show"));
      return;
    }
    els.forEach((el, idx) => {
      if (!el.style.getPropertyValue("--reveal-delay")) {
        el.style.setProperty("--reveal-delay", `${Math.min(idx * 28, 220)}ms`);
      }
    });
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add("show")),
      { threshold: 0.12 }
    );
    els.forEach((el) => io.observe(el));
  }

  // Desktop custom cursor
  function initCursor() {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (reduce || !finePointer) return;

    const dot = $("#cursorDot");
    const ring = $("#cursorRing");
    if (!dot || !ring) return;

    document.body.classList.add("cursor-enhanced");

    const state = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const ringPos = { x: state.x, y: state.y };
    let raf = 0;

    const show = () => {
      dot.style.opacity = "1";
      ring.style.opacity = "1";
    };
    const hide = () => {
      dot.style.opacity = "0";
      ring.style.opacity = "0";
      ring.classList.remove("is-hover", "is-press");
    };

    const animate = () => {
      ringPos.x += (state.x - ringPos.x) * 0.2;
      ringPos.y += (state.y - ringPos.y) * 0.2;
      dot.style.left = `${state.x}px`;
      dot.style.top = `${state.y}px`;
      ring.style.left = `${ringPos.x}px`;
      ring.style.top = `${ringPos.y}px`;
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);

    window.addEventListener("mousemove", (e) => {
      state.x = e.clientX;
      state.y = e.clientY;
      show();
    }, { passive: true });
    window.addEventListener("mouseout", (e) => {
      if (!e.relatedTarget) hide();
    });
    window.addEventListener("blur", hide);

    const hoverSelector = "a, button, input, textarea, .btn, .filter, .nav__link, .contactRow, .project, .skill";
    document.addEventListener("mouseover", (e) => {
      if (e.target.closest(hoverSelector)) ring.classList.add("is-hover");
    });
    document.addEventListener("mouseout", (e) => {
      if (e.target.closest(hoverSelector)) ring.classList.remove("is-hover");
    });
    document.addEventListener("mousedown", () => ring.classList.add("is-press"));
    document.addEventListener("mouseup", () => ring.classList.remove("is-press"));

    window.addEventListener("beforeunload", () => cancelAnimationFrame(raf));
  }

  // Typing
  function typeLoop(targetEl, words, speed = 44, pause = 900) {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { targetEl.textContent = words[0]; return; }

    let w = 0, i = 0, del = false;
    const tick = () => {
      const word = words[w % words.length];
      if (!del) {
        i++;
        targetEl.textContent = word.slice(0, i);
        if (i >= word.length) { del = true; setTimeout(tick, pause); return; }
      } else {
        i--;
        targetEl.textContent = word.slice(0, i);
        if (i <= 0) { del = false; w++; }
      }
      setTimeout(tick, del ? speed * 0.65 : speed);
    };
    tick();
  }

  // Copy email + mailto form
  function initContact() {
    const yearEl = $("#year");
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    const EMAILJS_KEY = "q-8nRXtqcr5NmmViF";
    const EMAILJS_SERVICE_ID = "service_m1ez5zm";
    const EMAILJS_TEMPLATE_ID = "template_4ml6ubo";

    const isConfigured = EMAILJS_KEY && EMAILJS_SERVICE_ID && EMAILJS_TEMPLATE_ID;

    if (isConfigured) {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.min.js";
      script.onload = () => {
        window.emailjs.init(EMAILJS_KEY);
        console.log("EmailJS ready.");
      };
      document.head.appendChild(script);
    }

    const copyBtn = $("#copyEmailBtn");
    if (copyBtn) {
      copyBtn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(PROFILE.email);
          toast("Email copied.");
        } catch {
          toast("Copy failed.");
        }
      });
    }

    const form = $("#contactForm");
    if (form) {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const name = $("#name")?.value.trim() || "";
        const email = $("#email")?.value.trim() || "";
        const message = $("#message")?.value.trim() || "";

        if (!name || !email || !message) {
          toast("Please fill all fields.");
          return;
        }

        if (!isConfigured) {
          const subject = encodeURIComponent(`Portfolio Contact - ${name}`);
          const body = encodeURIComponent(
            `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`
          );
          window.location.href = `mailto:${PROFILE.email}?subject=${subject}&body=${body}`;
          return;
        }

        const btn = form.querySelector("button[type='submit']");
        const originalText = btn.innerHTML;

        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner" style="animation: spin 1s linear infinite;"></i> Sending...';

        try {
          const result = await window.emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
            from_name: name,
            from_email: email,
            message,
            to_email: PROFILE.email
          });

          toast("Message sent successfully.");
          form.reset();
        } catch (err) {
          console.error("EmailJS error:", err);
          toast("Failed, opening mail app...");
          const subject = encodeURIComponent(`Portfolio Contact - ${name}`);
          const body = encodeURIComponent(
            `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`
          );
          window.location.href = `mailto:${PROFILE.email}?subject=${subject}&body=${body}`;
        } finally {
          btn.disabled = false;
          btn.innerHTML = originalText;
        }
      });
    }
  }

  // Render skills
  function renderSkills() {
    const grid = $("#skillsGrid");
    if (!grid) return;

    grid.innerHTML = PROFILE.skills.map((s) => `
      <article class="card skill">
        <div class="skill__icon"><i class="${s.icon}"></i></div>
        <div class="skill__name">${s.name}</div>
        <div class="skill__hint">${s.hint}</div>
      </article>
    `).join("");
  }

  // Render projects
  function renderProjects(page = projectState.page, size = PAGE_SIZE, filter = projectState.filter) {
    const grid = $("#projectsGrid");
    const pager = $("#projectsPagination");
    if (!grid) return;

    // Filter projects
    const filtered = PROFILE.projects.filter((p) => filter === "all" || p.category === filter);
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / size));
    if (page > totalPages) page = totalPages;
    projectState.page = page;

    const start = (page - 1) * size;
    const slice = filtered.slice(start, start + size);

    grid.innerHTML = slice.map((p, idx) => {
      const tags = (p.tags || []).map((t) => `<span class="tag">${t}</span>`).join("");
      const liveBtn = p.live ? `
        <a class="btn btn--primary btn--sm" href="${p.live}" target="_blank" rel="noreferrer">
          <i class="fa-solid fa-arrow-up-right-from-square"></i> Live
        </a>` : "";

      const ghBtn = p.github ? `
        <a class="btn btn--ghost btn--sm" href="${p.github}" target="_blank" rel="noreferrer">
          <i class="fa-brands fa-github"></i> GitHub
        </a>` : `
        <span class="project__private" aria-label="Private case study available on request">
          <i class="fa-regular fa-folder-open"></i> Private case study
        </span>`;

      // Support staggered reveal: set --delay based on index
      const delay = idx * 60;

      return `
        <article class="card project" data-category="${p.category}" data-delay="${delay}" style="--delay:${delay}ms">
          <div class="project__row">
            <div>
              <h3 class="project__title">${p.title}</h3>
              <p class="project__desc">${p.desc}</p>
            </div>
            <div class="tags">${tags}</div>
          </div>
          <div class="project__links">
            ${liveBtn}
            ${ghBtn}
          </div>
        </article>
      `;
    }).join("");

    // Update pagination controls
    if (pager) {
      pager.setAttribute("aria-hidden", totalPages <= 1 ? "true" : "false");
      pager.innerHTML = renderPaginationHtml(totalPages, page);
      bindPaginationEvents(pager, totalPages);
    }

    // Apply staggered reveal for newly inserted items
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    Array.from(grid.querySelectorAll('.project')).forEach((el) => {
      const d = parseInt(el.getAttribute('data-delay')) || 0;
      el.style.setProperty('--delay', `${d}ms`);
      if (reduce) {
        el.classList.add('show');
      } else {
        el.classList.add('reveal');
        setTimeout(() => el.classList.add('show'), d + 40);
      }
    });
  }

  function renderPaginationHtml(totalPages, current) {
    if (totalPages <= 1) return "";
    let html = `<button class=\"pagination__nav\" data-action=\"prev\" aria-label=\"Previous page\">Prev</button>`;
    for (let i = 1; i <= totalPages; i++) {
      html += ` <button class=\"pagination__dot ${i === current ? 'active' : ''}\" data-page=\"${i}\" aria-label=\"Page ${i}\"></button>`;
    }
    html += ` <button class=\"pagination__nav\" data-action=\"next\" aria-label=\"Next page\">Next</button>`;
    return html;
  }

  function bindPaginationEvents(container, totalPages) {
    container.querySelectorAll('[data-page]').forEach((b) => {
      b.addEventListener('click', () => {
        const p = Number(b.dataset.page);
        projectState.page = p;
        renderProjects(p, PAGE_SIZE, projectState.filter);
      });
    });
    container.querySelectorAll('[data-action]').forEach((b) => {
      b.addEventListener('click', () => {
        const action = b.dataset.action;
        if (action === 'prev' && projectState.page > 1) projectState.page--;
        if (action === 'next' && projectState.page < totalPages) projectState.page++;
        renderProjects(projectState.page, PAGE_SIZE, projectState.filter);
      });
    });
  }

  // Filter
  function initProjectFilter() {
    const btns = $$(".filter");

    btns.forEach((b) => {
      b.addEventListener("click", () => {
        btns.forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        projectState.filter = b.dataset.filter || "all";
        projectState.page = 1;
        renderProjects(projectState.page, PAGE_SIZE, projectState.filter);
      });
    });

    // set initial active
    btns.forEach((b) => b.classList.toggle("active", b.dataset.filter === projectState.filter));
  }

  // Smooth anchors (stable on mobile)
  function initSmoothAnchors() {
    $$('a[href^="#"]').forEach((a) => {
      a.addEventListener("click", (e) => {
        const href = a.getAttribute("href");
        if (!href || href === "#") return;
        const el = document.querySelector(href);
        if (!el) return;
        e.preventDefault();
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        history.replaceState(null, "", href);
      });
    });
  }

  // Subtle 3D tilt on photo card
  function initPhotoTilt() {
    const card = $("#profileCard");
    if (!card) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    let raf = 0;
    const onMove = (e) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width;
        const y = (e.clientY - r.top) / r.height;
        const rx = (0.5 - y) * 6;
        const ry = (x - 0.5) * 7;
        card.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;
      });
    };
    const onLeave = () => (card.style.transform = "");

    card.addEventListener("mousemove", onMove);
    card.addEventListener("mouseleave", onLeave);
    card.addEventListener("touchstart", onLeave, { passive: true });
  }

  // Animated counters (quick KPIs)
  function initCounters() {
    const els = Array.from(document.querySelectorAll('.quick__kpi[data-target]'));
    if (!els.length) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      els.forEach((el) => {
        const t = Number(el.dataset.target) || 0;
        const suffix = String(el.textContent).trim().endsWith('+') ? '+' : '';
        el.textContent = `${t}${suffix}`;
      });
      return;
    }

    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        obs.unobserve(el);
        const target = Number(el.dataset.target) || 0;
        const suffix = String(el.textContent).trim().endsWith('+') ? '+' : '';

        const duration = 900;
        const start = performance.now();

        const tick = (now) => {
          const t = Math.min(1, (now - start) / duration);
          const eased = 1 - Math.pow(1 - t, 3);
          const value = Math.round(eased * target);
          el.textContent = `${value}${suffix}`;
          if (t < 1) requestAnimationFrame(tick);
          else el.classList.add('animate');
        };
        requestAnimationFrame(tick);
      });
    }, { threshold: 0.2 });

    els.forEach((el) => io.observe(el));
  }

  // Button ripple micro-interaction
  function initButtonRipples() {
    document.addEventListener('click', (e) => {
      const b = e.target.closest('.btn');
      if (!b) return;
      const rect = b.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      let r = b.querySelector('.ripple');
      if (!r) {
        r = document.createElement('span');
        r.className = 'ripple';
        b.appendChild(r);
      }
      r.classList.remove('show');
      r.style.left = `${x}px`;
      r.style.top = `${y}px`;
      r.style.width = r.style.height = '8px';
      // force reflow
      // expand
      requestAnimationFrame(() => {
        const size = Math.max(rect.width, rect.height) * 2;
        r.style.width = r.style.height = `${size}px`;
        r.classList.add('show');
        setTimeout(() => r.classList.remove('show'), 450);
      });
    });
  }

  function initEntryZoom() {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      document.body.classList.add("is-entered");
      return;
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.body.classList.add("is-entered");
      });
    });
  }

  function boot() {
    initEntryZoom();
    initTheme();
    initMobileMenu();
    initActiveNav();
    initReveal();
    initCursor();
    initContact();
    initSmoothAnchors();

    const typeTarget = $("#typeTarget");
    if (typeTarget) typeLoop(typeTarget, PROFILE.roleTyping);

    renderSkills();
    renderProjects();
    initProjectFilter();
    initPhotoTilt();
    initCounters();
    initButtonRipples();
  }

  document.addEventListener("DOMContentLoaded", boot);
})();

