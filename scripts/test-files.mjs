import { readdirSync } from 'node:fs';
import { join } from 'node:path';

function collect(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return collect(p);
    return e.name.endsWith('.test.js') ? [p] : [];
  });
}

export const files = collect('test').sort();
