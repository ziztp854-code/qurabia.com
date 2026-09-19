#!/usr/bin/env node

// Build-time guard for the hardcoded hex budget outside apps/web/tokens.css.
// The migration target is set by apps/web/src/lib/theme-tokens.test.ts
// (HARDCODED_HEX_BUDGET); both must be lowered together when debt is paid
// down, and neither value may ever increase.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const srcDir = fileURLToPath(new URL('../apps/web/src', import.meta.url));
const maxFlag = process.argv.indexOf('--max');
const budget = maxFlag !== -1 ? Number(process.argv[maxFlag + 1]) : 1410;

function collectCssFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collectCssFiles(full));
    else if (entry.endsWith('.css')) out.push(full);
  }
  return out;
}

let total = 0;
const offenders = [];

for (const file of collectCssFiles(srcDir)) {
  const contents = readFileSync(file, 'utf8');
  const count = (contents.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).length;
  total += count;
  offenders.push([count, file]);
}

if (total > budget) {
  console.error(
    `Hardcoded CSS hex budget exceeded: ${total} > ${budget} (max ${budget}).\n` +
      'Move colors into apps/web/tokens.css tokens or lower an existing literal.',
  );
  for (const [count, file] of offenders.sort((a, b) => b[0] - a[0]).slice(0, 10)) {
    if (count > 0) console.error(`  ${count}\t${path.relative(process.cwd(), file)}`);
  }
  process.exitCode = 1;
}
