(() => {
  // Site content (projects, skills, text) is baked into index.html from the CMS; see cms.js
  const EMAIL = () => document.querySelector(".emailRow__addr")?.textContent.trim() || "ahmeddagla99@gmail.com";

  // Backend (portfolio-api): bookings, inbox, AI assistant, analytics. Set in config.js
  const API = window.AE_API;

  // Privacy-friendly analytics: an anonymous random id, no cookies, no IP stored
  let visitor = "";
  try {
    visitor = localStorage.getItem("ae_vid") || "";
    if (!visitor) {
      visitor = Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem("ae_vid", visitor);
    }
  } catch {}
  const device = () => (innerWidth < 640 ? "mobile" : innerWidth < 1024 ? "tablet" : "desktop");
  function track(type, name = "") {
    const body = JSON.stringify({ type, name, path: location.pathname, ref: document.referrer, vid: visitor, device: device() });
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(API + "/track", new Blob([body], { type: "text/plain" }))) return;
    } catch {}
    fetch(API + "/track", { method: "POST", body, keepalive: true }).catch(() => {});
  }
  window.AE_track = track;

  // Saves a message to Ahmed's inbox. Resolves with { ok, emailed } or rejects.
  window.AE_postContact = async (payload) => {
    const res = await fetch(API + "/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(String(res.status));
    return res.json();
  };

  function initAnalytics() {
    track("pageview");
    if (!("IntersectionObserver" in window)) return;
    const seen = new Set();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting || seen.has(e.target.id)) return;
        seen.add(e.target.id);
        io.unobserve(e.target);
        track("section", e.target.id);
      });
    }, { threshold: 0.35 });
    ["about", "experience", "projects", "services", "skills", "contact"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    });
  }

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
    $("#themeToggle")?.addEventListener("click", (e) => {
      const curr = document.documentElement.getAttribute("data-theme");
      const next = curr === "dark" ? "light" : "dark";
      if (reduceMotion || !document.startViewTransition) return setTheme(next);

      // Circular reveal of the new theme, growing out of the toggle button
      const r = e.currentTarget.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
      document.startViewTransition(() => setTheme(next)).ready.then(() => {
        document.documentElement.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`] },
          { duration: 700, easing: "cubic-bezier(.76,0,.24,1)", pseudoElement: "::view-transition-new(root)" }
        );
      });
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

  // Account button in the nav: "Sign in", or the signed-in person's avatar
  function initAccountNav() {
    const Auth = window.AEAuth;
    const slot = $("#navAccount");
    if (!Auth || !slot) return;
    const render = (user) => {
      const initials = (user?.displayName || user?.email || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
      const href = user?.roles?.includes("Admin") ? "./admin.html" : "./account.html";
      slot.innerHTML = user
        ? `<a class="navAvatar" href="${href}" aria-label="Your account" title="${user.displayName || user.email}">${
            user.avatarUrl ? `<img src="${user.avatarUrl}" alt="" />` : `<span>${initials}</span>`}</a>`
        : `<a class="btn btn--line btn--sm navSignIn" href="./account.html">Sign in</a>`;
      $$("[data-account-link]").forEach((a) => {
        a.textContent = user ? (user.roles?.includes("Admin") ? "Dashboard" : "My account") : "Sign in";
        a.href = href;
      });
    };
    render(Auth.user);
    Auth.onChange(render);
  }

  // Contact: copy email + EmailJS form (mailto fallback)
  function initContact() {
    const yearEl = $("#year");
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    $("#copyEmailBtn")?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(EMAIL());
        toast("Email copied to clipboard");
      } catch {
        toast(EMAIL());
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
        to_email: EMAIL()
      });
    };
    window.AE_sendEmail = sendEmail;

    const form = $("#contactForm");
    if (!form) return;

    const openMailto = (name, email, message) => {
      const subject = encodeURIComponent(`Portfolio contact from ${name}`);
      const body = encodeURIComponent(`Name: ${name}\nEmail: ${email}\n\n${message}`);
      window.location.href = `mailto:${EMAIL()}?subject=${subject}&body=${body}`;
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

      const btn = form.querySelector("button[type='submit']");
      const original = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Sending…";

      try {
        // Saved to Ahmed's inbox first; EmailJS covers the email until the server sends its own
        const saved = await window.AE_postContact({ name, email, message }).catch(() => null);
        if (!saved || !saved.emailed) {
          if (!isConfigured || !window.emailjs) {
            if (!saved) throw new Error("no_channel");
          } else {
            await sendEmail({ name, email, message }).catch((err) => { if (!saved) throw err; });
          }
        }
        track("contact");
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
    initAccountNav();
    initActiveNav();
    initReveal();
    initContact();
    initAnalytics();
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
