// Check syntax, colors, security, portability, and country counts.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parse } from 'acorn';

const SKIP = new Set(['node_modules', '.git', '.verify']);
const HTML_ONLY = new Set(['scripts', 'design']);
const files = [];
(function walk(dir, htmlOnly = false) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, htmlOnly || HTML_ONLY.has(e.name));
    else if (!htmlOnly || /\.html$/i.test(p)) files.push({ file: p, htmlOnly });
  }
})('.');

let problems = 0;
const fail = (f, msg) => { console.error(`lint: ${f}: ${msg}`); problems++; };

const unsafeNames = new Set(['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'eval']);
const isRootRelative = (value) => /^\/(?!\/)/.test(value);

function lintSource(file, source, checkCounts) {
  const tokens = [];
  const tree = parse(source, { ecmaVersion: 'latest', sourceType: 'module', onToken: tokens });
  for (const { type, value, start, end } of tokens) {
    if (type.label === 'name' && unsafeNames.has(value)) {
      fail(file, `security: forbidden JavaScript API ${value}`);
    }
    if (checkCounts && type.label !== 'string' && type.label !== 'template') {
      const count = source.slice(start, end).match(/\b(65|66|190)\b/);
      if (count) fail(file, `accuracy: hard-coded country count ${count[0]}`);
    }
  }

  function visit(node) {
    if (node.type === 'NewExpression' && node.callee.name === 'Function') {
      fail(file, 'security: forbidden JavaScript API new Function');
    }
    if (node.type === 'MemberExpression' && node.computed && unsafeNames.has(node.property.value)) {
      fail(file, `security: forbidden JavaScript API ${node.property.value}`);
    }
    if (/^(Import|Export)/.test(node.type) && typeof node.source?.value === 'string'
        && isRootRelative(node.source.value)) {
      fail(file, `portability: absolute module path "${node.source.value}"`);
    }
    const text = node.type === 'TemplateElement' ? node.value.cooked : node.value;
    if (typeof text === 'string' && text.includes('<')) lintHtml(file, text, false);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        for (const child of value) if (child?.type) visit(child);
      } else if (value?.type) visit(value);
    }
  }
  visit(tree);
}

function lintHtml(file, source, checkSecurity = true) {
  const tags = /<!--[\s\S]*?(?:-->|$)|<([a-z][^\s/'"<>]*)((?:[^'"<>]|"[^"]*"|'[^']*')*)>/gi;
  for (let match; (match = tags.exec(source));) {
    if (!match[1]) continue;
    const tag = match[1].toLowerCase();
    let hasSrc = false;
    for (const [, rawName, double, single, bare] of match[2].matchAll(
      /([^\s=/'"<>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g
    )) {
      const name = rawName.toLowerCase();
      const value = double ?? single ?? bare;
      if (value === undefined) continue;
      if (checkSecurity && (/^on[a-z]/.test(name) || name === 'style')) {
        fail(file, `security: inline ${name} attribute`);
      }
      if ((name === 'href' || name === 'src') && isRootRelative(value.trimStart())) {
        fail(file, `portability: absolute ${name} path "${value}"`);
      }
      if (name === 'src' && value.trim()) hasSrc = true;
    }
    if (/^(script|style|textarea|title)$/.test(tag)) {
      const close = new RegExp(`</${tag}\\s*>`, 'gi');
      close.lastIndex = tags.lastIndex;
      const end = close.exec(source);
      const body = source.slice(tags.lastIndex, end?.index);
      tags.lastIndex = end ? close.lastIndex : source.length;
      if (checkSecurity && (tag === 'style' || (tag === 'script' && (!hasSrc || body.trim())))) {
        fail(file, `security: inline <${tag}> tag`);
      }
    }
  }
}

for (const { file: f, htmlOnly } of files) {
  const normalized = f.split(path.sep).join('/');
  const isJavaScript = /\.m?js$/.test(f);
  const isHtml = /\.html$/i.test(f);
  const checkColors = !htmlOnly && /\.(css|html|js|mjs|svg)$/.test(f) && !f.endsWith('icon.svg')
    && !normalized.startsWith('assets/third-party/');
  if (!isJavaScript && !isHtml && !checkColors) continue;
  const source = fs.readFileSync(f, 'utf8');
  if (isJavaScript) {
    try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); }
    catch (e) {
      fail(f, 'syntax error\n' + String(e.stderr).split('\n').slice(0, 4).join('\n'));
      continue;
    }
    if (normalized.startsWith('src/')) {
      const checkCounts = f.endsWith('.js') && !normalized.startsWith('src/i18n/');
      lintSource(f, source, checkCounts);
    }
  }
  if (isHtml) lintHtml(f, source);
  if (checkColors) {
    // theme-color meta tags need literal colors by design
    const text = source.replace(/<meta\s+name="theme-color"[^>]*>/g, '');
    const hit = text.match(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/);
    if (hit) fail(f, `hard-coded color "${hit[0]}": use a token from design/tokens.css`);
  }
}
if (problems) { console.error(`lint: ${problems} problem(s)`); process.exit(1); }
console.log(`lint: ${files.length} file(s) checked, no problem`);
