import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, mkdtempSync, mkdirSync, rmSync, copyFileSync, symlinkSync, writeFileSync, statSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { resolveScene, listScenes, validateGlb, findBlender } from './blender.mjs';

const root = new URL('../', import.meta.url);
const cli = new URL('scripts/blender.mjs', root);

function run(args, env = {}) {
  return spawnSync(process.execPath, [fileURLToPath(cli), ...args], {
    cwd: fileURLToPath(root),
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

test('package exposes the Blender workflow commands', () => {
  const { scripts } = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
  for (const name of ['blender:export', 'blender:export:all', 'blender:watch', 'blender:preview', 'dev:3d']) {
    assert.equal(typeof scripts[name], 'string', `${name} is missing`);
  }
});

test('every Blender workflow command has a non-blocking help path', () => {
  for (const command of ['export', 'export-all', 'watch', 'preview', 'dev']) {
    const result = run([command, '--help']);
    assert.equal(result.status, 0, `${command}: ${result.stderr}`);
    assert.match(result.stdout, /BLENDER_PATH/);
  }
});

test('export rejects paths outside blender/scenes', () => {
  const result = run(['export', '../package.json']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Scene must stay inside blender\/scenes/);
});

test('export reports a missing scene without a stack trace', () => {
  const result = run(['export', 'blender/scenes/missing.blend']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Scene not found: blender[\\/]scenes[\\/]missing\.blend/);
  assert.doesNotMatch(result.stderr, /\n\s+at /);
});

test('export wraps a Blender child failure', () => {
  const result = run(['export'], { BLENDER_PATH: process.execPath });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Blender exited with code/);
  assert.match(result.stderr, /challenge-card\.blend/);
});

test('the checked-in challenge card is a complete GLB v2 file', () => {
  const bytes = readFileSync(new URL('apps/web/public/models/challenge-card.glb', root));
  assert.equal(bytes.subarray(0, 4).toString('ascii'), 'glTF');
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
});

test('literal pnpm separator forwards the scene argument', () => {
  const result = run(['export', '--', 'missing.blend']);
  assert.match(result.stderr, /missing\.blend/);
  assert.doesNotMatch(result.stderr, /extension|ASCII/);
});

test('create refuses to overwrite the real source without force', () => {
  const result = run(['create']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /already exists.*--force/);
});

test('unsafe names and invalid preview ports fail before launching children', () => {
  for (const name of ['bad name.blend', 'UPPER.blend', 'bad;command.blend']) assert.throws(() => resolveScene(name), /ASCII/);
  assert.match(run(['preview', '--port', '65536']).stderr, /1 to 65535/);
});

test('nested scenes preserve relative locations and symlink escapes are rejected', () => {
  const directory = fileURLToPath(new URL(`blender/scenes/test-${randomUUID()}`, root));
  mkdirSync(directory);
  const outside = mkdtempSync(join(tmpdir(), 'blender-test-'));
  try {
    mkdirSync(join(directory, 'ranks'));
    const scene = join(directory, 'ranks/knight.blend');
    copyFileSync(fileURLToPath(new URL('blender/scenes/challenge-card.blend', root)), scene);
    assert.equal(resolveScene(scene), scene);
    assert.deepEqual(listScenes(directory), [scene]);
    copyFileSync(scene, join(outside, 'escape.blend'));
    symlinkSync(outside, join(directory, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => resolveScene(join(directory, 'escape/escape.blend')), /including symlinks/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test('invalid chunks are rejected and child failure preserves published bytes', () => {
  const path = fileURLToPath(new URL('apps/web/public/models/challenge-card.glb', root));
  const before = readFileSync(path);
  const directory = mkdtempSync(join(tmpdir(), 'glb-test-'));
  try {
    const malformed = Buffer.from(before);
    malformed.writeUInt32LE(malformed.length, 12);
    const invalid = join(directory, 'invalid.glb');
    writeFileSync(invalid, malformed);
    assert.throws(() => validateGlb(invalid), /chunk length/);
    assert.notEqual(run(['export'], { BLENDER_PATH: process.execPath }).status, 0);
    assert.deepEqual(readFileSync(path), before);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('real Blender watch exports after a source save and ignores outputs', { skip: process.env.RUN_BLENDER_INTEGRATION !== '1', timeout: 90000 }, async () => {
  const scene = fileURLToPath(new URL('blender/scenes/challenge-card.blend', root));
  const original = statSync(scene);
  const child = spawn(process.execPath, [fileURLToPath(cli), 'watch'], { cwd: fileURLToPath(root), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  let changed = false;
  try {
    await new Promise((yes, no) => {
      const timeout = setTimeout(() => no(new Error(`Watch timeout: ${output}`)), 75000);
      child.once('error', (error) => { clearTimeout(timeout); no(error); });
      child.once('exit', (code) => { clearTimeout(timeout); no(new Error(`Watcher exited ${code}: ${output}`)); });
      child.stderr.on('data', (chunk) => { output += chunk; });
      child.stdout.on('data', (chunk) => {
        output += chunk;
        const exports = (output.match(/published challenge-card/g) ?? []).length;
        if (exports === 1 && !changed) {
          changed = true;
          utimesSync(scene, original.atime, new Date());
        }
        if (exports === 2) {
          clearTimeout(timeout);
          yes();
        }
      });
    });
    await new Promise((yes) => setTimeout(yes, 1500));
    assert.equal((output.match(/published challenge-card/g) ?? []).length, 2);
    const manifest = JSON.parse(readFileSync(new URL('apps/web/public/models/manifest.json', root), 'utf8'));
    assert.match(manifest['challenge-card'].src, /^\/models\/challenge-card\.[a-f0-9]{16}\.glb$/);
  } finally {
    if (process.platform === 'win32') spawnSync('taskkill.exe', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    else child.kill('SIGTERM');
    utimesSync(scene, original.atime, original.mtime);
  }
});

test('real Blender texture optimization validates settings and preserves unrelated images', { skip: process.env.RUN_BLENDER_INTEGRATION !== '1', timeout: 30000 }, () => {
  const result = spawnSync(findBlender(), ['--disable-autoexec', '--background', '--factory-startup', '--python-exit-code', '1', '--python', fileURLToPath(new URL('blender/scripts/test_export_glb.py', root))], { encoding: 'utf8', windowsHide: true, timeout: 25000 });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /passed: settings validation/);
});
