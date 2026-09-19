import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const EXPECTED_VERCEL_PROJECT = 'tahaddi-platform-realtime';

function fail(message) {
  console.error(`Release check failed: ${message}`);
  process.exit(1);
}

let status;
try {
  status = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
    encoding: 'utf8',
  }).trim();
} catch {
  fail('the command must run inside a Git worktree.');
}

if (status) {
  fail('commit or remove every local change before deploying to Vercel.');
}

let project;
try {
  project = JSON.parse(readFileSync(resolve('.vercel', 'project.json'), 'utf8'));
} catch {
  fail('link this worktree to Vercel before deploying.');
}

if (project.projectName !== EXPECTED_VERCEL_PROJECT) {
  fail(
    `expected Vercel project ${EXPECTED_VERCEL_PROJECT}, received ${project.projectName ?? 'unknown'}.`,
  );
}

const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
  encoding: 'utf8',
}).trim();

console.log(`Release source is clean: ${EXPECTED_VERCEL_PROJECT} at commit ${commit}.`);
