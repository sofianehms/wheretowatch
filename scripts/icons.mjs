// Run node scripts/icons.mjs with Chrome installed (set CHROME_PATH to override).
// Regenerate the four PNGs after replacing icon.svg.
import { mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = new URL('../', import.meta.url);
const source = await readFile(new URL('icon.svg', root), 'utf8');
const tokens = await readFile(new URL('design/tokens.css', root), 'utf8');
const skeletonBackground = source.match(/<rect\b[^>]*\bfill="([^"]+)"/)?.[1];
const background = tokens.match(/--color-bg:\s*([^;]+);/)?.[1].trim() ?? skeletonBackground;
if (!background) throw new Error('No maskable icon background found');

const executablePath = process.env.CHROME_PATH || [
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium', '/usr/bin/chromium-browser',
].find(existsSync);
const args = process.getuid?.() === 0 || process.env.CI ? ['--no-sandbox'] : [];
const output = new URL('icons/', root);
await mkdir(output, { recursive: true });

const browser = await chromium.launch({ executablePath, args });
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const svgUrl = `data:image/svg+xml;base64,${Buffer.from(source).toString('base64')}`;
  for (const [name, size, maskable] of [
    ['apple-touch-icon', 180],
    ['icon-192', 192],
    ['icon-512', 512],
    ['icon-maskable-512', 512, true],
  ]) {
    await page.setViewportSize({ width: size, height: size });
    const scale = maskable ? '80%' : '100%';
    await page.setContent(`<body style="margin:0; height:100vh; display:grid; place-items:center;
      background:${maskable ? background : 'transparent'}">
      <img src="${svgUrl}" style="width:${scale}; height:${scale}">
    </body>`);
    await page.locator('img').evaluate((img) => img.decode());
    await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, output)), omitBackground: !maskable });
  }
} finally {
  await browser.close();
}
