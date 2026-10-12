# ahmedeldegla.com

The website and dashboard. The backend lives in [portfolio-api](https://github.com/AhmedEldegla/portfolio-api) (ASP.NET Core + SQL Server).

| Page | What it is |
| --- | --- |
| `index.html` | The portfolio. Its content (text, projects, skills, experience, services) comes from the CMS and is baked in when the site is published. |
| `account.html` | Client accounts: sign up, bookings, live chat with Ahmed, profile, security. |
| `admin.html` | The dashboard: content, pages, media, clients, live chat, bookings, calendar, inbox, analytics, settings. |
| `page.html?p=…` | Extra pages written in Markdown in the dashboard. |
| `manage.html` | The private link clients get by email to reschedule or cancel a call. |

## How content gets to the site

1. You edit content in **Dashboard → Content**. It's saved in the API's database.
2. The API asks GitHub to rebuild the site (a few minutes after your last edit, or right away with **Publish**).
3. `.github/workflows/pages.yml` runs `scripts/build-content.mjs`, which fetches `API_URL/content`, renders it with `cms.js` into the `<!--cms:…-->` regions of `index.html`, and deploys to GitHub Pages.

If the API can't be reached during a build, the last published content stays.

## Setup

- `config.js`: the API address.
- **Settings → Pages → Source: GitHub Actions**.
- **Settings → Secrets and variables → Actions → Variables**: `API_URL`.

## Run locally

Start the API (`dotnet run` in `portfolio-api/src/Portfolio.Api`), then serve this folder on port 5500:

```bash
python3 -m http.server 5500
```

Open http://localhost:5500. The dashboard is at http://localhost:5500/admin.html (`admin@localhost.dev` / `admin12345` in development).
