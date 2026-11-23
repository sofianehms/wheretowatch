// Run node scripts/og-image.mjs with Chrome installed (set CHROME_PATH to override).
// Captures test/og.html at 1200x630 into assets/og-image.png.
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { startServer } from './serve.mjs';

const root = new URL('../', import.meta.url);
const executablePath = process.env.CHROME_PATH || [
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium', '/usr/bin/chromium-browser',
].find(existsSync);
const args = process.getuid?.() === 0 || process.env.CI ? ['--no-sandbox'] : [];
const output = new URL('assets/', root);
await mkdir(output, { recursive: true });

const server = await startServer(fileURLToPath(root));
const browser = await chromium.launch({ executablePath, args });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, colorScheme: 'dark' });
  await page.goto(`http://127.0.0.1:${server.address().port}/test/og.html`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: fileURLToPath(new URL('og-image.png', output)) });
} finally {
  await browser.close();
  server.close();
}
