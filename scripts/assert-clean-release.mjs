import { execFileSync } from 'node:child_process';

try {
  const status = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
    encoding: 'utf8',
  }).trim();
  if (status) throw new Error('commit or remove local changes before releasing.');
  const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  console.log(`Release source is clean at commit ${commit}.`);
} catch (error) {
  console.error(`Release check failed: ${error.message}`);
  process.exitCode = 1;
}
