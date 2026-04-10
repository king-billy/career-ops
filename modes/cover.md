# Mode: cover — Motivation-First Cover Letter Generation

**Philosophy:** A cover letter is NOT a second CV. The recruiter already has the CV. The cover letter answers ONE question: **"Why do you want to work at THIS company in THIS role, specifically?"** If that question isn't answered in the first paragraph, the letter has failed.

**Minimize CV regurgitation.** No bullet lists, no resume of past jobs, no "as you can see from my CV". The proof points from `cv.md` exist as background flavor, not as the main course.

## Full pipeline

1. Read `cv.md`, `config/profile.yml`, and `modes/_profile.md` for voice and narrative
2. Resolve context in this order of preference:
   - **By report number**: `/career-ops cover 042` → read `reports/042-*.md`
   - **By URL**: fetch with Playwright → `browser_navigate` + `browser_snapshot`
   - **By pasted JD text**: use directly
   - **From current conversation**: if a JD was just evaluated in this session, reuse it
3. If NO report exists for this offer, ask the user: "I don't have an evaluation for this role yet. Want me to run `/career-ops oferta` first so the cover letter has real context? (recommended)"
4. Letter language is always English (this mode is English-only — if you need another language, ask)
5. Detect company location → paper format (`letter` for US/Canada, `a4` rest of world)
6. Detect role archetype using `modes/_shared.md` table → select motivation angle from `modes/_profile.md`
7. Run **company research** (Step A below) — this is the most important step
8. Run **role hook extraction** (Step B below)
9. Draft the four paragraphs (Step C below) within a strict 220-320 word budget
10. Generate HTML from `templates/cover-template.html` + personalized content
11. Write HTML to `/tmp/cover-{candidate}-{company}.html`
12. Run: `node generate-pdf.mjs /tmp/cover-{candidate}-{company}.html output/cover-{candidate}-{company}-{YYYY-MM-DD}.pdf --format={letter|a4}`
13. Report to the user: PDF path, word count, motivation-to-CV ratio check, one-line tone review

## Step A — Company research (the most important step)

**This is where most cover letters fail.** Generic "I admire your mission" lines get filtered out instantly. The goal is to find ONE specific, verifiable reason the candidate is writing to THIS company — not the competitor one tab over.

Priority order for sourcing the hook:

1. **Existing report** — if a report exists, read Section D (Company Research) and Section E (Personalization). This is the highest-quality source because it was built with the user's own filter.
2. **JD itself** — scan for: product names the candidate has actually used, recent launches mentioned, team structure details, named technologies, engineering values, mission statements that are SPECIFIC (not generic "AI for good")
3. **`deep` mode output** — if `reports/{###}-{company}-{date}.md` has a "Deep Research" section, use it
4. **`article-digest.md`** — check if the candidate has written about this company's product, competitor, or adjacent problem space
5. **WebSearch fallback** — only if 1-4 came up empty. Query: `"{company}" engineering blog` or `"{company}" recent launch {current year}`

**What counts as a specific hook (use these):**
- "I've been using {product} for {concrete purpose} for {time}" — if true
- "Your team's work on {specific thing from JD/blog} maps directly to a problem I've been chewing on"
- "I spent the last month building {related thing} — ended up re-reading your {post/doc} every other day"
- "{Company} is one of maybe three teams globally shipping in {specific space}, and I want to be inside one of those rooms"

**What does NOT count (never use these):**
- "I admire your mission" / "your innovative approach"
- "I've been following {company} for years" (means nothing)
- "{Company} is a leader in {vague space}"
- Any sentence that could be dropped into a letter to a competitor without editing

**If you cannot find a specific hook after steps 1-5, STOP and tell the user:** "I don't have enough to write a motivation-first cover letter for {company}. Can you tell me in one sentence: what specifically draws you to this company vs the other 3 you're evaluating? I'll build the letter around that." Do NOT fabricate a motivation.

## Step B — Role hook extraction

Once the company hook is locked, find the **role-specific** hook. This answers "why this role, not a different role at the same company?"

Read the JD and extract:
- The 1-2 responsibilities that stand out as the real work (ignore boilerplate)
- Any phrases that reveal trajectory ("you'll own X from 0→1", "lead the migration to Y")
- Any named stack/tool that overlaps with something the candidate has actually built
- Whether it's a greenfield role, a scaling role, a migration role, a turnaround role — these map to different archetypes from `modes/_profile.md`

The role hook should be ONE sentence that makes the reader think "this person gets what the role actually is, not just the title."

## Step C — Four-paragraph draft

Total budget: **220-320 words**. Longer is weaker. A half-page letter that reads crisply beats a full page that rambles.

### Paragraph 1 — Company hook (2-3 sentences, ~50 words)

Open with the company-specific reason. No "I am writing to apply for" opener. No restatement of the role title (it's in the subject line / attached CV).

**Formula:** `[Specific observation about the company or its work]. [Why that matters to me personally]. [Why I'm writing today instead of next month].`

Example shape:
> "Glean is one of the few teams treating enterprise search as a retrieval problem instead of a UI problem — the architecture post from your infra team last month is the clearest public explanation of that I've read. I want to build on that side of the fence. Saw the Forward Deployed opening this week and stopped the rest of my search."

### Paragraph 2 — Role hook (3-4 sentences, ~70 words)

Translate the JD's real work into the candidate's trajectory. NOT "I have done X, Y, Z" — instead, "the work described in the JD is the work I want to be doing next, and here's why it's a natural next step."

**Formula:** `[What the role actually does, in my words]. [Why that is the next step for me, not a sideways move]. [What I'd want to bring to the first 90 days].`

This paragraph is about direction, not credentials. Credentials are in the attached CV.

### Paragraph 3 — Light proof paragraph (2-3 sentences, ~60 words)

**This is the ONLY paragraph where the CV is allowed in.** And even here, the rule is: **one proof point, reframed as a lens — not a bullet list.**

Pick the SINGLE most relevant achievement from `cv.md` / `article-digest.md`. Do NOT recap it. Instead, use it as the angle the candidate will bring to the problem the company has.

**Wrong (CV regurgitation):**
> "At Acme, I built an observability platform that reduced incident response time by 40%, managed a team of 5, and shipped X in 3 months."

**Right (lens framing):**
> "The last system I shipped was an observability layer for agent workflows — I learned there the hard way that eval harnesses are the bottleneck, not the models. That's the lens I'd bring to your Quality team."

The reader should finish this paragraph thinking "this person has shipped real things and has a point of view," not "here are 3 bullet points from their resume."

### Paragraph 4 — Close (2 sentences, ~40 words)

Forward-looking, confident, no groveling. No "thank you for your consideration." No "I look forward to hearing from you at your earliest convenience."

**Formula:** `[What I'd most want to talk about in a first conversation] + [concrete next step].`

Example shape:
> "Happy to walk through any of the above — or the thing I'm most curious about: how your team is thinking about {specific hard problem from the JD}. Available for a first call whenever works on your side."

## Tone framework (inherits from `apply` and `auto-pipeline`)

**Position: "I'm choosing you."** The candidate has options. They are writing to this company for concrete reasons they can articulate. They are not begging.

**Rules:**
- Confident without arrogance. "I've been chewing on X for the last year and your team is the clearest public example of doing it well" — not "I am the perfect candidate for this role."
- Specific without being a product review. Reference one concrete thing, then move on. Don't spend three sentences praising the company.
- Conversational register, not corporate. Write like one senior professional to another over coffee.
- No filler: remove "I am excited to", "I would love to", "It would be an honor", "thank you for your consideration", "as you can see from my CV", "I am confident that", "I believe I am a strong fit".
- Active voice only.
- Contractions are fine (I've, I'm, it's) — they make the letter read as a human wrote it.

## Banned openings (auto-reject if drafted)

Any draft that starts with one of these MUST be rewritten before generating the PDF:

- "I am writing to express my interest in..."
- "I am writing to apply for the position of..."
- "As a {profession} with {X} years of experience..."
- "I was excited to see..."
- "Please accept this letter as my application for..."
- "I am thrilled at the opportunity to..."
- "My name is {name} and I..."

## Motivation-to-CV ratio check (MANDATORY before PDF generation)

Before writing the HTML, count the sentences that talk about **motivation / company / role-specific reasoning** vs the sentences that talk about **past achievements / credentials**.

- Motivation sentences: must be **≥ 60%** of the total
- Past-achievement sentences: must be **≤ 30%**
- Closing / logistics: the remaining ~10%

If past-achievement sentences exceed 30%, the draft is too CV-like. **Rewrite paragraph 3** to be a lens/angle rather than a recap, and re-run the check.

Report the ratio to the user in the final summary (e.g., `Motivation 68% / Proof 22% / Close 10%`).

## Ethical rules (inherited from `pdf` mode)

- **NEVER invent reasons.** If the company hook isn't real, ask the user instead of fabricating.
- **NEVER invent proof points.** Only reframe real experience that lives in `cv.md` or `article-digest.md`.
- **NEVER claim skills the candidate does not have.** Silence about a gap is fine — lying about it is not.
- **NEVER write "I am passionate about" anything.** The reader will assume you aren't.

## HTML template

Use `templates/cover-template.html`. Replace `{{...}}` placeholders:

| Placeholder | Content |
|-------------|---------|
| `{{LANG}}` | `en` |
| `{{PAGE_WIDTH}}` | `8.5in` (letter) or `210mm` (a4) |
| `{{NAME}}` | from `config/profile.yml` |
| `{{EMAIL}}` | from `config/profile.yml` |
| `{{LINKEDIN_URL}}` / `{{LINKEDIN_DISPLAY}}` | from `config/profile.yml` |
| `{{PORTFOLIO_URL}}` / `{{PORTFOLIO_DISPLAY}}` | from `config/profile.yml` |
| `{{LOCATION}}` | from `config/profile.yml` |
| `{{DATE}}` | today in long English format (e.g., `April 9, 2026`) |
| `{{RECIPIENT}}` | Hiring manager name if detected in JD, else `Hiring Team at {Company}` |
| `{{GREETING}}` | `Dear {Name},` / `Dear Hiring Team,` |
| `{{COMPANY}}` | Company name (used in subject line + body) |
| `{{ROLE_TITLE}}` | Role title from JD |
| `{{SUBJECT_LINE}}` | Short subject line: `Re: {Role Title}` |
| `{{HOOK_PARAGRAPH}}` | Paragraph 1 — company hook |
| `{{ROLE_PARAGRAPH}}` | Paragraph 2 — role hook |
| `{{PROOF_PARAGRAPH}}` | Paragraph 3 — lens-framed proof (max 1 from CV) |
| `{{CLOSE_PARAGRAPH}}` | Paragraph 4 — forward-looking close |
| `{{SIGNOFF}}` | `Best,` / `Best regards,` |

## Design

Same visual identity as the CV so the two documents read as a set when the recruiter opens them side-by-side:

- Same fonts: Space Grotesk (headings, 600-700) + DM Sans (body, 400-500)
- Same header: name in Space Grotesk 24px + gradient line `linear-gradient(to right, hsl(187,74%,32%), hsl(270,70%,45%))` 2px + contact row
- Body: DM Sans 11.5px, line-height 1.65 (slightly more generous than CV for readability at letter length)
- Left-aligned body (no justification — ATS + readability)
- Margins: 0.75in (slightly more than CV — cover letters breathe better with more whitespace)
- Date block top-right, recipient block left-aligned, body left-aligned, signature block left-aligned

## Triggers and integration points

The `cover` mode can be invoked in five different contexts:

1. **Explicit:** `/career-ops cover` — user is asked for JD/URL or report number
2. **With report number:** `/career-ops cover 042` — loads `reports/042-*.md` directly
3. **After auto-pipeline:** once CV PDF is generated, `auto-pipeline` asks "Generate matching cover letter? (y/n)" and runs this mode with the JD already in context (zero re-fetch)
4. **From `apply` mode:** when the application form has a cover letter upload field, `apply` offers to generate it on the spot and uploads it in the same session
5. **Batch regeneration:** `/career-ops cover {range}` — e.g., `/career-ops cover 040-045` to generate cover letters for a batch of previously evaluated roles

## Post-generation

1. **Log in the report:** append a new section `## H) Cover Letter` to `reports/{###}-{company}-{date}.md` with:
   - Final PDF path
   - Word count
   - Motivation-to-CV ratio
   - The four paragraphs in plain text (so they can be edited/reused manually)
2. **Update tracker note:** if the offer is already in `data/applications.md`, append `CL:✅` to the notes column (keeping existing notes)
3. **Do NOT change the status.** Generating a cover letter is not an "Applied" event — it's preparation. The user still clicks submit.

## Output report format

After generation, report back to the user in this shape:

```
✅ Cover letter generated

Company:     {Company}
Role:        {Role Title}
Length:      {word count} words
Ratio:       Motivation {X}% / Proof {Y}% / Close {Z}%
Format:      {Letter/A4}
PDF:         output/cover-{candidate}-{company}-{YYYY-MM-DD}.pdf
Report:      reports/{###}-{company}-{date}.md (Section H updated)

Hook (P1):   "{first sentence of paragraph 1, for quick sanity check}"

⚠️ Final check: read it once before attaching — does it sound like YOU?
```

## What this mode is NOT for

- Not for rewriting the CV (use `pdf` mode)
- Not for filling out form questions (use `apply` mode)
- Not for sending the message on LinkedIn (use `contacto` mode)
- Not for researching the company from scratch (use `deep` mode — then feed its output to `cover`)
