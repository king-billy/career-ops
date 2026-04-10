# Mode: auto-pipeline — Full Automatic Pipeline

When the user pastes a JD (text or URL) without an explicit sub-command, run the FULL pipeline in sequence:

## Step 0 — Extract JD

If the input is a **URL** (not pasted JD text), use this strategy to extract the content:

**Priority order:**

1. **Playwright (preferred):** Most job portals (Lever, Ashby, Greenhouse, Workday) are SPAs. Use `browser_navigate` + `browser_snapshot` to render and read the JD.
2. **WebFetch (fallback):** For static pages (ZipRecruiter, WeLoveProduct, company career pages).
3. **WebSearch (last resort):** Search role title + company on secondary portals that index JDs in static HTML.

**If no method works:** Ask the candidate to paste the JD manually or share a screenshot.

**If input is JD text** (not a URL): use directly, no fetch needed.

## Step 1 — Evaluation A-F
Run exactly like `oferta` mode (read `modes/oferta.md` for all blocks A-F).

## Step 2 — Save Report .md
Save the full evaluation to `reports/{###}-{company-slug}-{YYYY-MM-DD}.md` (see format in `modes/oferta.md`).

## Step 3 — Generate PDF
Run the full `pdf` pipeline (read `modes/pdf.md`).

## Step 3b — Offer Cover Letter (only if score >= 4.0)

After the CV PDF is written, if the final score is >= 4.0 (i.e. the user might actually apply), ask once:

> "Generate a matching cover letter for {Company}? (y/n)"

If **yes** → run the full `cover` pipeline (read `modes/cover.md`). The JD is already in context from Step 0 — do NOT re-fetch. Pass the current evaluation report path so the `cover` mode can pull from Section D (Company Research) and Section E (Personalization) instead of re-researching.

If **no** → skip and continue to Step 4.

If the score is **< 4.0**, do NOT offer the cover letter. Applying to a low-fit role is already discouraged by the ethics rule in `CLAUDE.md` — generating polished artifacts for it would defeat the purpose.

## Step 4 — Draft Application Answers (only if score >= 4.5)

If the final score is >= 4.5, generate draft answers for the application form:

1. **Extract form questions**: Use Playwright to navigate to the form and take a snapshot. If not extractable, use generic questions.
2. **Generate answers** following the tone below.
3. **Save to the report** as section `## G) Draft Application Answers`.

### Generic questions (use if form questions can't be extracted)

- Why are you interested in this role?
- Why do you want to work at [Company]?
- Tell us about a relevant project or achievement
- What makes you a good fit for this position?
- How did you hear about this role?

### Tone for Form Answers

**Position: "I'm choosing you."** The candidate has options and is choosing this company for concrete reasons.

**Tone rules:**
- **Confident without arrogance**: "I've spent the past year building production AI agent systems — your role is where I want to apply that experience next"
- **Selective without being smug**: "I've been intentional about finding a team where I can contribute meaningfully from day one"
- **Specific and concrete**: Always reference something REAL from the JD or company, and something REAL from the candidate's experience
- **Direct, no fluff**: 2-4 sentences per answer. No "I'm passionate about..." or "I would love the opportunity to..."
- **The hook is the proof, not the claim**: Instead of "I'm great at X", say "I built X that does Y"

**Framework per question:**
- **Why this role?** → "Your [specific thing] maps directly to [specific thing I built]."
- **Why this company?** → Mention something concrete about the company. "I've been using [product] for [time/purpose]."
- **Relevant experience?** → A quantified proof point. "Built [X] that [metric]. Sold the company in 2025."
- **Good fit?** → "I sit at the intersection of [A] and [B], which is exactly where this role lives."
- **How did you hear?** → Honest: "Found through [portal/scan], evaluated against my criteria, and it scored highest."

**Language**: Always in the JD's language (EN default).

## Step 5 — Update Tracker
Register in `data/applications.md` with all columns including Report and PDF as ✅. If a cover letter was also generated in Step 3b, append `CL:✅` to the notes column.

**If any step fails**, continue with the remaining steps and mark the failed step as pending in the tracker.
