// Quality gate for a static site: screenshots, no horizontal scroll, axe-core, Lighthouse, console errors.
// Usage: npm run verify        Env: SHOTS_DIR (default .verify/shots), CHROME_PATH (default: auto-detect).
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import AxeBuilder from '@axe-core/playwright';
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import { startServer } from './serve.mjs';

const startedAt = performance.now();
const cfg = JSON.parse(fs.readFileSync('verify.config.json', 'utf8'));
// A page is a path string or { "path": "/x.html", "lighthouse": false } (e.g. for the 404 page).
const pages = cfg.pages.map((p) => (typeof p === 'string' ? { path: p, lighthouse: true } : { lighthouse: true, ...p }));
const shotsDir = path.resolve(process.env.SHOTS_DIR || '.verify/shots');
fs.mkdirSync(shotsDir, { recursive: true });

function findChrome() {
  const c = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);
  const found = c.find((p) => fs.existsSync(p));
  if (!found) throw new Error('Chrome/Chromium not found: set CHROME_PATH');
  return found;
}
const chromePath = findChrome();
const sandboxArgs = (typeof process.getuid === 'function' && process.getuid() === 0) || process.env.CI ? ['--no-sandbox'] : [];

const failures = [];
const fail = (msg) => { failures.push(msg); console.log(`  FAIL ${msg}`); };
const ok = (msg) => console.log(`  ok   ${msg}`);

const server = await startServer(cfg.root);
const origin = `http://127.0.0.1:${server.address().port}`;
const allowedOrigins = new Set([
  origin,
  'https://api.themoviedb.org',
  'https://image.tmdb.org',
  'https://api.movieofthenight.com',
]);
const browser = await chromium.launch({ executablePath: chromePath, args: sandboxArgs });

function checkOrigin(url, report) {
  const requestOrigin = new URL(url).origin;
  if (!allowedOrigins.has(requestOrigin)) report(`unauthorized request origin: ${requestOrigin}`);
}

async function prepareTheme(ctx, preference) {
  await ctx.addInitScript((theme) => {
    if (theme !== null && window === window.top) localStorage.setItem('wtw.theme', theme);
    window.addEventListener('load', () => {
      window.themeAtLoad = {
        theme: document.documentElement.dataset.theme,
        background: getComputedStyle(document.body).backgroundColor,
      };
    }, { once: true });
  }, preference);
}

async function checkTheme(page, theme, scheme, report) {
  const { atLoad, expectedBackground } = await page.evaluate((expectedScheme) => {
    const root = document.documentElement;
    const currentTheme = root.getAttribute('data-theme');
    const probe = document.createElement('div');
    probe.style.backgroundColor = 'var(--color-bg)';
    root.setAttribute('data-theme', expectedScheme);
    document.body.append(probe);
    const expectedBackground = getComputedStyle(probe).backgroundColor;
    probe.remove();
    if (currentTheme === null) root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', currentTheme);
    return { atLoad: window.themeAtLoad, expectedBackground };
  }, scheme);
  if (atLoad?.theme !== theme || atLoad.background !== expectedBackground) {
    report(`at first load, expected theme ${theme} with ${scheme} background (${expectedBackground}); `
      + `got ${atLoad?.theme ?? 'no theme'} with ${atLoad?.background ?? 'no background'}`);
  }
}

try {
  console.log(`verify: ${pages.length} page(s) x ${cfg.viewports.length} viewport(s) x ${cfg.schemes.length} theme(s)`);
  for (const { path: route } of pages) {
    for (const { preference, system, theme, scheme } of [
      { preference: null, system: 'light', theme: 'dark', scheme: 'dark' },
      { preference: 'auto', system: 'dark', theme: 'auto', scheme: 'dark' },
      { preference: 'auto', system: 'light', theme: 'auto', scheme: 'light' },
    ]) {
      const label = `${route} ${preference ?? 'default first paint'} (system ${system})`;
      const ctx = await browser.newContext({ colorScheme: system });
      const problems = new Set();
      const report = (problem) => problems.add(problem);
      try {
        ctx.on('request', (request) => checkOrigin(request.url(), report));
        await prepareTheme(ctx, preference);
        const page = await ctx.newPage();
        await page.goto(origin + route, { waitUntil: 'networkidle' });
        await checkTheme(page, theme, scheme, report);
      } finally {
        await ctx.close();
      }
      if (problems.size) problems.forEach((p) => fail(`${label}: ${p}`));
      else ok(label);
    }

    for (const vp of cfg.viewports) {
      for (const scheme of cfg.schemes) {
        const label = `${route} ${vp.name} ${scheme}`;
        const ctx = await browser.newContext({
          viewport: { width: vp.width, height: vp.height }, colorScheme: scheme === 'dark' ? 'light' : 'dark',
          isMobile: !!vp.mobile, hasTouch: !!vp.mobile, deviceScaleFactor: vp.mobile ? 2 : 1,
        });
        const problems = new Set();
        const report = (problem) => problems.add(problem);
        ctx.on('request', (request) => checkOrigin(request.url(), report));
        await prepareTheme(ctx, scheme);
        const page = await ctx.newPage();
        page.on('console', (m) => { if (m.type() === 'error') report(`console error: ${m.text()}`); });
        page.on('pageerror', (e) => report(`page error: ${e.message}`));
        page.on('requestfailed', (r) => { if (new URL(r.url()).origin === origin) report(`request failed: ${r.url()}`); });
        const resp = await page.goto(origin + route, { waitUntil: 'networkidle' });
        if (!resp || resp.status() >= 400) report(`HTTP ${resp ? resp.status() : 'none'}`);
        await checkTheme(page, scheme, scheme, report);
        const name = `${route.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'index'}-${vp.name}-${scheme}.png`;
        await page.screenshot({ path: path.join(shotsDir, name), fullPage: true });
        // compare with the configured width: mobile emulation widens innerWidth to fit overflowing content
        const overflow = await page.evaluate((w) => document.documentElement.scrollWidth - w, vp.width);
        if (overflow > 0) report(`horizontal scroll (${overflow}px)`);
        const axe = await new AxeBuilder({ page }).analyze();
        for (const v of axe.violations.filter((x) => ['serious', 'critical'].includes(x.impact))) {
          report(`axe ${v.impact}: ${v.id} (${v.nodes.length} node(s))`);
        }
        await ctx.close();
        problems.size ? problems.forEach((p) => fail(`${label}: ${p}`)) : ok(`${label} (theme, origin, axe, layout, console)`);
      }
    }
  }

  const chrome = await chromeLauncher.launch({ chromePath, chromeFlags: ['--headless=new', '--disable-gpu', ...sandboxArgs] });
  try {
    for (const { path: route } of pages.filter((p) => p.lighthouse)) {
      const run = await lighthouse(origin + route, { port: chrome.port, output: 'json', logLevel: 'error',
        onlyCategories: Object.keys(cfg.thresholds) });
      const originProblems = new Set();
      for (const { method, params } of run.artifacts.DevtoolsLog) {
        if (method === 'Network.requestWillBeSent') checkOrigin(params.request.url, (problem) => originProblems.add(problem));
      }
      originProblems.forEach((p) => fail(`lighthouse ${route}: ${p}`));
      const scores = Object.fromEntries(Object.entries(run.lhr.categories).map(([k, v]) => [k, Math.round(v.score * 100)]));
      const line = Object.entries(scores).map(([k, v]) => `${k} ${v}`).join(', ');
      const low = Object.entries(cfg.thresholds).filter(([k, min]) => scores[k] < min);
      low.length ? fail(`lighthouse ${route}: ${low.map(([k, min]) => `${k} ${scores[k]} < ${min}`).join(', ')}`)
                 : ok(`lighthouse ${route}: ${line}`);
    }
  } finally { await chrome.kill(); }
} finally {
  await browser.close();
  server.close();
  console.log(`Total duration: ${((performance.now() - startedAt) / 1000).toFixed(1)}s`);
}

console.log(failures.length ? `VERIFY FAILED: ${failures.length} problem(s)` : `VERIFY OK (screenshots in ${shotsDir})`);
process.exit(failures.length ? 1 : 0);
