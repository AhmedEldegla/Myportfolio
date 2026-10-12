// Turns CMS content (GET /content on the API) into the page's HTML.
// Used in two places with the same code:
//  - scripts/build-content.mjs bakes it into index.html when the site is published (fast, SEO-friendly)
//  - page.js renders extra pages (page.html?p=slug) in the browser
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.AECMS = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const SITE_URL = "https://www.ahmedeldegla.com/";

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ico = (id, cls = "ico") => `<svg width="18" height="18" class="${cls}"><use href="#${id}"/></svg>`;
  const pad = (n) => String(n).padStart(2, "0");

  /** Only web, mail and same-site links; anything else (javascript:, data:) becomes "#". */
  function safeUrl(url) {
    const u = String(url ?? "").trim();
    if (!u) return "";
    if (/^(https?:|mailto:|tel:)/i.test(u) || /^(\.{0,2}\/|#)/.test(u)) return u;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) return u;   // relative path like assets/x.png
    return "#";
  }

  /** Escapes text and turns *word* into the gold highlight. */
  const highlight = (s) => esc(s).replace(/\*([^*]+)\*/g, "<em>$1</em>");

  function linkIcon(label, url) {
    const s = `${label} ${url}`.toLowerCase();
    if (s.includes("github")) return "i-github";
    if (s.includes("linkedin")) return "i-linkedin";
    if (s.includes("mailto:") || s.includes("email")) return "i-mail";
    return "i-globe";
  }
  const external = (url) => /^https?:/i.test(url) ? ` target="_blank" rel="noreferrer"` : "";

  // ---------- Regions of index.html ----------

  function seo(site) {
    const title = site.seoTitle || `${site.name} | ${site.role}`;
    return `
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(site.seoDescription)}" />
  `;
  }

  function social(site) {
    const title = site.seoTitle || `${site.name} | ${site.role}`;
    const image = /^https?:/i.test(site.portraitUrl) ? site.portraitUrl : SITE_URL + String(site.portraitUrl || "assets/profile.jpg").replace(/^\.?\//, "");
    return `
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(site.seoDescription)}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${SITE_URL}" />
  <meta property="og:image" content="${esc(image)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(site.seoDescription)}" />
  <meta name="twitter:image" content="${esc(image)}" />
  `;
  }

  function jsonLd(site) {
    const image = /^https?:/i.test(site.portraitUrl) ? site.portraitUrl : SITE_URL + String(site.portraitUrl || "assets/profile.jpg").replace(/^\.?\//, "");
    const data = {
      "@context": "https://schema.org",
      "@type": "Person",
      name: site.name,
      jobTitle: site.role,
      address: { "@type": "PostalAddress", addressLocality: (site.location || "").split(",")[0].trim() },
      url: SITE_URL,
      image,
      sameAs: (site.links || []).map((l) => l.url).filter((u) => /^https?:/i.test(u))
    };
    return `
  <script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>
  `;
  }

  function cvLink(site, cls, label = "Resume") {
    return site.cvUrl ? `<a class="${cls}" href="${esc(safeUrl(site.cvUrl))}"${external(site.cvUrl)}>${label}</a>` : "";
  }

  function hero(site) {
    const socials = (site.links || []).filter((l) => ["i-github", "i-linkedin"].includes(linkIcon(l.label, l.url)))
      .map((l) => `
            <a class="iconBtn" href="${esc(safeUrl(l.url))}"${external(l.url)} aria-label="${esc(l.label)}">
              ${ico(linkIcon(l.label, l.url))}
            </a>`).join("");
    const cv = site.cvUrl ? `
            <a class="iconBtn" href="${esc(safeUrl(site.cvUrl))}"${external(site.cvUrl)} aria-label="Resume (PDF)">
              ${ico("i-file")}
            </a>` : "";
    return `
        ${site.status ? `<p class="status reveal"><span class="status__dot" aria-hidden="true"></span>${esc(site.status)}</p>` : ""}

        <h1 class="hero__title reveal">
          ${highlight(site.heroTitle)}
        </h1>

        <p class="hero__lead reveal">
          ${esc(site.heroLead)}
        </p>

        <div class="hero__cta reveal">
          <button class="btn btn--accent" type="button" data-book>
            ${ico("i-cal")} Book a call
          </button>
          <a class="btn btn--line" href="#projects">See my work</a>
          <div class="hero__social">${socials}${cv}
          </div>
        </div>
      `;
  }

  function portrait(site) {
    return `
        <img src="${esc(safeUrl(site.portraitUrl) || "./assets/profile.jpg")}" alt="Portrait of ${esc(site.name)}" width="1920" height="2560" loading="eager" fetchpriority="high" />
        <figcaption class="portrait__cap">
          <span>${esc(site.name)}</span>
          <span class="mono">${esc(site.location)}</span>
        </figcaption>
      `;
  }

  function facts(site) {
    return (site.facts || []).map((f) => `
        <div class="fact">
          <dt>${esc(f.label)}</dt>
          <dd>${esc(f.value)}</dd>
        </div>`).join("") + "\n      ";
  }

  function marquee(site) {
    const items = (site.marquee || []).map((m) => `<span class="marquee__item">${esc(m)}</span><span class="marquee__star">✦</span>`).join("");
    return `
        <div class="marquee__group">${items}</div>
        <div class="marquee__group">${items}</div>
      `;
  }

  function about(site) {
    const cols = (site.aboutColumns || []).map((c) => `
          <div>
            <h3 class="mini">${esc(c.title)}</h3>
            <p>${esc(c.body)}</p>
          </div>`).join("");
    return `
        <p class="about__big reveal">
          ${esc(site.aboutStatement)}
        </p>
        <div class="about__cols reveal">${cols}
        </div>
      `;
  }

  function experience(items) {
    return (items || []).map((e) => `
        <li class="job reveal">
          <div class="job__when mono">${esc(e.period)}</div>
          <div class="job__body">
            <h3 class="job__title">${esc(e.title)}</h3>
            ${e.organization ? `<p class="job__org">${esc(e.organization)}</p>` : ""}
            ${e.bullets?.length ? `<ul class="job__list">${e.bullets.map((b) => `
              <li>${esc(b)}</li>`).join("")}
            </ul>` : ""}
          </div>
        </li>`).join("\n") + "\n      ";
  }

  function projects(items) {
    return (items || []).map((p, i) => {
      const links = [];
      if (p.liveUrl) links.push(`<a class="plink" href="${esc(safeUrl(p.liveUrl))}"${external(p.liveUrl)}>Live demo ${ico("i-arrow", "ico ico--sm")}</a>`);
      if (p.sourceUrl) links.push(`<a class="plink" href="${esc(safeUrl(p.sourceUrl))}"${external(p.sourceUrl)}>${ico("i-github")} Source ${ico("i-arrow", "ico ico--sm")}</a>`);
      if (!links.length) links.push(`<span class="plink plink--muted">${ico("i-lock")} Private repo, walkthrough on request</span>`);
      const stats = p.stats?.length
        ? `<dl class="pstats">${p.stats.map((s) => `<div><dt>${esc(s.label)}</dt><dd>${esc(s.value)}</dd></div>`).join("")}</dl>` : "";
      const bullets = p.bullets?.length ? `<ul class="project__bullets">${p.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>` : "";
      const image = p.imageUrl ? `<img class="project__img" src="${esc(safeUrl(p.imageUrl))}" alt="${esc(p.title)}" loading="lazy" />` : "";
      return `
        <article class="project${p.featured ? " project--featured" : ""} reveal" id="project-${esc(p.slug)}">
          <div class="project__num mono">${pad(i + 1)}</div>
          <div class="project__main">
            ${image}
            <p class="project__kind mono">${esc(p.kind)}</p>
            <h3 class="project__title">${esc(p.title)}</h3>
            <p class="project__desc">${esc(p.summary)}</p>
            ${stats}
            ${bullets}
            <ul class="stack">${(p.stack || []).map((s) => `<li>${esc(s)}</li>`).join("")}</ul>
          </div>
          <div class="project__links">${links.join("")}</div>
        </article>`;
    }).join("") + "\n      ";
  }

  function services(items) {
    if (!items?.length) return "\n    ";
    return `
    <section id="services" class="section container">
      <header class="section__head reveal">
        <span class="section__index mono">✦</span>
        <h2 class="section__title">Services</h2>
      </header>
      <div class="services">${items.map((s) => `
        <article class="service reveal">
          <h3 class="service__title">${esc(s.title)}</h3>
          <p class="service__desc">${esc(s.description)}</p>
          ${s.price ? `<p class="service__price mono">${esc(s.price)}</p>` : ""}
          <button class="linkBtn service__cta" type="button" data-book>Book a call about this ${ico("i-arrow", "ico ico--sm")}</button>
        </article>`).join("")}
      </div>
    </section>
    `;
  }

  function skills(items) {
    return (items || []).map((g) => `
        <div class="skillGroup reveal">
          <h3 class="skillGroup__title mono">${esc(g.name)}</h3>
          <ul class="skillGroup__list">${(g.items || []).map((s) => `<li>${esc(s)}</li>`).join("")}</ul>
        </div>`).join("") + "\n      ";
  }

  function contact(site) {
    const links = (site.links || []).map((l) => `
            <li><a href="${esc(safeUrl(l.url))}"${external(l.url)}>${ico(linkIcon(l.label, l.url))} ${esc(l.label)} ${ico("i-arrow", "ico ico--sm")}</a></li>`).join("");
    const cv = site.cvUrl ? `
            <li><a href="${esc(safeUrl(site.cvUrl))}"${external(site.cvUrl)}>${ico("i-file")} Resume (PDF) ${ico("i-arrow", "ico ico--sm")}</a></li>` : "";
    return `
          <p class="contact__big">${highlight(site.contactHeadline)}</p>
          <p class="muted">${esc(site.contactText).replace(/book a call/i, (m) => `<button class="linkBtn" type="button" data-book>${m}</button>`)}</p>

          <div class="emailRow">
            <a class="emailRow__addr" href="mailto:${esc(site.email)}">${esc(site.email)}</a>
            <button class="iconBtn" id="copyEmailBtn" type="button" aria-label="Copy email address">
              ${ico("i-copy")}
            </button>
          </div>

          <ul class="contact__links">${links}${cv}
          </ul>
        `;
  }

  const SECTIONS = [["about", "About"], ["experience", "Experience"], ["projects", "Projects"], ["skills", "Skills"], ["contact", "Contact"]];

  function nav(content) {
    const base = SECTIONS.map(([id, label]) => `
        <a class="nav__link" href="#${id}">${label}</a>`);
    if (content.services?.length) base.splice(3, 0, `
        <a class="nav__link" href="#services">Services</a>`);
    const pages = (content.pages || []).filter((p) => p.showInNav).map((p) => `
        <a class="nav__link" href="./page.html?p=${encodeURIComponent(p.slug)}">${esc(p.title)}</a>`);
    return base.concat(pages).join("") + "\n      ";
  }

  function mobile(content) {
    const base = SECTIONS.map(([id, label]) => `
        <a href="#${id}" class="mobile__link">${label}</a>`);
    if (content.services?.length) base.splice(3, 0, `
        <a href="#services" class="mobile__link">Services</a>`);
    const pages = (content.pages || []).filter((p) => p.showInNav).map((p) => `
        <a href="./page.html?p=${encodeURIComponent(p.slug)}" class="mobile__link">${esc(p.title)}</a>`);
    return base.concat(pages).join("") + "\n        ";
  }

  /** Every region, keyed by the name used in <!--cms:name--> … <!--/cms:name--> markers. */
  function regions(content) {
    const site = content.site;
    return {
      seo: seo(site),
      social: social(site),
      jsonld: jsonLd(site),
      navlinks: nav(content),
      navcv: cvLink(site, "btn btn--line btn--sm nav__cv"),
      mobilelinks: mobile(content),
      mobilecv: cvLink(site, "btn btn--line"),
      hero: hero(site),
      portrait: portrait(site),
      facts: facts(site),
      marquee: marquee(site),
      about: about(site),
      experience: experience(content.experience),
      projects: projects(content.projects),
      services: services(content.services),
      skills: skills(content.skills),
      contact: contact(site)
    };
  }

  /** Replaces the content between each pair of markers. Unknown or missing markers are left alone. */
  function bake(html, content) {
    const parts = regions(content);
    return html.replace(/<!--cms:([a-z]+)-->[\s\S]*?<!--\/cms:\1-->/g, (whole, name) =>
      name in parts ? `<!--cms:${name}-->${parts[name]}<!--/cms:${name}-->` : whole);
  }

  // ---------- Markdown for extra pages (a safe subset: everything is escaped first) ----------

  function inlineMd(text) {
    let s = esc(text);
    const codes = [];
    s = s.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, url) => `<img src="${safeUrl(url)}" alt="${alt}" loading="lazy" />`);
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => {
      const href = safeUrl(url.replace(/&amp;/g, "&"));
      return `<a href="${esc(href)}"${external(href)}>${label}</a>`;
    });
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
    return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
  }

  function markdown(md) {
    const lines = String(md ?? "").replace(/\r\n?/g, "\n").split("\n");
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (/^```/.test(line)) {
        const code = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]);
        i++;
        out.push(`<pre><code>${esc(code.join("\n"))}</code></pre>`);
        continue;
      }
      const h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) { const n = Math.min(h[1].length + 1, 6); out.push(`<h${n}>${inlineMd(h[2])}</h${n}>`); i++; continue; }
      if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { out.push("<hr />"); i++; continue; }
      if (/^>\s?/.test(line)) {
        const quote = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) quote.push(lines[i++].replace(/^>\s?/, ""));
        out.push(`<blockquote>${markdown(quote.join("\n"))}</blockquote>`);
        continue;
      }
      if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
        const ordered = /^\s*\d+\./.test(line);
        const items = [];
        while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*+]|\d+\.)\s+/, ""));
        out.push(`<${ordered ? "ol" : "ul"}>${items.map((it) => `<li>${inlineMd(it)}</li>`).join("")}</${ordered ? "ol" : "ul"}>`);
        continue;
      }
      if (!line.trim()) { i++; continue; }
      const para = [];
      while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|>|\s*([-*+]|\d+\.)\s+)/.test(lines[i])) para.push(lines[i++]);
      out.push(`<p>${para.map(inlineMd).join("<br />")}</p>`);
    }
    return out.join("\n");
  }

  return { esc, safeUrl, highlight, regions, bake, markdown };
});
