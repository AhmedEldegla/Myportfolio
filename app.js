(() => {
  const PROFILE = {
    email: "ahmeddagla99@gmail.com",
    projects: [
      {
        title: "Depi Freelance Platform",
        kind: "Graduation project",
        desc: "A freelance marketplace covering the core flow between clients and freelancers, built on a layered .NET backend with a modern web front end.",
        stack: ["C#", ".NET", "Entity Framework", "SQL Server"],
        live: "",
        github: "https://github.com/AhmedEldegla/Depi"
      },
      {
        title: "Mo7amek",
        kind: "Legal practice management",
        desc: "A management system for law offices that organizes cases, clients, appointments, and day-to-day office workflows.",
        stack: [".NET API", "SQL Server"],
        live: "",
        github: ""
      },
      {
        title: "Cashier POS System",
        kind: "Point of sale",
        desc: "Point-of-sale backend for cashier workflows: sales operations, transactions, and business data management.",
        stack: [".NET API", "SQL Server"],
        live: "",
        github: ""
      },
      {
        title: "Smart Accountant",
        kind: "Dashboard",
        desc: "A dashboard for accounting workflows that gives business owners a clear view of their numbers.",
        stack: ["Web", "Dashboard"],
        live: "",
        github: ""
      }
    ],
    skills: [
      { group: "Backend", items: ["C#", ".NET", "ASP.NET Web API", "Entity Framework", "LINQ", "RESTful APIs"] },
      { group: "Data", items: ["SQL Server", "SQL", "Data modeling"] },
      { group: "Systems", items: ["C++", "Real-time networking", "Packet processing", "Performance optimization"] },
      { group: "Craft", items: ["Debugging", "Memory analysis", "Reverse engineering", "Data structures & algorithms", "Git & GitHub"] }
    ]
  };

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Toast
  let toastTimer = 0;
  function toast(msg) {
    const t = $("#toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
  }

  // Theme
  const THEME_KEY = "ae_theme";
  function setTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch {}
    const btn = $("#themeToggle");
    if (btn) btn.setAttribute("aria-label", theme === "dark" ? "Switch to light theme" : "Switch to dark theme");
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "light" ? "#f6f5f1" : "#0e0f11");
  }
  function initTheme() {
    setTheme(document.documentElement.getAttribute("data-theme") || "dark");
    $("#themeToggle")?.addEventListener("click", () => {
      const curr = document.documentElement.getAttribute("data-theme");
      setTheme(curr === "dark" ? "light" : "dark");
    });
  }

  // Nav: shadow on scroll + mobile menu
  function initNav() {
    const nav = $("#nav");
    const onScroll = () => nav?.classList.toggle("scrolled", window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    const burger = $("#burger");
    const menu = $("#mobileMenu");
    if (!burger || !menu) return;

    const setOpen = (open) => {
      menu.hidden = !open;
      burger.setAttribute("aria-expanded", String(open));
      burger.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      nav?.classList.toggle("menu-open", open);
    };

    burger.addEventListener("click", () => setOpen(menu.hidden));
    $$("a", menu).forEach((a) => a.addEventListener("click", () => setOpen(false)));
    window.addEventListener("keydown", (e) => e.key === "Escape" && setOpen(false));
    window.matchMedia("(min-width: 861px)").addEventListener("change", (e) => e.matches && setOpen(false));
  }

  // Active nav link
  function initActiveNav() {
    const links = $$(".nav__link");
    // Hero is observed too, so no link is highlighted at the top of the page
    const sections = ["#home", ...links.map((a) => a.getAttribute("href"))]
      .map((sel) => document.querySelector(sel))
      .filter(Boolean);

    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        links.forEach((a) => a.classList.toggle("active", a.getAttribute("href") === "#" + e.target.id));
      });
    }, { rootMargin: "-40% 0px -55% 0px" });

    sections.forEach((s) => io.observe(s));
  }

  // Reveal on scroll
  function initReveal() {
    const els = $$(".reveal");
    if (reduceMotion || !("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("show"));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add("show");
        io.unobserve(e.target);
      });
    }, { threshold: 0.1, rootMargin: "0px 0px -40px 0px" });
    els.forEach((el) => io.observe(el));
  }

  // Render projects
  function renderProjects() {
    const list = $("#projectsList");
    if (!list) return;

    list.innerHTML = PROFILE.projects.map((p, i) => {
      const stack = p.stack.map((s) => `<li>${s}</li>`).join("");
      const links = [];
      if (p.live) {
        links.push(`<a class="plink" href="${p.live}" target="_blank" rel="noreferrer">Live demo <svg width="18" height="18" class="ico ico--sm"><use href="#i-arrow"/></svg></a>`);
      }
      if (p.github) {
        links.push(`<a class="plink" href="${p.github}" target="_blank" rel="noreferrer"><svg width="18" height="18" class="ico"><use href="#i-github"/></svg> Source <svg width="18" height="18" class="ico ico--sm"><use href="#i-arrow"/></svg></a>`);
      }
      if (!links.length) {
        links.push(`<span class="plink plink--muted"><svg width="18" height="18" class="ico"><use href="#i-lock"/></svg> Private repo, walkthrough on request</span>`);
      }

      return `
        <article class="project reveal">
          <div class="project__num mono">${String(i + 1).padStart(2, "0")}</div>
          <div class="project__main">
            <p class="project__kind mono">${p.kind}</p>
            <h3 class="project__title">${p.title}</h3>
            <p class="project__desc">${p.desc}</p>
            <ul class="stack">${stack}</ul>
          </div>
          <div class="project__links">${links.join("")}</div>
        </article>`;
    }).join("");
  }

  // Render skills
  function renderSkills() {
    const grid = $("#skillsGrid");
    if (!grid) return;

    grid.innerHTML = PROFILE.skills.map((g) => `
      <div class="skillGroup reveal">
        <h3 class="skillGroup__title mono">${g.group}</h3>
        <ul class="skillGroup__list">${g.items.map((s) => `<li>${s}</li>`).join("")}</ul>
      </div>`).join("");
  }

  // Contact: copy email + EmailJS form (mailto fallback)
  function initContact() {
    const yearEl = $("#year");
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    $("#copyEmailBtn")?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(PROFILE.email);
        toast("Email copied to clipboard");
      } catch {
        toast(PROFILE.email);
      }
    });

    const EMAILJS_KEY = "q-8nRXtqcr5NmmViF";
    const EMAILJS_SERVICE_ID = "service_m1ez5zm";
    const EMAILJS_TEMPLATE_ID = "template_4ml6ubo";
    const isConfigured = Boolean(EMAILJS_KEY && EMAILJS_SERVICE_ID && EMAILJS_TEMPLATE_ID);

    if (isConfigured) {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.min.js";
      script.onload = () => window.emailjs.init(EMAILJS_KEY);
      document.head.appendChild(script);
    }

    // Shared with chat.js so the AI assistant can forward client details
    const sendEmail = ({ name, email, message }) => {
      if (!isConfigured || !window.emailjs) return Promise.reject(new Error("EmailJS not ready"));
      return window.emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
        from_name: name,
        from_email: email,
        message,
        to_email: PROFILE.email
      });
    };
    window.AE_sendEmail = sendEmail;

    const form = $("#contactForm");
    if (!form) return;

    const openMailto = (name, email, message) => {
      const subject = encodeURIComponent(`Portfolio contact from ${name}`);
      const body = encodeURIComponent(`Name: ${name}\nEmail: ${email}\n\n${message}`);
      window.location.href = `mailto:${PROFILE.email}?subject=${subject}&body=${body}`;
    };

    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const name = $("#name").value.trim();
      const email = $("#email").value.trim();
      const message = $("#message").value.trim();

      if (!name || !email || !message) {
        toast("Please fill in all fields");
        return;
      }
      if (!$("#email").checkValidity()) {
        toast("Please enter a valid email");
        return;
      }

      if (!isConfigured || !window.emailjs) {
        openMailto(name, email, message);
        return;
      }

      const btn = form.querySelector("button[type='submit']");
      const original = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Sending…";

      try {
        await sendEmail({ name, email, message });
        toast("Thanks, your message was sent");
        form.reset();
      } catch (err) {
        console.error("EmailJS error:", err);
        toast("Couldn't send, opening your mail app");
        openMailto(name, email, message);
      } finally {
        btn.disabled = false;
        btn.textContent = original;
      }
    });
  }

  function boot() {
    initTheme();
    initNav();
    renderProjects();
    renderSkills();
    initActiveNav();
    initReveal();
    initContact();
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
