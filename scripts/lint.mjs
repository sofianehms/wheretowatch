// Zero-dependency lint: JS syntax, and no hard-coded visual values outside design/tokens.css.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const SKIP = new Set(['node_modules', '.git', '.verify', 'scripts', 'design']);
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p); else files.push(p);
  }
})('.');

let problems = 0;
const fail = (f, msg) => { console.error(`lint: ${f}: ${msg}`); problems++; };

for (const f of files) {
  if (/\.m?js$/.test(f)) {
    try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); }
    catch (e) { fail(f, 'syntax error\n' + String(e.stderr).split('\n').slice(0, 4).join('\n')); }
  }
  if (/\.(css|html|js|mjs|svg)$/.test(f) && !f.endsWith('icon.svg')) {
    // theme-color meta tags need literal colors by design
    const text = fs.readFileSync(f, 'utf8').replace(/<meta\s+name="theme-color"[^>]*>/g, '');
    const hit = text.match(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/);
    if (hit) fail(f, `hard-coded color "${hit[0]}": use a token from design/tokens.css`);
  }
}
if (problems) { console.error(`lint: ${problems} problem(s)`); process.exit(1); }
console.log(`lint: ${files.length} file(s) checked, no problem`);
