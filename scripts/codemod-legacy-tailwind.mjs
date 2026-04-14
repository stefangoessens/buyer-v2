#!/usr/bin/env node
// Codemod: rewrite legacy Tailwind color classes to shadcn token classes.
// Dry run by default; pass --write to mutate files. --quiet suppresses per-file diffs.

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname);

const INCLUDE_DIRS = [
  'src/components/dealroom',
  'src/components/property',
  'src/components/admin',
  'src/components/close',
  'src/components/offer',
  'src/components/product',
  'src/components/dashboard',
];

const EXCLUDE_PATH_FRAGMENTS = [
  '/src/components/marketing/',
  '/src/components/ui/',
  '/src/content/',
  '/src/app/(marketing)/',
  '/__tests__/',
];

const FILE_EXTS = new Set(['.tsx', '.ts', '.css']);
const SKIP_MARKER = '// tailwind-codemod-skip';

// Order matters — applied sequentially on each line.
const RULES = [
  { pattern: /\bbg-primary-500\b/g, replacement: 'bg-primary' },
  { pattern: /\bbg-primary-600\b/g, replacement: 'bg-primary' },
  { pattern: /\btext-neutral-800\b/g, replacement: 'text-foreground' },
  { pattern: /\btext-neutral-900\b/g, replacement: 'text-foreground' },
  { pattern: /\btext-neutral-500\b/g, replacement: 'text-muted-foreground' },
  { pattern: /\btext-neutral-600\b/g, replacement: 'text-muted-foreground' },
  { pattern: /\bborder-neutral-200\b/g, replacement: 'border-border' },
  { pattern: /\bbg-neutral-50\b/g, replacement: 'bg-muted' },
  { pattern: /\bbg-neutral-100\b/g, replacement: 'bg-muted' },
];

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const QUIET = args.includes('--quiet');

function isExcluded(absPath) {
  const normalized = absPath.split('\\').join('/');
  if (!FILE_EXTS.has(normalized.slice(normalized.lastIndexOf('.')))) return true;
  if (normalized.endsWith('.test.tsx') || normalized.endsWith('.test.ts')) return true;
  for (const frag of EXCLUDE_PATH_FRAGMENTS) {
    if (normalized.includes(frag)) return true;
  }
  return false;
}

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walk(full, out);
    } else if (st.isFile()) {
      if (!isExcluded(full)) out.push(full);
    }
  }
  return out;
}

function processFile(absPath) {
  const original = readFileSync(absPath, 'utf8');
  const lines = original.split('\n');

  // Whole-file skip
  if (lines.length > 0 && lines[0].includes(SKIP_MARKER)) {
    return { changed: false, diffs: [], lineChanges: 0 };
  }

  const diffs = [];
  let lineChanges = 0;
  const nextLines = lines.map((line, idx) => {
    if (line.includes(SKIP_MARKER)) return line;
    let updated = line;
    for (const { pattern, replacement } of RULES) {
      updated = updated.replace(pattern, replacement);
    }
    if (updated !== line) {
      lineChanges += 1;
      diffs.push({ lineNumber: idx + 1, before: line, after: updated });
    }
    return updated;
  });

  const changed = lineChanges > 0;
  const nextContent = nextLines.join('\n');
  if (changed && WRITE) {
    writeFileSync(absPath, nextContent, 'utf8');
  }
  return { changed, diffs, lineChanges };
}

function main() {
  const files = [];
  for (const rel of INCLUDE_DIRS) {
    walk(resolve(ROOT, rel), files);
  }

  let filesChanged = 0;
  let totalLineChanges = 0;

  for (const file of files) {
    // Double-check exclude safety — if anything under marketing/ui slipped in, abort.
    const normalized = file.split('\\').join('/');
    for (const frag of EXCLUDE_PATH_FRAGMENTS) {
      if (normalized.includes(frag)) {
        console.error(`FATAL: excluded path reached processing: ${normalized}`);
        process.exit(2);
      }
    }

    const { changed, diffs, lineChanges } = processFile(file);
    if (!changed) continue;
    filesChanged += 1;
    totalLineChanges += lineChanges;
    if (!QUIET) {
      console.log(`\n${relative(ROOT, file)}  (${lineChanges} line${lineChanges === 1 ? '' : 's'})`);
      for (const d of diffs) {
        console.log(`  L${d.lineNumber}`);
        console.log(`    - ${d.before.trim()}`);
        console.log(`    + ${d.after.trim()}`);
      }
    }
  }

  console.log(
    `\n${WRITE ? 'APPLIED' : 'DRY RUN'}: ${filesChanged} file${filesChanged === 1 ? '' : 's'} changed, ${totalLineChanges} line${totalLineChanges === 1 ? '' : 's'} total.`,
  );
  if (!WRITE) {
    console.log('Re-run with --write to apply.');
  }
}

main();
