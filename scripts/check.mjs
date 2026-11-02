/**
 * Lightweight checks that need no dependencies or a full Harness install:
 *  - syntax-check every JS module in the package
 *  - validate that every JSON file parses
 * Run with: node scripts/check.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const IGNORE = new Set(['node_modules', '.git', '.github']);
let failed = false;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (IGNORE.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = walk(root);

// 1) JS syntax check via `node --check`.
for (const f of files) {
  if (extname(f) !== '.js' && extname(f) !== '.mjs') continue;
  const res = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
  if (res.status !== 0) {
    console.error(`✗ syntax error: ${f}\n${res.stderr}`);
    failed = true;
  } else {
    console.log(`✓ syntax ${f.slice(root.length + 1)}`);
  }
}

// 2) JSON parse check.
for (const f of files) {
  if (extname(f) !== '.json') continue;
  try {
    JSON.parse(readFileSync(f, 'utf8'));
    console.log(`✓ json   ${f.slice(root.length + 1)}`);
  } catch (e) {
    console.error(`✗ invalid JSON: ${f}\n${e.message}`);
    failed = true;
  }
}

if (failed) {
  console.error('\nchecks failed');
  process.exit(1);
}
console.log('\nall checks passed');
