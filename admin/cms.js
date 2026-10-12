// Dashboard additions: website content (CMS), pages, media library, clients, live chat and publishing.
// Plugs into admin.js through window.AEAdmin.
(() => {
  const A = window.AEAdmin;
  const Live = window.AELive;
  const CMS = window.AECMS;
  if (!A) return;
  const { S, api, esc, icon, toast, dialog, setHead, ago } = A;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  // ====================================================================
  // Publishing: the website is static, so changes go live when it is rebuilt
  // ====================================================================
  const P = { state: null, busy: false };

  async function loadPublish() {
    try { P.state = await api("/admin/publish"); } catch { P.state = null; }
    renderPublish();
  }
  function renderPublish() {
    const btn = $("#publishBtn");
    if (!btn) return;
    const st = P.state;
    btn.classList.toggle("is-pending", Boolean(st?.pending));
    btn.classList.toggle("btn--accent", Boolean(st?.pending));
    btn.classList.toggle("btn--line", !st?.pending);
    btn.disabled = P.busy;
    btn.querySelector("span").textContent = P.busy ? "Publishing…" : st?.pending ? "Publish changes" : "Published";
    btn.title = st?.pending && st.autoPublishMinutes
      ? `Unpublished changes. They go live automatically ${st.autoPublishMinutes} min after your last edit, or publish now.`
      : st?.lastPublished ? `Last published ${ago(st.lastPublished)}` : "Publish website changes";
  }
  function markChanged() {
    if (P.state) { P.state.pending = true; renderPublish(); }
  }
  async function publish() {
    if (!P.state?.enabled) {
      await dialog(`<h2>Connect publishing</h2>
        <p>Your edits are saved. To rebuild the website from here, add a GitHub token on the server (step "Publish button" in DEPLOY.md).</p>
        <p>Until then, the site picks up content the next time the website repo is deployed.</p>
        <div class="dlg__actions"><a class="btn btn--line btn--sm" href="https://github.com/AhmedEldegla/portfolio-api/blob/main/DEPLOY.md#publish-button-rebuild-the-website-from-the-dashboard" target="_blank" rel="noreferrer">How to connect</a><button class="btn btn--accent btn--sm" value="ok">OK</button></div>`);
      return;
    }
    P.busy = true;
    renderPublish();
    try {
      const r = await api("/admin/publish", { method: "POST" });
      P.state = r.state;
      toast("Publishing. The website updates in about a minute.");
      setTimeout(loadPublish, 5000);
    } catch (err) {
      toast(err.data?.message || "Couldn't publish. Try again.");
    } finally {
      P.busy = false;
      renderPublish();
    }
  }

  // ====================================================================
  // Form fields
  // ====================================================================
  // Field: { name, label, type, hint, max, placeholder, cols:[[key,label],..] (pairs), options }
  function fieldHtml(f, value) {
    const id = `f_${f.name}`;
    const hint = f.hint ? `<small class="fhint">${esc(f.hint)}</small>` : "";
    const lab = `<span>${esc(f.label)}${f.optional ? " <em>(optional)</em>" : ""}</span>`;
    const max = f.max ? ` maxlength="${f.max}"` : "";
    const ph = f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : "";
    switch (f.type) {
      case "textarea":
        return `<label class="field">${lab}<textarea id="${id}" name="${f.name}" rows="${f.rows || 4}"${max}${ph}>${esc(value ?? "")}</textarea>${hint}</label>`;
      case "lines":
        return `<label class="field">${lab}<textarea id="${id}" name="${f.name}" rows="${f.rows || 4}"${ph} data-kind="lines">${esc((value || []).join("\n"))}</textarea><small class="fhint">${esc(f.hint || "One per line")}</small></label>`;
      case "tags":
        return `<label class="field">${lab}<input id="${id}" name="${f.name}" data-kind="tags" value="${esc((value || []).join(", "))}"${ph} /><small class="fhint">${esc(f.hint || "Separate with commas")}</small></label>`;
      case "bool":
        return `<div class="toggle-row"><div><strong>${esc(f.label)}</strong>${f.hint ? `<p>${esc(f.hint)}</p>` : ""}</div><label class="switch"><input type="checkbox" name="${f.name}" data-kind="bool" ${value ? "checked" : ""} aria-label="${esc(f.label)}"/><span></span></label></div>`;
      case "image":
        return `<div class="field">${lab}<div class="imgField">
            <span class="imgField__preview">${value ? `<img src="${esc(value)}" alt="" />` : icon("i-image")}</span>
            <input id="${id}" name="${f.name}" value="${esc(value ?? "")}" placeholder="https://… or choose from Media" />
            <button type="button" class="btn btn--line btn--sm" data-cms="pickImage" data-target="${id}">${icon("i-image")}Choose</button>
          </div>${hint}</div>`;
      case "pairs": {
        const rows = (value || []).map((v) => pairRow(f, v)).join("");
        return `<div class="field" data-pairs="${f.name}">${lab}<div class="pairs">${rows}</div>
          <button type="button" class="btn btn--ghost btn--sm" data-cms="addPair" data-field="${f.name}">${icon("i-plus")}Add</button>${hint}</div>`;
      }
      default:
        return `<label class="field">${lab}<input id="${id}" name="${f.name}" type="${f.type === "url" ? "url" : f.type === "email" ? "email" : "text"}" value="${esc(value ?? "")}"${max}${ph} ${f.required ? "required" : ""} />${hint}</label>`;
    }
  }
  function pairRow(f, v = {}) {
    return `<div class="pair">${f.cols.map(([k, l, type]) => type === "textarea"
      ? `<textarea data-k="${k}" placeholder="${esc(l)}" rows="3">${esc(v[k] ?? "")}</textarea>`
      : `<input data-k="${k}" placeholder="${esc(l)}" value="${esc(v[k] ?? "")}" />`).join("")}
      <button type="button" class="iconBtn" data-cms="removePair" aria-label="Remove">${icon("i-x")}</button></div>`;
  }
  function readForm(form, fields) {
    const out = {};
    for (const f of fields) {
      if (f.type === "pairs") {
        out[f.name] = $$(`[data-pairs="${f.name}"] .pair`, form)
          .map((row) => Object.fromEntries($$("[data-k]", row).map((i) => [i.dataset.k, i.value.trim()])))
          .filter((o) => Object.values(o).some(Boolean));
        continue;
      }
      const el = form.elements[f.name];
      if (!el) continue;
      if (f.type === "bool") out[f.name] = el.checked;
      else if (f.type === "lines") out[f.name] = el.value.split("\n").map((x) => x.trim()).filter(Boolean);
      else if (f.type === "tags") out[f.name] = el.value.split(",").map((x) => x.trim()).filter(Boolean);
      else out[f.name] = el.value.trim();
    }
    return out;
  }

  // ====================================================================
  // Media picker (used by image fields)
  // ====================================================================
  async function pickImage() {
    const dlg = $("#dlg");
    dlg.classList.add("dlg--wide");
    const body = $("#dlgBody");
    body.innerHTML = `<h2>Choose an image</h2><div class="mediaGrid mediaGrid--pick"><div class="skeleton"></div></div>
      <div class="dlg__actions"><label class="btn btn--line btn--sm">${icon("i-upload")}Upload new<input type="file" accept="image/*" hidden data-cms="pickUpload" /></label><button class="btn btn--ghost btn--sm" value="cancel" formnovalidate>Cancel</button></div>`;
    dlg.showModal();
    const fill = async () => {
      const { media } = await api("/admin/media");
      $(".mediaGrid", body).innerHTML = media.length
        ? media.map((m) => `<button type="button" class="mediaTile" data-pick="${esc(m.url)}" title="${esc(m.fileName)}"><img src="${esc(m.url)}" alt="${esc(m.alt)}" loading="lazy" /></button>`).join("")
        : `<div class="empty">No images yet. Upload one.</div>`;
    };
    await fill();
    return new Promise((resolve) => {
      const done = (v) => { dlg.close(); dlg.classList.remove("dlg--wide"); body.onclick = body.onchange = body.onsubmit = null; resolve(v); };
      body.onclick = (e) => { const t = e.target.closest("[data-pick]"); if (t) done(t.dataset.pick); };
      body.onchange = async (e) => {
        if (e.target.dataset.cms !== "pickUpload" || !e.target.files[0]) return;
        try { const m = await uploadImage(e.target.files[0]); done(m.url); } catch (err) { toast(err.data?.message || "Upload failed"); }
      };
      body.onsubmit = (e) => { e.preventDefault(); done(null); };
      dlg.oncancel = () => done(null);
    });
  }

  // Large photos are scaled down in the browser first (max 2000px), keeping GIFs as they are
  function shrink(file, max = 2000) {
    if (file.type === "image/gif" || file.size < 400 * 1024) return Promise.resolve(file);
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob((b) => resolve(b && b.size < file.size ? new File([b], file.name.replace(/\.\w+$/, "") + ".webp", { type: "image/webp" }) : file), "image/webp", 0.86);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }
  async function uploadImage(file, alt = "") {
    const form = new FormData();
    form.append("file", await shrink(file));
    form.append("alt", alt);
    return api("/admin/media", { method: "POST", body: form });
  }

  // ====================================================================
  // Content: site text, projects, experience, skills, services, AI assistant
  // ====================================================================
  const SITE_FIELDS = [
    { group: "Hero" },
    { name: "name", label: "Your name", required: true, max: 80 },
    { name: "role", label: "Role", max: 120 },
    { name: "location", label: "Location", max: 120 },
    { name: "status", label: "Status line", hint: "The green dot line above the headline. Leave empty to hide it.", max: 120, optional: true },
    { name: "heroTitle", label: "Headline", type: "textarea", rows: 2, max: 200, hint: "Wrap words in *asterisks* to highlight them in gold." },
    { name: "heroLead", label: "Intro paragraph", type: "textarea", rows: 4, max: 800 },
    { name: "portraitUrl", label: "Portrait", type: "image" },
    { name: "facts", label: "Facts under the portrait", type: "pairs", cols: [["label", "Label"], ["value", "Value"]] },
    { name: "marquee", label: "Scrolling keywords", type: "tags" },
    { group: "About" },
    { name: "aboutStatement", label: "Big statement", type: "textarea", rows: 3, max: 600 },
    { name: "aboutColumns", label: "Columns", type: "pairs", cols: [["title", "Title"], ["body", "Text", "textarea"]] },
    { group: "Contact & links" },
    { name: "contactHeadline", label: "Contact headline", max: 200 },
    { name: "contactText", label: "Contact text", hint: "The words \"book a call\" become a booking button.", max: 600 },
    { name: "email", label: "Public email", type: "email" },
    { name: "cvUrl", label: "Resume link", type: "url", optional: true },
    { name: "links", label: "Links (GitHub, LinkedIn, …)", type: "pairs", cols: [["label", "Label"], ["url", "https://…"]] },
    { group: "Search & sharing" },
    { name: "seoTitle", label: "Page title", max: 120, optional: true },
    { name: "seoDescription", label: "Description", type: "textarea", rows: 3, max: 300, hint: "Shown by Google and in link previews." }
  ];

  const ASSISTANT_FIELDS = [
    { name: "enabled", label: "Show the AI assistant on the website", type: "bool", hint: "Needs a Gemini key on the server." },
    { name: "about", label: "Extra facts the assistant may use", type: "textarea", rows: 8, max: 8000, hint: "Your projects, skills, experience and services are included automatically. Add anything else: languages, education, a longer summary." },
    { group: "Business details (leave empty and the assistant says you'll confirm personally)" },
    { name: "availability", label: "Availability", placeholder: "e.g. Available for freelance from November", optional: true },
    { name: "workType", label: "Work arrangement", placeholder: "e.g. Remote worldwide, or on-site in Cairo", optional: true },
    { name: "timezone", label: "Timezone", optional: true },
    { name: "services", label: "Services offered", optional: true },
    { name: "rates", label: "Pricing", placeholder: "Leave empty to never discuss price", optional: true },
    { name: "responseTime", label: "Response time", placeholder: "e.g. Usually replies within 24 hours", optional: true }
  ];

  const COLLECTIONS = {
    projects: {
      label: "Projects", one: "project", endpoint: "/admin/content/projects", key: "projects",
      fields: [
        { name: "title", label: "Title", required: true, max: 120 },
        { name: "kind", label: "Kind", placeholder: "e.g. Backend API · Team of 5 · 2026", max: 120, optional: true },
        { name: "summary", label: "Summary", type: "textarea", rows: 3, max: 1000 },
        { name: "imageUrl", label: "Image", type: "image", optional: true },
        { name: "bullets", label: "Highlights", type: "lines", rows: 4, optional: true },
        { name: "stats", label: "Stats", type: "pairs", cols: [["value", "17"], ["label", "controllers"]], optional: true },
        { name: "stack", label: "Tech stack", type: "tags" },
        { name: "liveUrl", label: "Live demo URL", type: "url", optional: true },
        { name: "sourceUrl", label: "Source code URL", type: "url", optional: true, hint: "Without either link, the card says \"Private repo, walkthrough on request\"." },
        { name: "slug", label: "URL name", optional: true, hint: "Lowercase letters, numbers and dashes. Made from the title if empty." },
        { name: "featured", label: "Featured", type: "bool", hint: "Shown large, first in the list." },
        { name: "published", label: "Visible on the website", type: "bool" }
      ],
      blank: { published: true, stack: [] },
      title: (p) => p.title,
      sub: (p) => p.kind || p.summary,
      flags: (p) => [!p.published && "Hidden", p.featured && "Featured"].filter(Boolean)
    },
    experience: {
      label: "Experience", one: "role", endpoint: "/admin/content/experience", key: "experience",
      fields: [
        { name: "title", label: "Role or title", required: true, max: 120 },
        { name: "organization", label: "Organization", max: 200, optional: true },
        { name: "period", label: "Period", placeholder: "2024 – 2025", max: 60 },
        { name: "bullets", label: "What you did", type: "lines", rows: 5 }
      ],
      blank: {},
      title: (e) => e.title,
      sub: (e) => [e.organization, e.period].filter(Boolean).join(" · "),
      flags: () => []
    },
    skills: {
      label: "Skills", one: "skill group", endpoint: "/admin/content/skills", key: "skills",
      fields: [
        { name: "name", label: "Group name", required: true, max: 60, placeholder: "Backend" },
        { name: "items", label: "Skills", type: "lines", rows: 8 }
      ],
      blank: {},
      title: (g) => g.name,
      sub: (g) => (g.items || []).join(", "),
      flags: () => []
    },
    services: {
      label: "Services", one: "service", endpoint: "/admin/content/services", key: "services",
      fields: [
        { name: "title", label: "Title", required: true, max: 120 },
        { name: "description", label: "Description", type: "textarea", rows: 4, max: 1000 },
        { name: "price", label: "Price", placeholder: "e.g. From $500", max: 60, optional: true },
        { name: "published", label: "Visible on the website", type: "bool" }
      ],
      blank: { published: true },
      title: (s) => s.title,
      sub: (s) => s.description,
      flags: (s) => [!s.published && "Hidden", s.price].filter(Boolean)
    }
  };

  const CONTENT_TABS = [["site", "Site text"], ["projects", "Projects"], ["experience", "Experience"], ["skills", "Skills"], ["services", "Services"], ["assistant", "AI assistant"]];
  const C = { items: {} };

  function formBody(fields, data) {
    return fields.map((f) => f.group ? `<h3 class="fgroup">${esc(f.group)}</h3>` : fieldHtml(f, data[f.name])).join("");
  }

  async function viewContent(view) {
    const tab = CONTENT_TABS.some(([id]) => id === S.param) ? S.param : "site";
    setHead("Content", "Everything on your website");
    const tabs = `<div class="seg seg--scroll" role="tablist">${CONTENT_TABS.map(([id, l]) => `<a role="tab" href="#/content/${id}" class="${id === tab ? "is-on" : ""}">${l}</a>`).join("")}</div>`;

    if (tab === "site" || tab === "assistant") {
      const st = await api("/admin/settings");
      const fields = tab === "site" ? SITE_FIELDS : ASSISTANT_FIELDS;
      const data = tab === "site" ? st.site : st.assistant;
      view.innerHTML = `${tabs}
        <form class="card mt cmsForm" data-settings="${tab}" style="--i:0">
          ${tab === "assistant" && !st.integrations.ai ? `<p class="note">${icon("i-bell")} The assistant is hidden until a Gemini key is added on the server.</p>` : ""}
          ${formBody(fields, data)}
          <div class="formBar"><button class="btn btn--accent" type="submit">${icon("i-check")}Save</button>
            ${tab === "site" ? `<a class="btn btn--ghost btn--sm" href="./" target="_blank" rel="noreferrer">${icon("i-external")}View website</a>` : ""}</div>
        </form>`;
      const form = $("form", view);
      form.onsubmit = async (e) => {
        e.preventDefault();
        const value = { ...data, ...readForm(form, fields.filter((f) => !f.group)) };
        const btn = $("[type=submit]", form);
        btn.disabled = true;
        try {
          await api(`/admin/settings/${tab}`, { method: "PUT", body: { value } });
          Object.assign(data, value);
          toast(tab === "site" ? (P.state?.autoPublishMinutes ? `Saved. The website updates in a few minutes.` : "Saved. Publish to update the website.") : "Saved");
          if (tab === "site") markChanged();
        } catch (err) {
          toast(err.data?.message || "Couldn't save");
        } finally { btn.disabled = false; }
      };
      return;
    }

    const def = COLLECTIONS[tab];
    const data = await api(def.endpoint);
    const items = data[def.key];
    C.items[tab] = items;
    view.innerHTML = `${tabs}
      <div class="card mt" style="--i:0">
        <div class="card__head"><div><h2>${def.label}</h2><p>Drag to reorder. Changes are saved right away.</p></div>
          <div class="tools"><button type="button" class="btn btn--accent btn--sm" data-cms="add" data-col="${tab}">${icon("i-plus")}Add ${def.one}</button></div></div>
        ${items.length ? `<ol class="sortable" data-col="${tab}">${items.map((it, i) => `
          <li class="sortable__item" draggable="true" data-id="${it.id}">
            <span class="sortable__grip" aria-hidden="true">${icon("i-grip")}</span>
            <div class="sortable__main" data-cms="edit" data-col="${tab}" data-id="${it.id}">
              <strong>${esc(def.title(it))}</strong>
              <span>${esc((def.sub(it) || "").slice(0, 160))}</span>
            </div>
            <span class="sortable__flags">${def.flags(it).map((f) => `<span class="pill">${esc(f)}</span>`).join("")}</span>
            <span class="sortable__tools">
              <button type="button" class="iconBtn" data-cms="move" data-dir="-1" data-col="${tab}" data-id="${it.id}" aria-label="Move up" ${i === 0 ? "disabled" : ""}>${icon("i-up")}</button>
              <button type="button" class="iconBtn" data-cms="move" data-dir="1" data-col="${tab}" data-id="${it.id}" aria-label="Move down" ${i === items.length - 1 ? "disabled" : ""}>${icon("i-down")}</button>
              <button type="button" class="iconBtn" data-cms="edit" data-col="${tab}" data-id="${it.id}" aria-label="Edit">${icon("i-pen")}</button>
              <button type="button" class="iconBtn" data-cms="delete" data-col="${tab}" data-id="${it.id}" aria-label="Delete">${icon("i-trash")}</button>
            </span>
          </li>`).join("")}</ol>` : `<div class="empty"><strong>No ${def.label.toLowerCase()} yet</strong>Add your first ${def.one}.</div>`}
      </div>`;
    bindSortable($(".sortable", view));
  }

  function openEditor(col, item) {
    const def = COLLECTIONS[col];
    const isNew = !item?.id;
    const data = item || { ...def.blank };
    const drawer = $("#drawer");
    const panel = $("#drawerPanel");
    panel.innerHTML = `
      <div class="dr__top"><div><h2>${isNew ? `New ${def.one}` : esc(def.title(data))}</h2><p>${isNew ? "Fill in the details, then save." : "Edit and save. Publish to update the website."}</p></div>
        <button type="button" class="iconBtn" data-action="closeDrawer" aria-label="Close">${icon("i-x")}</button></div>
      <form class="cmsForm" id="editorForm">${formBody(def.fields, data)}
        <div class="formBar formBar--sticky"><button class="btn btn--accent" type="submit">${icon("i-check")}${isNew ? "Add" : "Save"}</button>
          <button type="button" class="btn btn--ghost" data-action="closeDrawer">Cancel</button></div></form>`;
    drawer.hidden = false;
    $("input, textarea", panel)?.focus();
    $("#editorForm").onsubmit = async (e) => {
      e.preventDefault();
      const form = e.target;
      const body = { ...data, ...readForm(form, def.fields) };
      const btn = $("[type=submit]", form);
      btn.disabled = true;
      try {
        await api(isNew ? def.endpoint : `${def.endpoint}/${item.id}`, { method: isNew ? "POST" : "PUT", body });
        drawer.hidden = true;
        toast(isNew ? "Added" : "Saved");
        markChanged();
        A.route();
      } catch (err) {
        toast(err.data?.message || "Couldn't save");
        const field = err.data?.field;
        if (field && form.elements[field]) form.elements[field].focus();
      } finally { btn.disabled = false; }
    };
  }

  async function saveOrder(col, ids) {
    try {
      await api(`${COLLECTIONS[col]?.endpoint || "/admin/content/" + col}/reorder`, { method: "POST", body: { ids } });
      markChanged();
    } catch { toast("Couldn't save the order"); }
  }

  function bindSortable(list) {
    if (!list) return;
    let dragging = null;
    list.addEventListener("dragstart", (e) => {
      dragging = e.target.closest(".sortable__item");
      dragging?.classList.add("is-dragging");
      e.dataTransfer.effectAllowed = "move";
    });
    list.addEventListener("dragover", (e) => {
      e.preventDefault();
      const over = e.target.closest(".sortable__item");
      if (!dragging || !over || over === dragging) return;
      const r = over.getBoundingClientRect();
      over.parentNode.insertBefore(dragging, e.clientY < r.top + r.height / 2 ? over : over.nextSibling);
    });
    list.addEventListener("dragend", () => {
      if (!dragging) return;
      dragging.classList.remove("is-dragging");
      dragging = null;
      saveOrder(list.dataset.col, $$(".sortable__item", list).map((li) => li.dataset.id)).then(() => A.route());
    });
  }

  // ====================================================================
  // Pages (Markdown)
  // ====================================================================
  async function viewPages(view) {
    if (S.param) return pageEditor(view, S.param);
    setHead("Pages", "Extra pages like Uses, Now, Case studies or a blog post");
    const { pages } = await api("/admin/content/pages");
    view.innerHTML = `
      <div class="card" style="--i:0">
        <div class="card__head"><div><h2>Pages</h2><p>Each page lives at ${esc((S.me.site || "").replace(/^https?:\/\//, ""))}/page.html?p=name</p></div>
          <div class="tools"><a class="btn btn--accent btn--sm" href="#/pages/new">${icon("i-plus")}New page</a></div></div>
        ${pages.length ? `<ol class="sortable" data-col="pages">${pages.map((p) => `
          <li class="sortable__item" draggable="true" data-id="${p.id}">
            <span class="sortable__grip" aria-hidden="true">${icon("i-grip")}</span>
            <a class="sortable__main" href="#/pages/${p.id}"><strong>${esc(p.title)}</strong><span>/${esc(p.slug)} · updated ${ago(p.updatedAt)}</span></a>
            <span class="sortable__flags">${p.published ? `<span class="pill pill--confirmed">Published</span>` : `<span class="pill">Draft</span>`}${p.showInNav ? `<span class="pill">In menu</span>` : ""}</span>
            <span class="sortable__tools">
              ${p.published ? `<a class="iconBtn" href="./page.html?p=${esc(p.slug)}" target="_blank" rel="noreferrer" aria-label="View">${icon("i-eye")}</a>` : ""}
              <a class="iconBtn" href="#/pages/${p.id}" aria-label="Edit">${icon("i-pen")}</a>
              <button type="button" class="iconBtn" data-cms="deletePage" data-id="${p.id}" aria-label="Delete">${icon("i-trash")}</button>
            </span>
          </li>`).join("")}</ol>` : `<div class="empty"><strong>No pages yet</strong>Write one in Markdown: headings, lists, links, images and code.</div>`}
      </div>`;
    bindSortable($(".sortable", view));
  }

  async function pageEditor(view, id) {
    const isNew = id === "new";
    const p = isNew ? { title: "", slug: "", description: "", body: "", published: false, showInNav: false } : await api(`/admin/content/pages/${id}`);
    setHead(isNew ? "New page" : p.title, isNew ? "" : `/${p.slug}`);
    view.innerHTML = `
      <a class="back-link back-link--always" href="#/pages">${icon("i-back")} All pages</a>
      <form class="pageEd" id="pageForm">
        <div class="card pageEd__meta" style="--i:0">
          <label class="field"><span>Title</span><input name="title" required maxlength="120" value="${esc(p.title)}" /></label>
          <div class="dlg__row">
            <label class="field"><span>URL name <em>(optional)</em></span><input name="slug" maxlength="80" value="${esc(p.slug)}" placeholder="made from the title" /></label>
            <label class="field"><span>Description <em>(for Google)</em></span><input name="description" maxlength="300" value="${esc(p.description)}" /></label>
          </div>
          <div class="toggle-row"><div><strong>Published</strong><p>Visible to everyone at page.html?p=${esc(p.slug || "…")}</p></div><label class="switch"><input type="checkbox" name="published" ${p.published ? "checked" : ""}/><span></span></label></div>
          <div class="toggle-row"><div><strong>Show in the menu</strong><p>Adds a link to the site's navigation (after Publish)</p></div><label class="switch"><input type="checkbox" name="showInNav" ${p.showInNav ? "checked" : ""}/><span></span></label></div>
        </div>
        <div class="pageEd__split">
          <div class="card" style="--i:1"><div class="card__head"><div><h2>Markdown</h2><p># Heading, **bold**, *italic*, - lists, [link](https://…), ![image](url)</p></div>
            <div class="tools"><button type="button" class="btn btn--ghost btn--sm" data-cms="insertImage">${icon("i-image")}Image</button></div></div>
            <textarea name="body" class="pageEd__body" spellcheck="true">${esc(p.body)}</textarea></div>
          <div class="card" style="--i:2"><div class="card__head"><div><h2>Preview</h2></div></div><div class="prose pageEd__preview" id="pagePreview"></div></div>
        </div>
        <div class="formBar formBar--sticky"><button class="btn btn--accent" type="submit">${icon("i-check")}Save</button>
          ${!isNew && p.published ? `<a class="btn btn--ghost btn--sm" href="./page.html?p=${esc(p.slug)}" target="_blank" rel="noreferrer">${icon("i-eye")}View</a>` : ""}</div>
      </form>`;
    const form = $("#pageForm");
    const preview = () => { $("#pagePreview").innerHTML = CMS.markdown(form.elements.body.value) || `<p class="muted">Start writing…</p>`; };
    preview();
    form.elements.body.addEventListener("input", preview);
    form.onsubmit = async (e) => {
      e.preventDefault();
      const f = form.elements;
      const body = { title: f.title.value.trim(), slug: f.slug.value.trim(), description: f.description.value.trim(), body: f.body.value, published: f.published.checked, showInNav: f.showInNav.checked };
      try {
        const saved = await api(isNew ? "/admin/content/pages" : `/admin/content/pages/${id}`, { method: isNew ? "POST" : "PUT", body });
        toast("Saved");
        markChanged();
        if (isNew) location.hash = `#/pages/${saved.id}`;
        else { setHead(saved.title, `/${saved.slug}`); f.slug.value = saved.slug; }
      } catch (err) { toast(err.data?.message || "Couldn't save"); }
    };
  }

  // ====================================================================
  // Media library
  // ====================================================================
  async function viewMedia(view) {
    setHead("Media", "Images for projects, pages and your portrait");
    const { media } = await api("/admin/media");
    view.innerHTML = `
      <div class="card" style="--i:0">
        <div class="card__head"><div><h2>${media.length} image${media.length === 1 ? "" : "s"}</h2><p>JPG, PNG, WebP or GIF up to 5 MB. Big photos are resized before upload.</p></div>
          <div class="tools"><label class="btn btn--accent btn--sm">${icon("i-upload")}Upload<input type="file" accept="image/*" multiple hidden data-cms="upload" /></label></div></div>
        <div class="dropzone" id="dropzone">Drop images here</div>
        ${media.length ? `<div class="mediaGrid">${media.map((m) => `
          <figure class="mediaCard">
            <img src="${esc(m.url)}" alt="${esc(m.alt)}" loading="lazy" />
            <figcaption>
              <span title="${esc(m.fileName)}">${esc(m.fileName || "image")}</span>
              <small>${Math.max(1, Math.round(m.size / 1024))} KB · ${ago(m.createdAt)}</small>
              <span class="mediaCard__tools">
                <button type="button" class="iconBtn" data-copy="${esc(m.url)}" aria-label="Copy URL">${icon("i-copy")}</button>
                <button type="button" class="iconBtn" data-cms="alt" data-id="${m.id}" data-alt="${esc(m.alt)}" aria-label="Edit description">${icon("i-pen")}</button>
                <button type="button" class="iconBtn" data-cms="deleteMedia" data-id="${m.id}" aria-label="Delete">${icon("i-trash")}</button>
              </span>
            </figcaption>
          </figure>`).join("")}</div>` : `<div class="empty"><strong>No images yet</strong>Upload a screenshot for a project or a new portrait.</div>`}
      </div>`;
    const zone = $("#dropzone");
    const card = zone.closest(".card");
    card.ondragover = (e) => { e.preventDefault(); zone.classList.add("is-on"); };
    card.ondragleave = (e) => { if (!card.contains(e.relatedTarget)) zone.classList.remove("is-on"); };
    card.ondrop = (e) => { e.preventDefault(); zone.classList.remove("is-on"); uploadMany([...e.dataTransfer.files]); };
  }
  async function uploadMany(files) {
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (!images.length) return;
    toast(`Uploading ${images.length} image${images.length === 1 ? "" : "s"}…`);
    let ok = 0;
    for (const f of images) {
      try { await uploadImage(f); ok++; } catch (err) { toast(`${f.name}: ${err.data?.message || "upload failed"}`); }
    }
    if (ok) toast(`Uploaded ${ok} image${ok === 1 ? "" : "s"}`);
    if (S.route === "media") A.route();
  }

  // ====================================================================
  // Clients
  // ====================================================================
  async function viewClients(view) {
    setHead("Clients", "People who created an account");
    const q = S.clientQuery || "";
    const { clients } = await api(`/admin/clients${q ? `?q=${encodeURIComponent(q)}` : ""}`);
    view.innerHTML = `
      <div class="card" style="--i:0">
        <div class="card__head"><div><h2>${clients.length} client${clients.length === 1 ? "" : "s"}</h2><p>${clients.filter((c) => c.online).length} online now</p></div>
          <div class="tools"><label class="search">${icon("i-search")}<input type="search" placeholder="Search name, email, company" value="${esc(q)}" data-cms="clientSearch" /></label></div></div>
        ${clients.length ? `<div class="rows">${clients.map((c) => `
          <div class="row row--client" data-cms="client" data-id="${c.id}">
            ${Live.avatar({ name: c.displayName || c.email, avatarUrl: c.avatarUrl, online: c.online }, 40)}
            <div class="row__who"><strong>${esc(c.displayName || c.email)}${c.locked ? ` <span class="pill pill--cancelled">Blocked</span>` : ""}</strong><span>${esc(c.email)}${c.company ? ` · ${esc(c.company)}` : ""}</span></div>
            <div class="row__end"><span class="muted small">${c.online ? `<span class="dot dot--ok"></span>Online` : c.lastSeenAt ? `Seen ${ago(c.lastSeenAt)}` : `Joined ${ago(c.createdAt)}`}</span>
              ${c.bookings ? `<span class="pill">${c.bookings} call${c.bookings === 1 ? "" : "s"}</span>` : ""}${c.emailConfirmed ? "" : `<span class="pill pill--no_show">Unverified</span>`}</div>
          </div>`).join("")}</div>` : `<div class="empty"><strong>${q ? "No matches" : "No clients yet"}</strong>${q ? "" : "When people sign up on your website, they show up here."}</div>`}
      </div>`;
  }

  async function openClient(id) {
    const drawer = $("#drawer");
    const panel = $("#drawerPanel");
    drawer.hidden = false;
    panel.innerHTML = `<div class="skeleton"></div><div class="skeleton"></div>`;
    const d = await api(`/admin/clients/${id}`);
    const c = d.client;
    panel.innerHTML = `
      <div class="dr__top">${Live.avatar({ name: c.displayName || c.email, avatarUrl: c.avatarUrl, online: c.online }, 56)}
        <div><h2>${esc(c.displayName || c.email)}</h2><p><a href="mailto:${esc(c.email)}" style="color:var(--accent)">${esc(c.email)}</a>${c.company ? ` · ${esc(c.company)}` : ""}</p></div>
        <button type="button" class="iconBtn" data-action="closeDrawer" aria-label="Close">${icon("i-x")}</button></div>
      <div class="dr__pills">${c.online ? `<span class="pill pill--confirmed">Online</span>` : `<span class="pill">${c.lastSeenAt ? "Seen " + ago(c.lastSeenAt) : "Never online"}</span>`}
        <span class="pill">Joined ${ago(c.createdAt)}</span>${c.timeZone ? `<span class="pill">${esc(c.timeZone)}</span>` : ""}${c.emailConfirmed ? "" : `<span class="pill pill--no_show">Email not verified</span>`}${c.locked ? `<span class="pill pill--cancelled">Blocked</span>` : ""}</div>
      <div class="dr__actions">
        <button type="button" class="btn btn--accent btn--sm" data-cms="messageClient" data-id="${c.id}">${icon("i-chat")}Message</button>
        <button type="button" class="btn btn--line btn--sm" data-cms="lockClient" data-id="${c.id}" data-locked="${c.locked}">${c.locked ? "Unblock" : "Block"}</button>
        <button type="button" class="btn btn--ghost btn--sm" data-cms="deleteClient" data-id="${c.id}">${icon("i-trash")}Delete</button>
      </div>
      <div class="dr__section"><h3>Calls (${d.bookings.length})</h3>
        ${d.bookings.length ? `<div class="rows">${d.bookings.map((b) => `<a class="row" href="#/bookings/${b.id}"><div class="row__when"><strong>${A.fmtDay(b.start)}</strong><span>${A.fmtTime(b.start)}</span></div><div class="row__who"><strong>${esc(b.type.name)}</strong><span>${b.duration} min</span></div><div class="row__end"><span class="pill pill--${esc(b.status)}">${esc(b.status.replace("_", " "))}</span></div></a>`).join("")}</div>` : `<p class="muted">No calls booked yet.</p>`}</div>
      <div class="dr__section"><h3>Messages from the contact form (${d.messages.length})</h3>
        ${d.messages.length ? d.messages.map((m) => `<div class="msg__body" style="margin-bottom:8px"><small class="muted">${ago(m.created_at)}</small><br>${esc(m.body)}</div>`).join("") : `<p class="muted">None.</p>`}</div>`;
  }

  // ====================================================================
  // Live chat with clients
  // ====================================================================
  const L = { conversations: [], sel: "", messages: [], hasMore: false, typing: {}, client: null, state: "connecting" };

  function connectLive() {
    if (S.live || !window.signalR) return;
    S.live = Live.connect({
      state(st) {
        L.state = st;
        const el = $("#liveState");
        if (el) el.innerHTML = liveBanner();
        if (st === "connected" && S.route === "live") refreshLive();
      },
      message(m) {
        const conv = L.conversations.find((c) => c.id === m.conversationId);
        if (conv) {
          conv.lastMessage = m;
          conv.lastMessageAt = m.sentAt;
          if (!m.fromAdmin && !(S.route === "live" && L.sel === m.conversationId && !document.hidden)) conv.unread++;
        }
        if (S.route === "live" && L.sel === m.conversationId) {
          if (!L.messages.some((x) => x.id === m.id)) L.messages.push(m);
          L.typing[m.conversationId] = false;
          renderThread();
          if (!m.fromAdmin && !document.hidden) S.live.markRead(L.sel);
        }
        if (!m.fromAdmin) {
          liveUnread(+1);
          if (!(S.route === "live" && L.sel === m.conversationId)) {
            const name = conv?.client.name || "A client";
            toast(`💬 ${name}: ${m.body.slice(0, 60)}`);
            if (document.hidden && "Notification" in window && Notification.permission === "granted") {
              try { new Notification(name, { body: m.body.slice(0, 120), icon: "./assets/favicon-192.png" }); } catch {}
            }
          }
          if (!conv && S.route === "live") refreshLive();
        }
        if (S.route === "live") renderConvList();
      },
      typing(t) {
        if (t.fromAdmin) return;
        L.typing[t.conversationId] = true;
        renderTyping();
        clearTimeout(L.typingTimer);
        L.typingTimer = setTimeout(() => { L.typing[t.conversationId] = false; renderTyping(); }, 4000);
      },
      read(r) {
        if (r.byAdmin || r.conversationId !== L.sel) return;
        L.messages.forEach((m) => { if (m.fromAdmin && !m.readAt) m.readAt = r.readAt; });
        renderThread(false);
      },
      presence(p) {
        const conv = L.conversations.find((c) => c.client.id === p.userId);
        if (conv) { conv.client.online = p.online; if (p.lastSeenAt) conv.client.lastSeenAt = p.lastSeenAt; }
        if (L.client?.id === p.userId) { L.client.online = p.online; if (p.lastSeenAt) L.client.lastSeenAt = p.lastSeenAt; renderTyping(); }
        if (S.route === "live") renderConvList();
      }
    });
  }

  function liveUnread(delta) {
    const el = $("#bLive");
    const n = Math.max(0, (Number(el.textContent) || 0) + delta);
    el.textContent = n;
    el.hidden = !n;
  }
  function setLiveUnread(n) { const el = $("#bLive"); el.textContent = n; el.hidden = !n; }
  const liveBanner = () => L.state === "connected" ? "" : `<div class="lc-banner">${L.state === "reconnecting" ? "Reconnecting…" : L.state === "connecting" ? "Connecting…" : "Offline. Reconnecting…"}</div>`;

  async function refreshLive() {
    try {
      const d = await api("/admin/live/conversations");
      L.conversations = d.conversations;
      setLiveUnread(d.unread);
      renderConvList();
      if (L.sel) await loadThread(L.sel, true);
    } catch {}
  }

  async function viewLive(view) {
    setHead("Live chat", "Talk with clients in real time");
    connectLive();
    L.sel = S.param || "";
    const d = await api("/admin/live/conversations");
    L.conversations = d.conversations;
    setLiveUnread(d.unread);
    view.innerHTML = `
      <div id="liveState">${liveBanner()}</div>
      <div class="panes ${L.sel ? "has-detail" : ""}" id="livePanes">
        <div class="panes__list" id="convList"></div>
        <div class="panes__detail lcPane" id="thread">${L.sel ? "" : `<div class="empty"><strong>Pick a conversation</strong>Clients message you from their account page. Start one from Clients.</div>`}</div>
      </div>`;
    renderConvList();
    if (L.sel) await loadThread(L.sel);
    if ("Notification" in window && Notification.permission === "default") Notification.requestPermission().catch(() => {});
  }

  function renderConvList() {
    const list = $("#convList");
    if (!list) return;
    list.innerHTML = L.conversations.length ? L.conversations.map((c) => `
      <a class="panes__item convItem ${c.id === L.sel ? "is-on" : ""} ${c.unread ? "is-new" : ""}" href="#/live/${c.id}">
        ${Live.avatar(c.client, 40)}
        <span class="convItem__text"><strong>${esc(c.client.name)}<time>${c.lastMessage ? ago(c.lastMessage.sentAt) : ""}</time></strong>
        <p>${L.typing[c.id] ? `<em class="accent">typing…</em>` : c.lastMessage ? `${c.lastMessage.fromAdmin ? "You: " : ""}${esc(c.lastMessage.body.slice(0, 90))}` : `<em>No messages yet</em>`}</p></span>
        ${c.unread ? `<span class="badge badge--hot">${c.unread}</span>` : ""}
      </a>`).join("") : `<div class="empty"><strong>No conversations yet</strong></div>`;
  }

  async function loadThread(id, quiet = false) {
    const pane = $("#thread");
    if (!pane) return;
    if (!quiet) pane.innerHTML = `<div class="skeleton"></div>`;
    try {
      const d = await api(`/admin/live/conversations/${id}`);
      L.client = { ...d.client, email: d.email, company: d.company };
      L.messages = d.messages;
      L.hasMore = d.hasMore;
    } catch {
      pane.innerHTML = `<div class="empty"><strong>Conversation not found</strong></div>`;
      return;
    }
    const conv = L.conversations.find((c) => c.id === id);
    if (conv?.unread) { liveUnread(-conv.unread); conv.unread = 0; renderConvList(); }
    pane.innerHTML = `
      <section class="lc lc--admin">
        <header class="lc-head">
          <a class="iconBtn back-link" href="#/live" aria-label="Back">${icon("i-back")}</a>
          ${Live.avatar(L.client, 44)}
          <div><strong>${esc(L.client.name)}</strong><div id="threadStatus"></div></div>
          <button type="button" class="btn btn--ghost btn--sm lc-head__more" data-cms="client" data-id="${L.client.id}">${icon("i-user")}Profile</button>
        </header>
        <div class="lc-list" id="threadList"></div>
        <form class="lc-compose" id="liveCompose">
          <textarea name="body" rows="1" maxlength="4000" placeholder="Reply to ${esc(L.client.name.split(" ")[0])}…" aria-label="Message" required></textarea>
          <button class="btn btn--accent lc-send" type="submit" aria-label="Send">${icon("i-send")}</button>
        </form>
      </section>`;
    renderTyping();
    renderThread();
    $("#threadList").scrollTop = 1e9;
    S.live?.markRead(id);
    const box = $("#liveCompose textarea");
    if (!quiet) box.focus();
  }

  function renderTyping() {
    const el = $("#threadStatus");
    if (!el || !L.client) return;
    el.innerHTML = L.typing[L.sel]
      ? `<span class="lc-status is-typing">typing…</span>`
      : `<span class="lc-status${L.client.online ? " is-online" : ""}">${L.client.online ? "Online" : esc(Live.lastSeen(L.client.lastSeenAt))}</span>${L.client.email ? ` <span class="muted small">· ${esc(L.client.email)}</span>` : ""}`;
    renderConvList();
  }

  function renderThread(stick = true) {
    const list = $("#threadList");
    if (!list) return;
    const near = list.scrollHeight - list.scrollTop - list.clientHeight < 120;
    list.innerHTML = `${L.hasMore ? `<button type="button" class="linkBtn lc-more" data-cms="olderLive">Load earlier messages</button>` : ""}${L.messages.length
      ? Live.bubbles(L.messages, (m) => m.fromAdmin)
      : `<div class="lc-empty"><p class="muted">No messages yet. Say hello.</p></div>`}`;
    if (stick && near) list.scrollTop = list.scrollHeight;
  }

  async function sendLive(form) {
    const box = form.elements.body;
    const body = box.value.trim();
    if (!body) return;
    box.value = "";
    box.style.height = "auto";
    const temp = { id: "tmp" + Date.now(), body, fromAdmin: true, sentAt: new Date().toISOString(), pending: true, conversationId: L.sel };
    L.messages.push(temp);
    renderThread();
    $("#threadList").scrollTop = 1e9;
    try {
      const saved = S.live?.connected
        ? await S.live.send(body, L.sel)
        : await api(`/admin/live/conversations/${L.sel}/messages`, { method: "POST", body: { body } });
      const i = L.messages.indexOf(temp);
      if (L.messages.some((m) => m.id === saved.id)) L.messages.splice(i, 1); else L.messages[i] = saved;
    } catch {
      L.messages.splice(L.messages.indexOf(temp), 1);
      box.value = body;
      toast("Couldn't send");
    }
    renderThread();
  }

  // ====================================================================
  // Settings additions: import from the old backend
  // ====================================================================
  function importCard() {
    return `
      <div class="card mt" style="--i:4"><div class="card__head"><div><h2>Import from the old backend</h2>
        <p>One-time move from the Cloudflare Worker. Export each table with <code>wrangler d1 execute … --json</code> (see DEPLOY.md) and choose the files. Safe to run twice.</p></div></div>
        <label class="btn btn--line btn--sm">${icon("i-upload")}Choose JSON files<input type="file" accept=".json,application/json" multiple hidden data-cms="import" /></label>
        <p class="muted small" id="importResult" style="margin-top:10px"></p></div>`;
  }
  async function runImport(files) {
    const payload = { bookings: [], blocks: [], messages: [], chatMessages: [], events: [], settings: [] };
    const keyFor = { bookings: "bookings", blocks: "blocks", messages: "messages", chat_messages: "chatMessages", events: "events", settings: "settings" };
    for (const f of files) {
      const name = f.name.replace(/\.json$/i, "").toLowerCase();
      const key = keyFor[name];
      if (!key) { toast(`Skipped ${f.name}: name it after its table, e.g. bookings.json`); continue; }
      try {
        const data = JSON.parse(await f.text());
        // wrangler prints [{ results: [...] }]
        const rows = Array.isArray(data) ? (data[0]?.results || data) : data.results || [];
        payload[key].push(...rows);
      } catch { toast(`Couldn't read ${f.name}`); }
    }
    try {
      const r = await api("/admin/import", { method: "POST", body: payload });
      const parts = Object.entries(r.imported).map(([k, n]) => `${n} ${k}`);
      $("#importResult").textContent = parts.length ? `Imported ${parts.join(", ")}.` : "Nothing new to import.";
      toast("Import finished");
    } catch (err) { toast(err.data?.message || "Import failed"); }
  }

  // ====================================================================
  // Wiring
  // ====================================================================
  Object.assign(A.ROUTES, {
    content: { title: "Content", render: viewContent },
    pages: { title: "Pages", render: viewPages },
    media: { title: "Media", render: viewMedia },
    clients: { title: "Clients", render: viewClients },
    live: { title: "Live chat", render: viewLive }
  });

  // Add the import card and the new integrations to Settings
  const baseSettings = A.ROUTES.settings.render;
  A.ROUTES.settings.render = async (view) => {
    await baseSettings(view);
    const ints = S.cache.settings?.integrations || {};
    const grid = $(".card .grid", view);
    if (grid) {
      grid.insertAdjacentHTML("beforeend", `
        <div class="int"><span class="int__ico">${icon("i-rocket")}</span><div><h3>Publish button (GitHub)</h3><p>${ints.publish ? "Publish rebuilds the website with your latest content." : "Not connected: content changes reach the website on its next deploy."}</p></div>
          ${ints.publish ? `<span class="pill pill--confirmed">Connected</span>` : `<a class="btn btn--line btn--sm" href="https://github.com/AhmedEldegla/portfolio-api/blob/main/DEPLOY.md" target="_blank" rel="noreferrer">How to connect</a>`}</div>
        <div class="int"><span class="int__ico">${icon("i-image")}</span><div><h3>Image storage</h3><p>${ints.storage === "r2" ? "Images are stored on Cloudflare R2." : "Images are stored on the API server. Cloudflare R2 is optional."}</p></div>
          <span class="pill ${ints.storage === "r2" ? "pill--confirmed" : ""}">${ints.storage === "r2" ? "R2" : "Server"}</span></div>`);
    }
    view.insertAdjacentHTML("beforeend", importCard());
  };

  A.onStart.push(() => {
    loadPublish();
    connectLive();
    api("/admin/live/conversations").then((d) => setLiveUnread(d.unread)).catch(() => {});
  });

  document.addEventListener("click", async (e) => {
    if (e.target.closest("[data-action=publish]")) return publish();
    const el = e.target.closest("[data-cms]");
    if (!el) return;
    const act = el.dataset.cms;
    const col = el.dataset.col;
    const id = el.dataset.id;

    if (act === "add") return openEditor(col, null);
    if (act === "edit") return openEditor(col, C.items[col].find((x) => x.id === id));
    if (act === "move") {
      const ids = C.items[col].map((x) => x.id);
      const i = ids.indexOf(id);
      const j = i + Number(el.dataset.dir);
      if (j < 0 || j >= ids.length) return;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      await saveOrder(col, ids);
      return A.route();
    }
    if (act === "delete") {
      const def = COLLECTIONS[col];
      const item = C.items[col].find((x) => x.id === id);
      const ok = await dialog(`<h2>Delete “${esc(def.title(item))}”?</h2><p>It disappears from the website after you publish. This can't be undone.</p><div class="dlg__actions"><button class="btn btn--ghost btn--sm" value="cancel" formnovalidate>Keep</button><button class="btn btn--danger btn--sm" value="ok">Delete</button></div>`);
      if (!ok) return;
      await api(`${def.endpoint}/${id}`, { method: "DELETE" });
      toast("Deleted");
      markChanged();
      return A.route();
    }
    if (act === "deletePage") {
      const ok = await dialog(`<h2>Delete this page?</h2><p>Its link stops working. This can't be undone.</p><div class="dlg__actions"><button class="btn btn--ghost btn--sm" value="cancel" formnovalidate>Keep</button><button class="btn btn--danger btn--sm" value="ok">Delete</button></div>`);
      if (!ok) return;
      await api(`/admin/content/pages/${id}`, { method: "DELETE" });
      markChanged();
      return A.route();
    }
    if (act === "addPair") {
      const name = el.dataset.field;
      const f = [...SITE_FIELDS, ...Object.values(COLLECTIONS).flatMap((c) => c.fields)].find((x) => x.name === name && x.type === "pairs");
      el.closest("[data-pairs]").querySelector(".pairs").insertAdjacentHTML("beforeend", pairRow(f));
      return;
    }
    if (act === "removePair") return el.closest(".pair").remove();
    if (act === "pickImage") {
      const url = await pickImage();
      if (url == null) return;
      const input = document.getElementById(el.dataset.target);
      input.value = url;
      input.closest(".imgField").querySelector(".imgField__preview").innerHTML = `<img src="${esc(url)}" alt="" />`;
      return;
    }
    if (act === "insertImage") {
      const url = await pickImage();
      if (url == null) return;
      const ta = $(".pageEd__body");
      const snippet = `\n![](${url})\n`;
      ta.setRangeText(snippet, ta.selectionStart, ta.selectionEnd, "end");
      ta.dispatchEvent(new Event("input"));
      ta.focus();
      return;
    }
    if (act === "alt") {
      const r = await dialog(`<h2>Describe this image</h2><p>Helps screen readers and search engines.</p><label class="field"><input name="alt" maxlength="300" value="${esc(el.dataset.alt)}" /></label><div class="dlg__actions"><button class="btn btn--ghost btn--sm" value="cancel" formnovalidate>Cancel</button><button class="btn btn--accent btn--sm" value="ok">Save</button></div>`);
      if (!r) return;
      await api(`/admin/media/${id}`, { method: "PATCH", body: { alt: r.alt } });
      toast("Saved");
      return A.route();
    }
    if (act === "deleteMedia") {
      const ok = await dialog(`<h2>Delete this image?</h2><p>Anything still using it will show a broken image.</p><div class="dlg__actions"><button class="btn btn--ghost btn--sm" value="cancel" formnovalidate>Keep</button><button class="btn btn--danger btn--sm" value="ok">Delete</button></div>`);
      if (!ok) return;
      await api(`/admin/media/${id}`, { method: "DELETE" });
      return A.route();
    }
    if (act === "client") return openClient(id);
    if (act === "messageClient") {
      const { conversationId } = await api(`/admin/live/start/${id}`);
      $("#drawer").hidden = true;
      location.hash = `#/live/${conversationId}`;
      return;
    }
    if (act === "lockClient") {
      const locked = el.dataset.locked === "true";
      const ok = await dialog(`<h2>${locked ? "Unblock" : "Block"} this client?</h2><p>${locked ? "They can sign in again." : "They are signed out everywhere and can't sign in."}</p><div class="dlg__actions"><button class="btn btn--ghost btn--sm" value="cancel" formnovalidate>Cancel</button><button class="btn btn--accent btn--sm" value="ok">${locked ? "Unblock" : "Block"}</button></div>`);
      if (!ok) return;
      await api(`/admin/clients/${id}/lock`, { method: "POST", body: { locked: !locked } });
      openClient(id);
      if (S.route === "clients") A.route();
      return;
    }
    if (act === "deleteClient") {
      const ok = await dialog(`<h2>Delete this account?</h2><p>Their profile and chat are deleted. Their calls stay on your calendar. This can't be undone.</p><div class="dlg__actions"><button class="btn btn--ghost btn--sm" value="cancel" formnovalidate>Keep</button><button class="btn btn--danger btn--sm" value="ok">Delete</button></div>`);
      if (!ok) return;
      await api(`/admin/clients/${id}`, { method: "DELETE" });
      $("#drawer").hidden = true;
      toast("Account deleted");
      if (S.route === "clients") A.route();
      return;
    }
    if (act === "olderLive") {
      const first = L.messages.find((m) => typeof m.id === "number");
      if (!first) return;
      const list = $("#threadList");
      const before = list.scrollHeight;
      const d = await api(`/admin/live/conversations/${L.sel}/messages?before=${first.id}`);
      L.messages = d.messages.concat(L.messages);
      L.hasMore = d.hasMore;
      renderThread(false);
      list.scrollTop = list.scrollHeight - before;
    }
  });

  document.addEventListener("change", (e) => {
    const act = e.target.dataset?.cms;
    if (act === "upload" && e.target.files.length) uploadMany([...e.target.files]);
    if (act === "import" && e.target.files.length) runImport([...e.target.files]);
  });

  let searchTimer = 0;
  document.addEventListener("input", (e) => {
    if (e.target.dataset?.cms === "clientSearch") {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { S.clientQuery = e.target.value.trim(); A.route().then(() => { const i = $("[data-cms=clientSearch]"); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }); }, 350);
    }
    const box = e.target.closest?.("#liveCompose textarea");
    if (box) {
      box.style.height = "auto";
      box.style.height = Math.min(box.scrollHeight, 160) + "px";
      S.live?.typing(L.sel);
    }
  });

  document.addEventListener("submit", (e) => {
    if (e.target.id !== "liveCompose") return;
    e.preventDefault();
    sendLive(e.target);
  });
  document.addEventListener("keydown", (e) => {
    const box = e.target.closest?.("#liveCompose textarea");
    if (box && e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); box.form.requestSubmit(); }
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && S.route === "live" && L.sel) S.live?.markRead(L.sel);
  });
  // Leaving a page closes any open drawer (a booking link keeps its own)
  window.addEventListener("hashchange", () => {
    if (!/^#\/bookings\/./.test(location.hash)) $("#drawer").hidden = true;
  });
})();
