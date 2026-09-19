const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const target = path.join(__dirname, 'src', 'generated');

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

if (!fs.existsSync(target)) {
  process.exit(0);
}

if (os.platform() === 'win32') {
  try {
    const psArg = `Remove-Item -LiteralPath '${target.replace(/'/g, "''")}' -Recurse -Force -ErrorAction Stop`;
    for (let i = 0; i < 5; i++) {
      try {
        execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psArg], {
          stdio: 'ignore',
          timeout: 15000,
        });
        if (!fs.existsSync(target)) process.exit(0);
      } catch (_) {
        // try again after sleep
      }
      sleepMs(250);
    }
  } catch (e) {
    console.error('[clean-generated] PowerShell removal failed:', e.message);
  }
}

let lastErr = null;
for (let attempt = 0; attempt < 6; attempt++) {
  try {
    fs.rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    if (!fs.existsSync(target)) process.exit(0);
  } catch (err) {
    lastErr = err;
  }
  sleepMs(200);
}

console.error('[clean-generated] Unable to delete:', target);
if (lastErr) console.error('[clean-generated] Root cause:', lastErr.message || String(lastErr));
console.error('[clean-generated] Hint: close VS Code / TS Server to release file locks, then run build again.');
process.exit(1);
