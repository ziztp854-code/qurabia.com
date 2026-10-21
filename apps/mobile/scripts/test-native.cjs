const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function discover(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? discover(file) : entry.name.endsWith('.test.ts') ? [file] : [];
  });
}
const files = [...discover('src'), ...discover('tests')].sort();
if (!files.length) throw new Error('No native tests found.');
const result = spawnSync(process.execPath, [require.resolve('tsx/cli'), '--test', ...files], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
