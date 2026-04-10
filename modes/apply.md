# Mode: apply — Application Bundle Generator

The user is about to apply to a role through Simplify (or a similar autofill tool). Simplify already handles the boring fields: name, email, address, phone, work authorization, EEO, salary, dropdowns, yes/no questions, etc. **This mode does NOT touch any of that.**

What this mode produces is the three things Simplify CANNOT auto-generate for you:

1. A **tailored CV PDF** for this specific role
2. A **motivation-first cover letter PDF** for this specific company
3. **Personalized answers** to the open-ended free-text questions ("Why do you want to work here?", "Tell us about a relevant project", etc.)

That's it. Three artifacts. Then you upload the PDFs into Simplify's upload slots, paste the answers into the open-ended fields, and submit.

## Inputs

Resolve context in this order:

1. **Report number**: `/career-ops apply 042` → load `reports/042-*.md` directly
2. **Pasted JD URL**: fetch via Playwright (`browser_navigate` + `browser_snapshot`) so we have the full JD in context
3. **Pasted JD text**: use directly
4. **From the current conversation**: if a JD was just evaluated in this session, reuse it without re-fetching

If NO report exists for this offer, stop and tell the user:

> "I don't have an evaluation for this role yet. Want me to run `/career-ops oferta` first? The CV, cover letter, and answers will all be much sharper if there's a real evaluation behind them."

The user can override and proceed without a report, but the quality will drop — the cover letter especially leans heavily on Section D (Company Research) and Section E (Personalization).

## Workflow

```
1. LOAD       → JD + report (if exists) + cv.md + profile
2. CV PDF     → Run pdf mode
3. COVER PDF  → Run cover mode
4. ANSWERS    → Generate copy-paste answers for open-ended questions
5. PRESENT    → Show all three artifacts in one block
6. POST-APPLY → On confirmation, update tracker + save Section G
```

## Step 1 — Load context

1. Read `cv.md`, `config/profile.yml`, `modes/_profile.md`
2. Load the report if it exists. Pull from:
   - **Block A** (Role summary) — for the role-specific framing
   - **Block B** (CV match + proof points) — for the answers
   - **Block D** (Company research) — for the cover letter hook
   - **Block E** (Personalization) — for tone and angle
   - **Block F** (STAR stories) — for the "tell us about a project" type questions
   - **Section G** (Draft Application Answers) — if it exists from a previous run, use it as a base and refine
3. If the JD wasn't already in context, extract it now via Playwright/WebFetch

## Step 2 — Generate the CV PDF

Run the full `pdf` pipeline (read `modes/pdf.md`). This produces `output/cv-{candidate}-{company}-{YYYY-MM-DD}.pdf`.

If a CV PDF already exists for this company with today's date, ask: "Found `{path}` from earlier today. Reuse it, or regenerate? (reuse/regenerate)" Default to reuse — no need to burn cycles on a CV that was just generated.

## Step 3 — Generate the cover letter PDF

Run the full `cover` pipeline (read `modes/cover.md`). This produces `output/cover-{candidate}-{company}-{YYYY-MM-DD}.pdf`.

Same dedup behavior: if a cover letter already exists for this company today, ask before regenerating.

The cover letter pipeline already pulls from the report's Section D and E if available, so this step is essentially free when called from `apply`.

## Step 4 — Generate personalized answers for open-ended questions

This is the only step that requires the user to tell us what the form is asking. **Do NOT try to read the form via Playwright.** Simplify is filling everything else, and the open-ended questions vary too much per company to be worth detecting automatically.

Ask the user once:

> "What open-ended questions does the form have? Paste them in (one per line), or say 'standard' and I'll generate the usual ones."

### If the user says "standard"

Generate answers for these defaults:

1. Why are you interested in this role?
2. Why do you want to work at {Company}?
3. Tell us about a relevant project or achievement.
4. What makes you a good fit for this position?
5. How did you hear about this role?

### If the user pastes specific questions

Generate answers for exactly those questions, in the order pasted.

### Answer-generation rules

For each question:

1. **Pull from the report first.** Block B for proof points, Block F for STAR stories, Block D for company-specific angles, Block E for personalization. The report did the work — the answers should reflect it.
2. **If Section G exists** (previous draft answers from a prior `apply` run), use it as a base and refine rather than starting from scratch.
3. **Tone: "I'm choosing you."** Same framework as `auto-pipeline` and `cover` — confident, specific, no begging. The user has options and is choosing this company for concrete reasons.
4. **Specificity is the test.** Every answer must reference at least one concrete thing from the JD or the company's actual work — not generic praise. If you can drop the answer into a form for a competitor without editing, it's wrong.
5. **Length: 2-4 sentences per answer.** No essays. Recruiters skim.
6. **No filler.** Strip "I'm passionate about", "I would love the opportunity to", "I am confident that", "I believe I am a strong fit", "thank you for your consideration".
7. **Active voice. Contractions OK.** Read like a human, not a press release.

### Per-question framework

| Question | Approach |
|----------|----------|
| Why this role? | "Your {specific thing in JD} maps directly to {specific thing I built or am building toward}." |
| Why this company? | One concrete observation about the company (product, blog post, mission specific — NOT generic). "I've been using {product} for {purpose}" if true. |
| Relevant project? | One quantified proof point from cv.md or article-digest.md. Lens-framed, not bullet-listed. |
| Good fit? | "I sit at the intersection of {A} and {B}, which is where this role lives." |
| How did you hear? | Honest: "Found through career-ops scan" / "From {portal}" / "{Person} mentioned it". |

## Step 5 — Present everything in one block

Output format:

```
## Application bundle for {Company} — {Role}

Based on: Report #{NNN} | Score: {X.X}/5 | Archetype: {type}

---

### 📄 CV PDF
{output/cv-{candidate}-{company}-{YYYY-MM-DD}.pdf}
→ Upload this in Simplify's resume slot.

### 📝 Cover Letter PDF
{output/cover-{candidate}-{company}-{YYYY-MM-DD}.pdf}
Word count: {N} | Ratio: Motivation {X}% / Proof {Y}% / Close {Z}%
→ Upload this in Simplify's cover letter slot.
→ If the form has a free-text "Cover Letter" textarea instead of an upload, use the body text below (header/date/signature stripped):

   {body paragraphs joined with blank lines}

---

### 💬 Open-ended answers (copy-paste into Simplify)

**1. {Exact question}**
> {Answer}

**2. {Next question}**
> {Answer}

...

---

⚠️ Final review checklist:
- [ ] Read the cover letter once out loud — does it sound like YOU?
- [ ] Do the answers reference at least one concrete thing from the JD?
- [ ] Did Simplify autofill everything else correctly? Double-check work auth and salary.
- [ ] Hit submit only when YOU are ready. I will not submit anything for you.
```

## Step 6 — Post-apply

If the user confirms they submitted:

1. Update status in `data/applications.md` from `Evaluated` to `Applied`
2. Append `CL:✅` to the notes column if the cover letter was generated
3. Save the open-ended answers to the report under `## G) Draft Application Answers` (overwrite if Section G already existed). This makes the next `apply` run faster for similar roles — Section G becomes a growing answer bank.
4. Suggest next step: `/career-ops contacto` for LinkedIn outreach to a hiring manager or recruiter at the company

## What this mode does NOT do

- Does NOT detect form fields (Simplify handles that)
- Does NOT read the active Chrome tab via Playwright (the JD URL or report number is enough context)
- Does NOT fill dropdowns, yes/no questions, salary fields, work authorization, EEO, references, or any other structured field (Simplify handles all of those)
- Does NOT click submit, ever — the user always reviews and ships
