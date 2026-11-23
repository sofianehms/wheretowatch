import fs from 'node:fs';
import path from 'node:path';

const required = ['index.html', 'manifest.webmanifest', 'sw.js', 'src/', 'design/'];
const optional = ['about.html', '404.html', 'robots.txt', 'icon.svg', 'icons/', 'assets/'];
const output = '_site';
const pages = ['index.html', 'about.html'];

function escapeMarkup(value) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function pageUrl(file, base) {
  return new URL(file === 'index.html' ? './' : file, base).href;
}

function imageUrl(image, page, base) {
  const url = new URL(image.replaceAll('&amp;', '&'), page);
  if (!/^(?:https?:)?\//i.test(image)) return url.href;
  // Absolute and root-relative paths refer to assets inside the staged site.
  const pathname = url.pathname.startsWith(base.pathname)
    ? url.pathname.slice(base.pathname.length)
    : url.pathname.replace(/^\/+/, '');
  const rebased = new URL('./' + pathname, base);
  rebased.search = url.search;
  rebased.hash = url.hash;
  return rebased.href;
}

function rewriteHtml(file, base, defaultImage) {
  const destination = path.join(output, file);
  const url = pageUrl(file, base);
  const values = new Map([
    ['canonical', ['href', url]],
    ['og:url', ['content', url]],
    ['og:image', ['content', defaultImage]],
  ]);
  const seen = new Set();
  const source = fs.readFileSync(destination, 'utf8');
  let html = source.replace(/<!--[\s\S]*?-->|<(link|meta)\b(?:[^'"<>]|"[^"]*"|'[^']*')*>/gi, (tag, element) => {
    if (!element) return tag;
    const attributes = new Map();
    for (const [, name, double, single, bare] of tag.matchAll(
      /\s+([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g
    )) {
      attributes.set(name.toLowerCase(), double ?? single ?? bare);
    }
    const isLink = element.toLowerCase() === 'link';
    const key = attributes.get(isLink ? 'rel' : 'property')?.toLowerCase();
    if (isLink ? key !== 'canonical' : !['og:url', 'og:image'].includes(key)) return tag;
    seen.add(key);
    const [attribute, defaultValue] = values.get(key);
    const image = key === 'og:image' && attributes.get(attribute);
    const value = image ? imageUrl(image, url, base) : defaultValue;
    if (!value) return tag;
    return formatTag(key, attribute, value);
  });

  if (pages.includes(file)) {
    const missing = [...values].filter(([key, [, value]]) => !seen.has(key) && value)
      .map(([key, [attribute, value]]) => `  ${formatTag(key, attribute, value)}\n`).join('');
    html = html.replace(/<\/head>/i, (closingTag) => missing + closingTag);
  }
  fs.writeFileSync(destination, html);
}

function formatTag(key, attribute, value) {
  const escaped = escapeMarkup(value);
  return key === 'canonical'
    ? `<link rel="canonical" ${attribute}="${escaped}">`
    : `<meta property="${key}" ${attribute}="${escaped}">`;
}

function rewriteDirectory(directory, base, defaultImage) {
  for (const entry of fs.readdirSync(path.join(output, directory), { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) rewriteDirectory(file, base, defaultImage);
    else if (entry.isFile() && /\.html$/i.test(file)) rewriteHtml(file, base, defaultImage);
  }
}

function stage(baseArg) {
  const base = new URL(baseArg);
  if (!['https:', 'http:'].includes(base.protocol) || base.search || base.hash || base.username || base.password) {
    throw new Error('Expected an HTTP(S) site base URL without credentials, query, or fragment');
  }
  if (!base.pathname.endsWith('/')) base.pathname += '/';

  for (const entry of required) {
    const name = entry.replace(/\/$/, '');
    const stat = fs.statSync(name, { throwIfNoEntry: false });
    if (!(entry.endsWith('/') ? stat?.isDirectory() : stat?.isFile())) {
      throw new Error(`Missing required site entry: ${entry}`);
    }
  }

  fs.rmSync(output, { recursive: true, force: true });
  fs.mkdirSync(output);
  for (const entry of [...required, ...optional]) {
    const name = entry.replace(/\/$/, '');
    if (fs.existsSync(name)) fs.cpSync(name, path.join(output, name), { recursive: true });
  }

  const exists = (file) => fs.existsSync(path.join(output, file));
  const icon = ['icons/icon-512.png', 'icon.svg'].find(exists);
  rewriteDirectory('', base, icon ? new URL(icon, base).href : null);
  const urls = pages.filter(exists).map((file) =>
    `  <url><loc>${escapeMarkup(pageUrl(file, base))}</loc></url>`).join('\n');
  fs.writeFileSync(path.join(output, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
}

try {
  if (process.argv.length !== 3) throw new Error('Usage: node scripts/stage-site.mjs <base_url>');
  stage(process.argv[2]);
} catch (error) {
  console.error(`stage-site: ${error.message}`);
  process.exitCode = 1;
}
