#!/usr/bin/env node

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const publicKeyNames = Object.keys(process.env)
  .filter((name) => /^NEXT_PUBLIC_SUPABASE_.*KEY$/i.test(name))
  .sort();

if (publicKeyNames.length > 0) {
  console.error(`Public Supabase key variables are forbidden: ${publicKeyNames.join(', ')}`);
  process.exitCode = 1;
}

const buildDirFlag = process.argv.indexOf('--build-dir');

if (buildDirFlag !== -1) {
  const buildDir = process.argv[buildDirFlag + 1];
  const files = [buildDir];

  while (files.length > 0) {
    const current = files.pop();

    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);

      if (entry.isDirectory()) {
        files.push(entryPath);
        continue;
      }

      const contents = readFileSync(entryPath, 'utf8');
      const findings = [];

      if (/[a-z0-9]{20}\.supabase\.co/i.test(contents)) {
        findings.push('Supabase project URL');
      }

      if (/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/.test(contents)) {
        findings.push('JWT');
      }

      if (findings.length > 0) {
        console.error(`${path.relative(buildDir, entryPath)}: ${findings.join(', ')}`);
        process.exitCode = 1;
      }
    }
  }
}
