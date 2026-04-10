# Mode: scan — Portal Scanner (Offer Discovery)

Scans configured job portals, filters by title relevance, and adds new offers to the pipeline for later evaluation.

## Recommended execution

Run as a subagent to avoid consuming main context:

```
Agent(
    subagent_type="general-purpose",
    prompt="[content of this file + specific data]",
    run_in_background=True
)
```

## Configuration

Read `portals.yml` which contains:
- `search_queries`: List of WebSearch queries with `site:` filters per portal (broad discovery)
- `tracked_companies`: Specific companies with `careers_url` for direct navigation
- `title_filter`: Positive/negative/seniority_boost keywords for title filtering

## Discovery strategy (3 levels)

### Level 1 — Direct browser scrape (PRIMARY)

**For each company in `tracked_companies`:** Navigate to its `careers_url` with a real browser, read ALL visible job listings, and extract the title + URL for each. This is the most reliable method because:
- Sees the page in real time (no cached Google results)
- Works with SPAs (Ashby, Lever, Workday, new Greenhouse)
- Detects new offers instantly
- Does not depend on Google indexing

**Two ways to do this:**

**A. `scan-browser.mjs` (PREFERRED — always available, works in any context including subagents and batch mode):**

```bash
node scan-browser.mjs scrape <careers_url> --format=tsv
# With system Chrome (faster startup, reuses user's Chrome install):
node scan-browser.mjs scrape <careers_url> --browser=chrome --format=tsv
# Batch multiple URLs in parallel (3 concurrent browser contexts):
node scan-browser.mjs scrape-batch urls.txt --concurrency=5 --browser=chrome --out=results.json
# Logged-in scrape (LinkedIn, Workday behind SSO, etc) — uses user's Chrome profile:
node scan-browser.mjs scrape <url> --browser=chrome-profile --headed
```

`scan-browser.mjs` auto-detects the portal (Ashby, Greenhouse, Lever, Workday, SmartRecruiters, BambooHR, Rippling, Netflix, LinkedIn, Indeed) and uses portal-specific extractors. Output is JSON (default) or TSV (`url\ttitle\tplatform\tlocation\tsource_url`). Status values: `ok`, `empty`, `expired` (Greenhouse `?error=true`), `error`.

Available `--browser` values:
- `bundled` (default) — Playwright's bundled Chromium. Works in any sandbox/CI.
- `chrome` — the user's system Google Chrome via channel. Fewer downloads, real user agent.
- `edge` / `msedge` — system Microsoft Edge.
- `chrome-profile` — system Chrome launched with the user's real profile directory (cookies + logins persist). **User must close Chrome first** — Chrome locks its profile. Use for LinkedIn, Workday-behind-SSO, private portals.
- `chrome-cdp` — connect to an already-running Chrome started with `--remote-debugging-port=9222`. Use when the user has Chrome open and you want to piggyback on their session without closing it.

**B. Playwright MCP tools (`browser_navigate` + `browser_snapshot`) — only if available in the current tool context:**

Some sessions have a Playwright MCP server enabled, exposing `browser_navigate` and `browser_snapshot` directly. If these tools are present, they work great for ad-hoc scrapes. If not (batch workers, subagents, headless pipes), fall back to `scan-browser.mjs`.

**Every company MUST have `careers_url` in portals.yml.** If it doesn't, find it once, save it, and use it in future scans.

### Level 2 — Greenhouse API (SUPPLEMENTARY)

For companies on Greenhouse, the JSON API (`boards-api.greenhouse.io/v1/boards/{slug}/jobs`) returns clean structured data. Use as a fast complement to Level 1 — faster than Playwright but only works with Greenhouse.

### Level 3 — WebSearch queries (BROAD DISCOVERY)

The `search_queries` with `site:` filters cover portals cross-sectionally (all Ashby, all Greenhouse, etc.). Useful for discovering NEW companies not yet in `tracked_companies`, but results may be stale.

**Execution priority:**
1. Level 1: Playwright → all `tracked_companies` with `careers_url`
2. Level 2: API → all `tracked_companies` with `api:`
3. Level 3: WebSearch → all `search_queries` with `enabled: true`

Levels are additive — all run, results are merged and deduplicated.

## Workflow

1. **Read configuration**: `portals.yml`
2. **Read dedup history**: `data/seen-urls.txt` (one URL per line, no header) → already-seen URLs. This is the primary dedup source as it is ~5x cheaper in tokens than scan-history.tsv.
   - Fallback: if `seen-urls.txt` does not exist, read `data/scan-history.tsv` and extract only the `url` column.
3. **Read dedup sources**: `data/applications.md` + `data/pipeline.md`

4. **Level 1 — Browser scrape** (parallel in batches of 3-5):
   For each company in `tracked_companies` with `enabled: true` and a defined `careers_url`:

   **Preferred: `scan-browser.mjs scrape-batch`** — Write all the careers_urls to a temp file and run one command:
   ```bash
   node scan-browser.mjs scrape-batch /tmp/level1-urls.txt --concurrency=5 --browser=chrome --format=json --out=/tmp/level1-results.json
   ```
   This parallelizes cleanly (no 2+ Playwright MCP agents rule applies because it's one node process with its own browser contexts). Then parse `/tmp/level1-results.json` — each entry has `{url, final_url, platform, status, job_count, jobs: [{title, url, location, ...}]}`.

   **Fallback (if Playwright MCP tools are available): `browser_navigate` + `browser_snapshot`** — Run at most 3-5 navigations in parallel per the "NEVER 2+ agents with Playwright in parallel" rule.

   Steps for each company:
   a. Navigate to `careers_url`
   b. Read all job listings from the DOM
   c. If the page has filters/departments, navigate the relevant sections
   d. For each job listing extract: `{title, url, company}`
   e. If the page paginates, navigate additional pages
   f. Accumulate in candidate list
   g. If `careers_url` fails (404, redirect, `status: error`/`empty`), try `scan_query` as fallback and note for URL update

5. **Level 2 — Greenhouse APIs** (parallel):
   For each company in `tracked_companies` with a defined `api:` and `enabled: true`:
   a. WebFetch the API URL → JSON with job list
   b. For each job extract: `{title, url, company}`
   c. Accumulate in candidate list (dedup with Level 1)

6. **Level 3 — WebSearch queries** (parallel if possible):
   For each query in `search_queries` with `enabled: true`:
   a. Run WebSearch with the defined `query`
   b. From each result extract: `{title, url, company}`
      - **title**: from the result title (before " @ " or " | ")
      - **url**: result URL
      - **company**: after " @ " in the title, or extracted from domain/path
   c. Accumulate in candidate list (dedup with Levels 1+2)

6. **Filter by title** using `title_filter` from `portals.yml`:
   - At least 1 `positive` keyword must appear in the title (case-insensitive)
   - 0 `negative` keywords must appear
   - `seniority_boost` keywords give priority but are not required

7. **Deduplicate** against 3 sources:
   - `seen-urls.txt` → exact URL already seen (primary; fallback: `scan-history.tsv` `url` column)
   - `applications.md` → normalized company + role already evaluated
   - `pipeline.md` → exact URL already in pending or processed

7.5. **Verify liveness of WebSearch results (Level 3)** — BEFORE adding to pipeline:

   WebSearch results may be outdated (Google caches results for weeks or months). To avoid evaluating expired offers, verify each new URL from Level 3. Levels 1 and 2 are inherently real-time and do not require this verification.

   **Preferred: batch verification in one process:**
   ```bash
   node scan-browser.mjs scrape-batch /tmp/level3-urls.txt --concurrency=3 --browser=chrome --out=/tmp/level3-liveness.json
   ```
   Then for each entry in the JSON, classify by `status`:
   - `status: "ok"` and `job_count > 0` → Active, keep
   - `status: "expired"` (Greenhouse `?error=true`) → discard
   - `status: "empty"` → likely expired or closed, discard
   - `status: "error"` → discard, log

   **Fallback (if Playwright MCP tools are available):** For each new URL (sequential — NEVER MCP Playwright in parallel):
   a. `browser_navigate` to the URL
   b. `browser_snapshot` to read the content
   c. Classify:
      - **Active**: job title visible + role description + Apply/Submit button
      - **Expired** (any of these signals):
        - Final URL contains `?error=true` (Greenhouse redirects this way when an offer is closed)
        - Page contains: "job no longer available" / "no longer open" / "position has been filled" / "this job has expired" / "page not found"
        - Only navbar and footer visible, no JD content (content < ~300 chars)
   d. If expired: record in `scan-history.tsv` with status `skipped_expired` and discard
   e. If active: continue to step 8

   **Do not interrupt the entire scan if one URL fails.** If `browser_navigate` errors (timeout, 403, etc.), mark as `skipped_expired` and continue with the next.

8. **For each new verified offer that passes filters**:
   a. Add to `pipeline.md` Pending section: `- [ ] {url} | {company} | {title}`
   b. Append URL to `data/seen-urls.txt` (one URL per line)
   c. Record in `scan-history.tsv`: `{url}\t{date}\t{query_name}\t{title}\t{company}\tadded`

9. **Offers filtered by title**: record in `scan-history.tsv` with status `skipped_title`
10. **Duplicate offers**: record with status `skipped_dup`
11. **Expired offers (Level 3)**: record with status `skipped_expired`

## Title and company extraction from WebSearch results

WebSearch results come in format: `"Job Title @ Company"` or `"Job Title | Company"` or `"Job Title — Company"`.

Extraction patterns by portal:
- **Ashby**: `"Senior AI PM (Remote) @ EverAI"` → title: `Senior AI PM`, company: `EverAI`
- **Greenhouse**: `"AI Engineer at Anthropic"` → title: `AI Engineer`, company: `Anthropic`
- **Lever**: `"Product Manager - AI @ Temporal"` → title: `Product Manager - AI`, company: `Temporal`

Generic regex: `(.+?)(?:\s*[@|—–-]\s*|\s+at\s+)(.+?)$`

## Private URLs

If a URL is not publicly accessible:
1. Save the JD to `jds/{company}-{role-slug}.md`
2. Add to pipeline.md as: `- [ ] local:jds/{company}-{role-slug}.md | {company} | {title}`

## Scan History

`data/scan-history.tsv` tracks ALL seen URLs:

```
url	first_seen	portal	title	company	status
https://...	2026-02-10	Ashby — AI PM	PM AI	Acme	added
https://...	2026-02-10	Greenhouse — SA	Junior Dev	BigCo	skipped_title
https://...	2026-02-10	Ashby — AI PM	SA AI	OldCo	skipped_dup
https://...	2026-02-10	WebSearch — AI PM	PM AI	ClosedCo	skipped_expired
```

## Output summary

```
Portal Scan — {YYYY-MM-DD}
━━━━━━━━━━━━━━━━━━━━━━━━━━
Queries run: N
Offers found: N total
Filtered by title: N relevant
Duplicates: N (already evaluated or in pipeline)
Expired discarded: N (dead links, Level 3)
New added to pipeline.md: N

  + {company} | {title} | {query_name}
  ...

→ Run /career-ops pipeline to evaluate new offers.
```

## careers_url management

Every company in `tracked_companies` must have `careers_url` — the direct URL to its job listings page. This avoids looking it up every time.

**Known patterns by platform:**
- **Ashby:** `https://jobs.ashbyhq.com/{slug}`
- **Greenhouse:** `https://job-boards.greenhouse.io/{slug}` or `https://job-boards.eu.greenhouse.io/{slug}`
- **Lever:** `https://jobs.lever.co/{slug}`
- **Custom:** The company's own URL (e.g., `https://openai.com/careers`)

**If `careers_url` doesn't exist** for a company:
1. Try the pattern for its known platform
2. If that fails, do a quick WebSearch: `"{company}" careers jobs`
3. Navigate with Playwright to confirm it works
4. **Save the found URL in portals.yml** for future scans

**If `careers_url` returns 404 or redirect:**
1. Note it in the output summary
2. Try scan_query as fallback
3. Flag for manual update

## portals.yml maintenance

- **ALWAYS save `careers_url`** when adding a new company
- Add new queries as new portals or interesting roles are discovered
- Disable noisy queries with `enabled: false`
- Adjust filter keywords as target roles evolve
- Add companies to `tracked_companies` when you want to follow them closely
- Periodically verify `careers_url` — companies change ATS platforms
