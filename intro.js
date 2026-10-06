(() => {
  const root = document.documentElement;
  const $ = (s) => document.querySelector(s);

  // Lift the page hold and let the hero play in (motion.js listens for ae:reveal)
  function reveal() {
    if (!root.classList.contains("is-loading")) return;
    root.classList.remove("is-loading");
    document.dispatchEvent(new Event("ae:reveal"));
  }

  function boot() {
    const intro = $("#intro");
    if (!root.classList.contains("intro-on") || !intro) {
      intro?.remove();
      // Repeat visit or deep link: short pause so the hero stagger still plays
      setTimeout(reveal, 120);
      return;
    }

    // Start at the top; a section link (#projects) is honoured once the intro is done
    const hash = location.hash;
    try {
      history.scrollRestoration = "manual";
      if (hash) history.replaceState(null, "", location.pathname + location.search);
    } catch {}
    window.scrollTo(0, 0);

    // Hold the page still while the intro plays (no overflow lock, so nothing shifts on hand-off)
    const block = (e) => e.preventDefault();
    const blockKeys = (e) => [" ", "ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End"].includes(e.key) && e.target === document.body && e.preventDefault();
    window.addEventListener("wheel", block, { passive: false });
    window.addEventListener("touchmove", block, { passive: false });
    window.addEventListener("keydown", blockKeys);
    const unblock = () => {
      window.removeEventListener("wheel", block);
      window.removeEventListener("touchmove", block);
      window.removeEventListener("keydown", blockKeys);
    };

    const word = $("#introWord");
    const count = $("#introCount");
    const role = $("#introRole");
    const card = $("#introCard");
    const photo = card?.querySelector(".intro__photo");
    const timers = [];
    const at = (ms, fn) => timers.push(setTimeout(fn, ms));

    const T_NAME = 1950;
    const T_EXIT = 4300;
    let nameShown = false;
    let exiting = false;

    // Counter runs for the whole intro
    const t0 = performance.now();
    let counting = true;
    const tick = (now) => {
      if (!counting) return;
      const t = Math.min((now - t0) / T_EXIT, 1);
      const p = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      count.textContent = String(Math.round(p * 100)).padStart(3, "0");
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    // Phase 1: greetings flick past
    const hellos = ["Hello", "مرحبا", "Bonjour", "Hola", "Ciao", "Hallo", "Olá", "こんにちは", "Welcome"];
    hellos.forEach((h, i) => {
      if (i === 0) return;
      const last = i === hellos.length - 1;
      at(380 + (i - 1) * 155 + (last ? 120 : 0), () => {
        word.textContent = h;
        word.dir = /[؀-ۿ]/.test(h) ? "rtl" : "ltr";
        word.animate(
          [{ opacity: 0, transform: "translateY(35%)", filter: "blur(6px)" }, { opacity: 1, transform: "none", filter: "blur(0)" }],
          { duration: last ? 420 : 150, easing: "cubic-bezier(.16,1,.3,1)" }
        );
      });
    });

    // Phase 2: name rises, portrait unveils, role decodes
    at(T_NAME, () => { intro.classList.add("is-name"); nameShown = true; });
    at(T_NAME + 650, () => scramble(role, role.textContent, 900));

    // Phase 3: curtain lifts
    at(T_EXIT, exit);

    $("#introSkip")?.addEventListener("click", exit);
    window.addEventListener("keydown", (e) => e.key === "Escape" && exit());

    function exit() {
      if (exiting) return;
      exiting = true;
      timers.forEach(clearTimeout);
      counting = false;
      count.textContent = "100";

      unblock();
      root.classList.add("intro-flip");
      intro.classList.add("is-name", "is-exit");
      const flight = nameShown ? flyCard() : 0;
      if (!nameShown) card.style.display = "none";

      // Let the curtain start moving before the hero plays in underneath
      setTimeout(reveal, 180);
      setTimeout(() => finish(), Math.max(flight, 1250));
    }

    // Fly the intro photo onto the hero portrait (FLIP), so it lands exactly in place
    function flyCard() {
      const target = $(".hero .portrait");
      const t = target?.getBoundingClientRect();
      const c = card.getBoundingClientRect();
      const ease = "cubic-bezier(.76,0,.24,1)";
      const visible = t && t.width && t.top < innerHeight * 0.8 && t.bottom > 0;

      if (!visible) {
        card.animate(
          [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(-80px) scale(.9)" }],
          { duration: 700, easing: ease, fill: "forwards" }
        );
        return 700;
      }

      const s = t.width / c.width;
      const dur = 1150;
      card.animate(
        [
          { transform: "none" },
          { transform: `translate(${t.left - c.left}px, ${t.top - c.top}px) scale(${s})` }
        ],
        { duration: dur, easing: ease, fill: "forwards" }
      );
      photo.style.transition = "none";
      photo.animate(
        [{ clipPath: "inset(0 0 0 0 round 14px)" }, { clipPath: `inset(0 0 0 0 round ${14 / s}px)` }],
        { duration: dur, easing: ease, fill: "forwards" }
      );
      card.animate([{ filter: "drop-shadow(0 30px 60px rgba(0,0,0,.55))" }, { filter: "drop-shadow(0 0 0 rgba(0,0,0,0))" }], { duration: dur, fill: "forwards" });
      return dur;
    }

    function finish() {
      const portrait = $(".hero .portrait");
      portrait?.classList.add("no-anim");
      root.classList.remove("intro-flip", "intro-on");
      intro.remove();
      if (hash) {
        try { history.replaceState(null, "", hash); } catch {}
        let target = null;
        try { target = document.querySelector(hash); } catch {}
        if (target) setTimeout(() => target.scrollIntoView({ behavior: "smooth" }), 700);
      }
      reveal();
      requestAnimationFrame(() => requestAnimationFrame(() => portrait?.classList.remove("no-anim")));
    }
  }

  // Decode text from random glyphs, left to right
  function scramble(el, final, duration) {
    const glyphs = "ABCDEFGHIJKLMNOPQRSTUVWXYZ#%&*+<>/=_01";
    const start = performance.now();
    const step = (now) => {
      const p = Math.min((now - start) / duration, 1);
      const done = Math.floor(p * final.length);
      el.textContent = final
        .split("")
        .map((ch, i) => (i < done || ch === " " ? ch : glyphs[(Math.random() * glyphs.length) | 0]))
        .join("");
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = final;
    };
    requestAnimationFrame(step);
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
