// page.html?p=slug: extra pages written in the dashboard (Markdown), rendered in the browser.
(() => {
  const root = document.getElementById("pageApp");
  const slug = new URLSearchParams(location.search).get("p") || "";
  const C = window.AECMS;
  document.getElementById("year").textContent = new Date().getFullYear();
  if (!root || !C) return;

  const notFound = () => {
    root.innerHTML = `<div class="acc-empty"><h1 class="acc-h">Page not found</h1><p class="muted">It may have been moved or unpublished.</p><a class="btn btn--accent" href="./">Go to the home page</a></div>`;
    document.title = "Page not found · Ahmed Eldegla";
  };
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return notFound();

  fetch(`${window.AE_API}/pages/${slug}`)
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((p) => {
      document.title = `${p.title} · Ahmed Eldegla`;
      const meta = document.createElement("meta");
      meta.name = "description";
      meta.content = p.description || p.title;
      document.head.appendChild(meta);
      root.innerHTML = `
        <article class="cmsPage__article">
          <header class="cmsPage__head">
            <h1 class="cmsPage__title">${C.esc(p.title)}</h1>
            ${p.description ? `<p class="cmsPage__lead muted">${C.esc(p.description)}</p>` : ""}
          </header>
          <div class="prose">${C.markdown(p.body)}</div>
          <p class="cmsPage__updated mono muted">Updated ${new Date(p.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>
        </article>`;
    })
    .catch((status) => {
      if (status === 404) return notFound();
      root.innerHTML = `<div class="acc-empty"><p>Couldn't load this page. Please try again in a moment.</p><button class="btn btn--line" type="button" onclick="location.reload()">Try again</button></div>`;
    });
})();
