// Bakes the latest CMS content into index.html and writes content.json.
// Run by .github/workflows/pages.yml on every publish; also works locally:
//   API_URL=http://localhost:5073 node scripts/build-content.mjs
// If the API can't be reached, the files are left as they are and the site still deploys.
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const cms = require("../cms.js");
const api = (process.env.API_URL || "").replace(/\/+$/, "");

if (!api) {
  console.log("API_URL is not set; keeping the current content.");
  process.exit(0);
}

let content;
for (let attempt = 1; attempt <= 4 && !content; attempt++) {
  try {
    // The free host may need a few seconds to wake up
    const res = await fetch(`${api}/content`, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    content = await res.json();
  } catch (err) {
    console.log(`Attempt ${attempt}: couldn't load ${api}/content (${err.message})`);
    if (attempt < 4) await new Promise((r) => setTimeout(r, attempt * 5000));
  }
}
if (!content?.site) {
  console.log("Keeping the current content.");
  process.exit(0);
}

const html = await readFile("index.html", "utf8");
const baked = cms.bake(html, content);
await writeFile("index.html", baked);
await writeFile("content.json", JSON.stringify(content, null, 2) + "\n");
console.log(`Baked ${content.projects.length} projects, ${content.skills.length} skill groups, ${content.experience.length} roles, ${content.services.length} services, ${content.pages.length} pages.`);
