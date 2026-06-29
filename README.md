# Yohan Kwon — personal site

A tab-based single-page site (plain HTML/CSS/JS, **no framework**) hosted on **GitHub Pages**.
Tabs: **MCAT** (live-synced from Notion), **Volunteer**, **School**, **Extracurriculars**.

---

## How the "live Notion data" actually works

GitHub Pages serves **static files only** — and the Notion API can't be called from a
browser (it needs a secret token and sends no CORS headers). So the data is synced
**at build time** instead of at page-load:

```
Notion  ──(GitHub Action, on a schedule)──►  scripts/fetch-notion.mjs
                                                     │  parses + cleans
                                                     ▼
                                              data/mcat.json  ──commit──►  GitHub Pages redeploys
                                                     ▲
                          the site just  fetch('data/mcat.json')  — no secret, no CORS
```

- A scheduled **GitHub Action** (`.github/workflows/sync-mcat.yml`) runs ~4×/day (and on demand).
- It runs [`scripts/fetch-notion.mjs`](scripts/fetch-notion.mjs), which reads your MCAT Notion
  pages with the official API and writes [`data/mcat.json`](data/mcat.json).
- The browser only ever reads that committed JSON. Your Notion token stays server-side.

So "live" means **refreshed automatically several times a day** (not real-time). Solve
questions / edit your Notion page → the next sync picks it up → the site updates.

---

## One-time setup (do this once)

### 1. Push to GitHub
```bash
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

### 2. Create a Notion integration + share the page
1. Go to **notion.so/my-integrations** → **New integration** (internal). Copy the
   **Internal Integration Secret** (starts with `ntn_` or `secret_`).
2. Open your **MCAT** Notion page → top-right **•••** → **Connections** → add your
   integration. (This grants it read access to that page **and its child day-pages**.)

### 3. Add the token as a repo secret
Repo → **Settings → Secrets and variables → Actions → New repository secret**
- **Name:** `NOTION_TOKEN`
- **Value:** the integration secret from step 2

### 4. Turn on GitHub Pages
Repo → **Settings → Pages** → **Source: Deploy from a branch** → **Branch: `main` / `(root)`** → Save.
Your site will be at `https://<you>.github.io/<repo>/`.

### 5. Run the first sync
Repo → **Actions → "Sync MCAT data" → Run workflow**. It commits a fresh
`data/mcat.json`; Pages redeploys. After this it runs automatically on the schedule.

---

## Editing things by hand

| What | File | Notes |
|------|------|-------|
| Exam date, target, weak-topic priority, **must-redo IDs**, weekly plan, Anki target, CARS note | [`data/mcat-config.json`](data/mcat-config.json) | Never overwritten by the sync — edit freely |
| Volunteer shifts / hours | [`data/volunteer.json`](data/volunteer.json) | Seeded with a template — replace with your real shifts |
| School profile | [`js/school.js`](js/school.js) | Edit the `CONTENT` object |
| Extracurriculars | [`js/extracurriculars.js`](js/extracurriculars.js) | Edit the `ITEMS` array |
| MCAT study log (scores, questions, Anki) | **Your Notion page** | Synced automatically |

Change the schedule in [`.github/workflows/sync-mcat.yml`](.github/workflows/sync-mcat.yml) (the `cron` line).

---

## How the Notion log is read

Each child day-page (titled `June 27`, `June 28 - Break`, …) is parsed for:
- `# ` **section headers** → `BIO/BIOCHEM`, `General/Organic Chemistry`, `CARS`, `UWORLD PHYSICS`.
  Score is read from the header: a `%` **with** a `+`/`-` sign is a *margin* vs the Qbank average;
  a `%` **without** a sign is the *absolute score*. (`(+12%) - 71%` → margin +12, score 71.)
- **numbered questions** → `id - Topic (note) [uworld avg %]`. Text color: **red = wrong**,
  **blue = correct**, none = unmarked.
- An **Anki** line anywhere like `Anki: Studied 1387 cards in 127 minutes`.

[`scripts/normalize.mjs`](scripts/normalize.mjs) then canonicalizes topic spellings, flags
mistyped question IDs (without changing them), and recovers scores written without a sign.

---

## Local preview
```bash
cd "FOR THE FUTURE"
python3 -m http.server 8000
# open http://localhost:8000
```
To regenerate `data/mcat.json` locally:
```bash
cd scripts && npm install && NOTION_TOKEN=ntn_xxx node fetch-notion.mjs
```

---

## Project layout
```
index.html              # SPA shell + tab nav
css/styles.css          # all styles (light/dark, responsive)
js/charts.js            # tiny SVG charts (no deps)
js/data.js              # JSON loading + date helpers
js/mcat.js              # MCAT dashboard (KPIs, charts, redo, plan, Anki)
js/volunteer.js js/school.js js/extracurriculars.js
js/app.js               # tab routing + theme
data/mcat.json          # ← written by the sync (Notion → here)
data/mcat-config.json   # curated planning data (hand-edited)
data/volunteer.json     # volunteer shifts
scripts/fetch-notion.mjs# Notion API → data/mcat.json (runs in the Action)
scripts/normalize.mjs   # shared cleaning logic
.github/workflows/sync-mcat.yml
```
