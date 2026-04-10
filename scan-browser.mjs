#!/usr/bin/env node

/**
 * scan-browser.mjs — Headless/headed browser scraper for JS-rendered career pages
 *
 * Fills the gap left by WebFetch (which returns framework shells for SPAs like
 * Ashby, Lever, Workday, modern Greenhouse). Uses Playwright with bundled Chromium
 * by default, or the user's installed Chrome/Edge via channel, or an existing
 * Chrome profile for logged-in sessions.
 *
 * CLI:
 *   node scan-browser.mjs scrape <url> [options]
 *   node scan-browser.mjs scrape-batch <urls.txt> [options]
 *   node scan-browser.mjs probe <url> [options]     # dump HTML+title for debugging
 *
 * Options:
 *   --browser=<bundled|chrome|edge|chrome-profile>  Default: bundled
 *   --headed                                        Show the browser window
 *   --profile=<name>                                Chrome profile name (for chrome-profile)
 *   --format=<json|tsv>                             Output format (default: json)
 *   --timeout=<ms>                                  Navigation timeout (default: 30000)
 *   --wait=<ms>                                     Extra wait after networkidle (default: 0)
 *   --out=<path>                                    Write output to file instead of stdout
 *   --concurrency=<n>                               For scrape-batch (default: 3)
 *   --platform=<ashby|greenhouse|lever|workday|auto>  Force a platform extractor
 *
 * Examples:
 *   node scan-browser.mjs scrape https://jobs.ashbyhq.com/cohere
 *   node scan-browser.mjs scrape https://job-boards.greenhouse.io/anthropic --browser=chrome
 *   node scan-browser.mjs scrape-batch urls.txt --concurrency=5
 *   node scan-browser.mjs scrape https://linkedin.com/jobs --browser=chrome-profile --headed
 */

import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { homedir } from 'os';

// ─────────────────────────────────────────────────────────────────────────────
// Platform detection and extractors
// ─────────────────────────────────────────────────────────────────────────────

function detectPlatform(url) {
  const h = new URL(url).hostname.toLowerCase();
  const p = new URL(url).pathname.toLowerCase();
  if (h.includes('ashbyhq.com')) return 'ashby';
  if (h.includes('greenhouse.io')) return 'greenhouse';
  if (h.includes('lever.co')) return 'lever';
  if (h.includes('myworkdayjobs.com') || h.includes('workday.com')) return 'workday';
  if (h.includes('smartrecruiters.com')) return 'smartrecruiters';
  if (h.includes('bamboohr.com')) return 'bamboohr';
  if (h.includes('rippling.com')) return 'rippling';
  if (h.includes('jobs.netflix.com')) return 'netflix';
  if (h.includes('linkedin.com') && p.includes('/jobs')) return 'linkedin';
  if (h.includes('indeed.com')) return 'indeed';
  return 'generic';
}

/**
 * Extractors run inside the browser page context via page.evaluate().
 * Each returns: Array<{ title, url, location, department, raw }>
 */
const extractors = {
  // Ashby: SPA, each job is an anchor `/{company-slug}/{uuid}`
  ashby: () => {
    const pathSlug = window.location.pathname.split('/').filter(Boolean)[0];
    if (!pathSlug) return [];
    const re = new RegExp(`^/${pathSlug}/[a-f0-9-]{20,}`, 'i');
    const anchors = Array.from(document.querySelectorAll('a[href]'));
    const jobs = [];
    const seen = new Set();
    for (const a of anchors) {
      const href = a.getAttribute('href') || '';
      if (!re.test(href)) continue;
      const absolute = new URL(href, window.location.origin).toString();
      if (seen.has(absolute)) continue;
      seen.add(absolute);
      const raw = (a.textContent || '').replace(/\s+/g, ' ').trim();
      // Ashby format: "TitleDepartment • Location • Type • Mode"
      const parts = raw.split('•').map(s => s.trim());
      const titleChunk = parts[0] || raw;
      const location = parts[1] || '';
      const type = parts[2] || '';
      const mode = parts[3] || '';
      jobs.push({
        title: titleChunk,
        url: absolute,
        location,
        department: '',
        employment_type: type,
        workplace_type: mode,
        raw,
      });
    }
    return jobs;
  },

  // Greenhouse (both legacy boards.greenhouse.io and new job-boards.greenhouse.io)
  greenhouse: () => {
    const anchors = Array.from(document.querySelectorAll('a[href*="/jobs/"]'));
    const jobs = [];
    const seen = new Set();
    for (const a of anchors) {
      const absolute = a.href;
      if (!/\/jobs\/\d+/.test(absolute)) continue;
      if (seen.has(absolute)) continue;
      seen.add(absolute);
      // New job-boards.greenhouse.io structure:
      //   <a><p class="body--medium">Title</p><p class="body--metadata">Location</p></a>
      // Legacy boards.greenhouse.io structure:
      //   <div class="opening"><a>Title</a><span class="location">Loc</span></div>
      const titleEl = a.querySelector('p.body--medium, .opening-title, span.title') || a;
      const titleRaw = (titleEl.textContent || '').replace(/\s+/g, ' ').trim();
      const title = titleRaw.replace(/New$/, '').trim();
      // Skip "talent network" / unsolicited application placeholders
      if (/don.?t see what you.?re looking/i.test(title)) continue;
      if (/general application|talent (pool|network|community)/i.test(title)) continue;
      const locEl = a.querySelector('p.body--metadata, .location, span.location') || a.parentElement?.querySelector('.location, span.location');
      const location = (locEl?.textContent || '').replace(/\s+/g, ' ').trim();
      const raw = `${title} | ${location}`;
      jobs.push({ title, url: absolute, location, department: '', raw });
    }
    return jobs;
  },

  // Lever: .posting-title or .posting a
  lever: () => {
    const nodes = Array.from(document.querySelectorAll('.posting-title, .posting a[href], a.posting-title, [data-qa="posting-title"]'));
    const jobs = [];
    const seen = new Set();
    for (const n of nodes) {
      const link = n.closest('a') || (n.querySelector && n.querySelector('a')) || n;
      const href = link?.href || '';
      if (!href) continue;
      if (seen.has(href)) continue;
      seen.add(href);
      const raw = (n.textContent || '').replace(/\s+/g, ' ').trim();
      const titleEl = n.querySelector('[data-qa="posting-name"], h5, .posting-title-text');
      const title = (titleEl?.textContent || raw.split('  ')[0] || raw).trim();
      const locEl = n.querySelector('.posting-categories .location, [data-qa="posting-location"]');
      const location = (locEl?.textContent || '').trim();
      jobs.push({ title, url: href, location, department: '', raw });
    }
    return jobs;
  },

  // Workday: `[data-automation-id="jobTitle"]`
  workday: () => {
    const links = Array.from(document.querySelectorAll('a[data-automation-id="jobTitle"]'));
    const jobs = [];
    for (const a of links) {
      const title = (a.textContent || '').trim();
      const url = a.href;
      const loc = a.closest('li')?.querySelector('[data-automation-id="locations"]')?.textContent?.trim() || '';
      jobs.push({ title, url, location: loc, department: '', raw: title });
    }
    return jobs;
  },

  // SmartRecruiters: .opening-job or .js-more-section
  smartrecruiters: () => {
    const links = Array.from(document.querySelectorAll('.opening-job a, a.js-smart-trigger, a.list-group-item'));
    const jobs = [];
    for (const a of links) {
      const title = (a.querySelector('.details-title, h3, h4')?.textContent || a.textContent || '').trim();
      const url = a.href;
      if (!url || !title) continue;
      const loc = a.querySelector('.opening-location, .job-location')?.textContent?.trim() || '';
      jobs.push({ title, url, location: loc, department: '', raw: title });
    }
    return jobs;
  },

  bamboohr: () => {
    const links = Array.from(document.querySelectorAll('.BambooHR-ATS-Jobs-List a, a.BambooHR-ATS-Job-Link'));
    const jobs = [];
    for (const a of links) {
      const title = (a.textContent || '').trim();
      const url = a.href;
      if (!title || !url) continue;
      jobs.push({ title, url, location: '', department: '', raw: title });
    }
    return jobs;
  },

  rippling: () => {
    const links = Array.from(document.querySelectorAll('a[href*="/careers/open-roles/"], a[href*="/job/"]'));
    const jobs = [];
    const seen = new Set();
    for (const a of links) {
      const title = (a.textContent || '').replace(/\s+/g, ' ').trim();
      const url = a.href;
      if (!title || !url || seen.has(url)) continue;
      seen.add(url);
      jobs.push({ title, url, location: '', department: '', raw: title });
    }
    return jobs;
  },

  netflix: () => {
    const links = Array.from(document.querySelectorAll('a[href*="/jobs/"]'));
    const jobs = [];
    const seen = new Set();
    for (const a of links) {
      const url = a.href;
      if (!/\/jobs\/\d+/.test(url)) continue;
      if (seen.has(url)) continue;
      seen.add(url);
      const title = (a.textContent || '').replace(/\s+/g, ' ').trim();
      jobs.push({ title, url, location: '', department: '', raw: title });
    }
    return jobs;
  },

  linkedin: () => {
    const cards = Array.from(document.querySelectorAll('[data-job-id], .job-card-container, .jobs-search-results__list-item'));
    const jobs = [];
    for (const c of cards) {
      const a = c.querySelector('a.job-card-list__title, a.job-card-container__link, a[href*="/jobs/view/"]');
      if (!a) continue;
      const title = (a.textContent || '').replace(/\s+/g, ' ').trim();
      const url = a.href;
      const company = c.querySelector('.job-card-container__primary-description, .job-card-container__company-name')?.textContent?.trim() || '';
      const location = c.querySelector('.job-card-container__metadata-item, .job-card-container__metadata-wrapper')?.textContent?.trim() || '';
      if (!title || !url) continue;
      jobs.push({ title, url, location, company, department: '', raw: title });
    }
    return jobs;
  },

  indeed: () => {
    const cards = Array.from(document.querySelectorAll('a.tapItem, a.jcs-JobTitle, h2.jobTitle a'));
    const jobs = [];
    const seen = new Set();
    for (const a of cards) {
      const url = a.href;
      if (!url || seen.has(url)) continue;
      seen.add(url);
      const title = (a.textContent || a.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
      jobs.push({ title, url, location: '', department: '', raw: title });
    }
    return jobs;
  },

  // Generic: any anchor whose text contains common job-title keywords
  generic: () => {
    const keywords = /\b(Engineer|Analyst|Manager|Scientist|Developer|Architect|Designer|Director|Specialist|Coordinator|Consultant|Lead|Intern|Associate|Researcher|Administrator|Technician)\b/i;
    const nav = /^(home|about|contact|login|sign|menu|careers|jobs|search|filter|apply|back)$/i;
    const anchors = Array.from(document.querySelectorAll('a[href]'));
    const jobs = [];
    const seen = new Set();
    for (const a of anchors) {
      const raw = (a.textContent || '').replace(/\s+/g, ' ').trim();
      if (!raw || raw.length < 6 || raw.length > 200) continue;
      if (nav.test(raw)) continue;
      if (!keywords.test(raw)) continue;
      const absolute = a.href;
      if (!absolute || absolute.startsWith('javascript:') || absolute.startsWith('mailto:')) continue;
      if (seen.has(absolute)) continue;
      seen.add(absolute);
      jobs.push({ title: raw, url: absolute, location: '', department: '', raw });
    }
    return jobs;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Browser launching
// ─────────────────────────────────────────────────────────────────────────────

async function launchBrowser({ browser = 'bundled', headed = false, profile = 'Default' }) {
  const headless = !headed;
  switch (browser) {
    case 'bundled':
    case 'chromium':
      return { browser: await chromium.launch({ headless }), isPersistent: false };
    case 'chrome':
      return { browser: await chromium.launch({ headless, channel: 'chrome' }), isPersistent: false };
    case 'edge':
    case 'msedge':
      return { browser: await chromium.launch({ headless, channel: 'msedge' }), isPersistent: false };
    case 'chrome-profile': {
      // Uses the actual user Chrome profile (cookies, logins persist).
      // MUST close Chrome first — Chrome locks its profile directory.
      const userDataDir = join(homedir(), 'Library/Application Support/Google/Chrome');
      const context = await chromium.launchPersistentContext(userDataDir, {
        channel: 'chrome',
        headless,
        args: [`--profile-directory=${profile}`],
      });
      return { browser: context, isPersistent: true };
    }
    case 'chrome-cdp': {
      // Connect to an already-running Chrome on debug port 9222.
      // Start Chrome with: /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
      const b = await chromium.connectOverCDP('http://localhost:9222');
      return { browser: b, isPersistent: false, cdp: true };
    }
    default:
      throw new Error(`Unknown browser: ${browser}`);
  }
}

async function newPageFrom(b, isPersistent, cdp) {
  if (isPersistent) return b.pages()[0] || await b.newPage();
  if (cdp) {
    const ctx = b.contexts()[0] || await b.newContext();
    return ctx.pages()[0] || await ctx.newPage();
  }
  return await b.newPage();
}

// ─────────────────────────────────────────────────────────────────────────────
// Scraping logic
// ─────────────────────────────────────────────────────────────────────────────

async function scrapeUrl(page, url, { platform, timeout = 30000, extraWait = 0 }) {
  const startedAt = new Date().toISOString();
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout });
  } catch (e) {
    // Fall back to domcontentloaded for pages that never go idle
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
    } catch (e2) {
      return {
        url,
        platform: platform || detectPlatform(url),
        fetched_at: startedAt,
        error: `navigate failed: ${e2.message.split('\n')[0]}`,
        status: 'error',
        jobs: [],
      };
    }
  }
  if (extraWait > 0) await page.waitForTimeout(extraWait);

  const plat = platform && platform !== 'auto' ? platform : detectPlatform(url);
  const finalUrl = page.url();

  // Check for Greenhouse error redirect
  if (finalUrl.includes('?error=true')) {
    return {
      url,
      final_url: finalUrl,
      platform: plat,
      fetched_at: startedAt,
      status: 'expired',
      error: 'greenhouse ?error=true redirect',
      jobs: [],
    };
  }

  const extractor = extractors[plat] || extractors.generic;
  let jobs = [];
  try {
    jobs = await page.evaluate(extractor);
  } catch (e) {
    return {
      url,
      final_url: finalUrl,
      platform: plat,
      fetched_at: startedAt,
      status: 'error',
      error: `extract failed: ${e.message}`,
      jobs: [],
    };
  }

  // Fallback: if platform extractor returned nothing, try generic
  if (jobs.length === 0 && plat !== 'generic') {
    try {
      jobs = await page.evaluate(extractors.generic);
    } catch { /* noop */ }
  }

  return {
    url,
    final_url: finalUrl,
    platform: plat,
    fetched_at: startedAt,
    status: jobs.length > 0 ? 'ok' : 'empty',
    job_count: jobs.length,
    jobs,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { _: [] };
  for (const a of argv) {
    if (a.startsWith('--')) {
      const [k, ...v] = a.slice(2).split('=');
      args[k] = v.length ? v.join('=') : true;
    } else {
      args._.push(a);
    }
  }
  return args;
}

function formatOutput(results, format) {
  if (format === 'tsv') {
    const lines = ['url\ttitle\tplatform\tlocation\tsource_url'];
    const list = Array.isArray(results) ? results : [results];
    for (const r of list) {
      if (!r.jobs) continue;
      for (const j of r.jobs) {
        lines.push([j.url, j.title, r.platform, j.location || '', r.url].join('\t'));
      }
    }
    return lines.join('\n');
  }
  return JSON.stringify(results, null, 2);
}

async function cmdScrape(args) {
  const url = args._[1];
  if (!url) throw new Error('Missing URL. Usage: scrape <url>');
  const { browser, isPersistent, cdp } = await launchBrowser({
    browser: args.browser || 'bundled',
    headed: !!args.headed,
    profile: args.profile || 'Default',
  });
  try {
    const page = await newPageFrom(browser, isPersistent, cdp);
    const result = await scrapeUrl(page, url, {
      platform: args.platform,
      timeout: Number(args.timeout) || 30000,
      extraWait: Number(args.wait) || 0,
    });
    const out = formatOutput(result, args.format || 'json');
    if (args.out) {
      await mkdir(dirname(resolve(args.out)), { recursive: true });
      await writeFile(resolve(args.out), out);
      console.error(`wrote ${result.job_count || 0} jobs → ${args.out}`);
    } else {
      process.stdout.write(out + '\n');
    }
  } finally {
    await browser.close();
  }
}

async function cmdScrapeBatch(args) {
  const urlsFile = args._[1];
  if (!urlsFile) throw new Error('Missing urls file. Usage: scrape-batch <urls.txt>');
  if (!existsSync(urlsFile)) throw new Error(`File not found: ${urlsFile}`);
  const content = await readFile(urlsFile, 'utf-8');
  const urls = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  const concurrency = Math.max(1, Number(args.concurrency) || 3);

  const { browser, isPersistent, cdp } = await launchBrowser({
    browser: args.browser || 'bundled',
    headed: !!args.headed,
    profile: args.profile || 'Default',
  });
  const results = [];
  try {
    let idx = 0;
    const workers = Array.from({ length: concurrency }, async () => {
      while (idx < urls.length) {
        const i = idx++;
        const url = urls[i];
        const page = isPersistent || cdp
          ? await newPageFrom(browser, isPersistent, cdp)
          : await browser.newPage();
        try {
          const r = await scrapeUrl(page, url, {
            platform: args.platform,
            timeout: Number(args.timeout) || 30000,
            extraWait: Number(args.wait) || 0,
          });
          results[i] = r;
          console.error(`[${i + 1}/${urls.length}] ${r.status} ${r.job_count || 0} jobs  ${url}`);
        } catch (e) {
          results[i] = { url, status: 'error', error: e.message, jobs: [] };
          console.error(`[${i + 1}/${urls.length}] ERROR ${url} — ${e.message}`);
        } finally {
          if (!isPersistent && !cdp) await page.close().catch(() => {});
        }
      }
    });
    await Promise.all(workers);
  } finally {
    await browser.close();
  }

  const out = formatOutput(results, args.format || 'json');
  if (args.out) {
    await mkdir(dirname(resolve(args.out)), { recursive: true });
    await writeFile(resolve(args.out), out);
    console.error(`wrote results → ${args.out}`);
  } else {
    process.stdout.write(out + '\n');
  }
}

async function cmdProbe(args) {
  const url = args._[1];
  if (!url) throw new Error('Missing URL. Usage: probe <url>');
  const { browser, isPersistent, cdp } = await launchBrowser({
    browser: args.browser || 'bundled',
    headed: !!args.headed,
    profile: args.profile || 'Default',
  });
  try {
    const page = await newPageFrom(browser, isPersistent, cdp);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    if (Number(args.wait) > 0) await page.waitForTimeout(Number(args.wait));
    const info = await page.evaluate(() => ({
      title: document.title,
      url: location.href,
      anchorCount: document.querySelectorAll('a').length,
      bodyTextSnippet: (document.body.innerText || '').slice(0, 500),
      headingTexts: Array.from(document.querySelectorAll('h1, h2, h3')).slice(0, 10).map(h => h.textContent.trim()),
    }));
    process.stdout.write(JSON.stringify(info, null, 2) + '\n');
  } finally {
    await browser.close();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];

  if (!cmd || args.help || args.h) {
    console.error(`Usage:
  node scan-browser.mjs scrape <url> [--browser=...] [--headed] [--format=json|tsv] [--out=...]
  node scan-browser.mjs scrape-batch <urls.txt> [--concurrency=3] [--browser=...]
  node scan-browser.mjs probe <url> [--browser=...] [--wait=2000]

Browsers: bundled (default), chrome, edge, chrome-profile, chrome-cdp
Platforms: auto (default), ashby, greenhouse, lever, workday, smartrecruiters, bamboohr, linkedin, indeed, generic
`);
    process.exit(cmd ? 1 : 0);
  }

  try {
    if (cmd === 'scrape') await cmdScrape(args);
    else if (cmd === 'scrape-batch') await cmdScrapeBatch(args);
    else if (cmd === 'probe') await cmdProbe(args);
    else {
      console.error(`Unknown command: ${cmd}`);
      process.exit(1);
    }
  } catch (e) {
    console.error(`ERROR: ${e.message}`);
    process.exit(1);
  }
}

main();
