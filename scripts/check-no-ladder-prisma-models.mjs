import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const rootFlag = process.argv.indexOf('--root');
if (rootFlag >= 0 && !process.argv[rootFlag + 1]) throw new Error('--root requires a path');

const root = path.resolve(rootFlag >= 0 ? process.argv[rootFlag + 1] : process.cwd());
const ignoredDirectories = new Set([
  '.git',
  '.next',
  '.turbo',
  'build',
  'coverage',
  'dist',
  'generated',
  'node_modules',
]);
const sourceExtensions = new Set(['.cjs', '.js', '.jsx', '.mjs', '.ts', '.tsx']);
const models = ['ladderRoom', 'ladderQuestion', 'ladderTeam'];
const matches = [];

function scan(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) scan(path.join(directory, entry.name));
      continue;
    }
    if (!entry.isFile() || !sourceExtensions.has(path.extname(entry.name))) continue;

    const file = path.join(directory, entry.name);
    const source = readFileSync(file, 'utf8');
    for (const model of models) {
      if (new RegExp(`\\bprisma\\s*\\.\\s*${model}\\b`).test(source)) {
        matches.push(`${path.relative(root, file)}: ${model}`);
      }
    }
  }
}

scan(root);

if (matches.length > 0) {
  console.error(`Forbidden Prisma ladder model access:\n${matches.join('\n')}`);
  process.exitCode = 1;
}
