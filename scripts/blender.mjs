import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, watch, writeFileSync } from 'node:fs';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scenesDir = join(root, 'blender/scenes');
const modelsDir = join(root, 'apps/web/public/models');
const defaultScene = join(scenesDir, 'challenge-card.blend');
const children = new Set();
let stopping = false;
const help = `Tahaddi Blender workflow (Blender 4.x / 5.x)
  pnpm blender:create:challenge-card -- [--force]
  pnpm blender:export -- [scene.blend | ranks/knight.blend]
  pnpm blender:export:all
  pnpm blender:watch
  pnpm blender:preview -- [--port 3000]
  pnpm dev:3d -- [--port 3000]
BLENDER_PATH overrides executable detection. Scenes must stay inside blender/scenes.
Use lowercase ASCII letters, digits, underscores and hyphens in path segments.`;

function fail(message) { throw new Error(message); }
function isFile(path) { try { return statSync(path).isFile(); } catch { return false; } }
function inside(base, path) {
  const rel = relative(base, path);
  return rel && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

export function findBlender() {
  if (process.env.BLENDER_PATH) {
    const configured = resolve(process.env.BLENDER_PATH);
    if (!isFile(configured)) fail(`BLENDER_PATH is not a file: ${configured}`);
    return configured;
  }
  const candidates = [];
  if (process.platform === 'win32') {
    for (const base of [join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Blender Foundation'), join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Blender Foundation')]) {
      if (!existsSync(base)) continue;
      for (const entry of readdirSync(base, { withFileTypes: true })) {
        if (entry.isDirectory()) candidates.push(join(base, entry.name, 'blender.exe'));
      }
    }
  } else if (process.platform === 'darwin') candidates.push('/Applications/Blender.app/Contents/MacOS/Blender');
  else candidates.push('/usr/bin/blender', '/usr/local/bin/blender', '/snap/bin/blender');
  const found = candidates.filter(isFile).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).at(-1);
  if (found) return found;
  const lookup = spawnSync(process.platform === 'win32' ? 'where.exe' : 'which', ['blender'], { encoding: 'utf8', windowsHide: true });
  const fromPath = lookup.status === 0 ? lookup.stdout.trim().split(/\r?\n/)[0] : '';
  if (fromPath && isFile(fromPath)) return fromPath;
  fail('Blender was not found. Install Blender 4.x/5.x or set BLENDER_PATH.');
}

export function resolveScene(input = defaultScene) {
  const candidate = isAbsolute(input) ? resolve(input) : /^blender[\\/]scenes[\\/]/.test(input) ? resolve(root, input) : resolve(scenesDir, input);
  if (!inside(scenesDir, candidate)) fail('Scene must stay inside blender/scenes.');
  const rel = relative(scenesDir, candidate).split(sep).join('/');
  if (!/^(?:[a-z0-9][a-z0-9_-]*\/)*[a-z0-9][a-z0-9_-]*\.blend$/.test(rel)) fail('Scene paths must use lowercase ASCII letters, digits, underscores and hyphens, ending in .blend.');
  if (!isFile(candidate)) fail(`Scene not found: ${relative(root, candidate)}`);
  if (!inside(realpathSync(scenesDir), realpathSync(candidate))) fail('Scene must stay inside blender/scenes (including symlinks).');
  return candidate;
}

function childProcess(executable, args, cwd = root) {
  const child = spawn(executable, args, { cwd, stdio: 'inherit', windowsHide: true, shell: false });
  children.add(child);
  child.once('exit', () => children.delete(child));
  child.once('error', () => children.delete(child));
  return child;
}
function waitFor(child, context) {
  return new Promise((yes, no) => {
    child.once('error', (error) => no(new Error(`Could not start ${context}: ${error.message}`)));
    child.once('exit', (code) => code === 0 ? yes() : no(new Error(`Blender exited with code ${code} (${context}).`)));
  });
}
async function runBlender(args, context) {
  if (stopping) fail('Blender workflow stopped.');
  console.log(`[blender] ${context}`);
  await waitFor(childProcess(findBlender(), ['--disable-autoexec', ...args]), context);
}

export function validateGlb(path) {
  const bytes = readFileSync(path);
  if (bytes.length < 20 || bytes.toString('ascii', 0, 4) !== 'glTF' || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) fail('Export has an invalid GLB v2 header.');
  let offset = 12;
  let document;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) fail('Truncated GLB chunk.');
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    if (length % 4 || offset + 8 + length > bytes.length) fail('Invalid GLB chunk length.');
    if (offset === 12) {
      if (type !== 0x4e4f534a) fail('GLB first chunk must be JSON.');
      document = JSON.parse(bytes.toString('utf8', offset + 8, offset + 8 + length));
    }
    offset += 8 + length;
  }
  if (document?.asset?.version !== '2.0' || !document.meshes?.length) fail('GLB must contain a glTF 2.0 mesh.');
  for (const item of [...(document.buffers ?? []), ...(document.images ?? [])]) {
    if (item.uri && !item.uri.startsWith('data:')) fail('GLB must embed its textures and buffers.');
  }
  return bytes;
}

function safeOutput(path) {
  if (!inside(modelsDir, path)) fail('Output must stay inside public/models.');
  let ancestor = path;
  while (!existsSync(ancestor)) ancestor = dirname(ancestor);
  if (ancestor !== modelsDir && !inside(realpathSync(modelsDir), realpathSync(ancestor))) fail('Output symlink escapes public/models.');
  return path;
}
function atomicWrite(path, bytes) {
  safeOutput(path);
  const temporary = `${path}.${randomUUID()}.tmp`;
  try { writeFileSync(temporary, bytes, { flag: 'wx' }); renameSync(temporary, path); }
  finally { rmSync(temporary, { force: true }); }
}
export async function exportScene(input) {
  const scene = resolveScene(input);
  const slug = relative(scenesDir, scene).split(sep).join('/').slice(0, -6);
  mkdirSync(modelsDir, { recursive: true });
  const output = safeOutput(join(modelsDir, `${slug}.glb`));
  mkdirSync(dirname(output), { recursive: true });
  const temporary = safeOutput(join(dirname(output), `export-${randomUUID()}.glb`));
  try {
    await runBlender(['--background', scene, '--python-exit-code', '1', '--python', join(root, 'blender/scripts/export_glb.py'), '--', '--output', temporary], relative(root, scene));
    const bytes = validateGlb(temporary);
    const version = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
    const hashed = safeOutput(join(modelsDir, `${slug}.${version}.glb`));
    const manifestPath = safeOutput(join(modelsDir, 'manifest.json'));
    const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
    if (!manifest || Array.isArray(manifest) || typeof manifest !== 'object') fail('Invalid models manifest.');
    if (!existsSync(hashed)) atomicWrite(hashed, bytes);
    atomicWrite(output, bytes);
    atomicWrite(manifestPath, `${JSON.stringify({ ...manifest, [slug]: { src: `/models/${slug}.${version}.glb`, version } }, null, 2)}\n`);
    console.log(`[blender] published ${slug} (${bytes.length} bytes, ${version})`);
  } finally { rmSync(temporary, { force: true }); }
}
async function createChallengeCard(force) {
  mkdirSync(scenesDir, { recursive: true });
  if (existsSync(defaultScene) && !force) fail('challenge-card.blend already exists. Use --force only to replace it.');
  await runBlender(['--background', '--factory-startup', '--python-exit-code', '1', '--python', join(root, 'blender/scripts/create_challenge_card.py'), '--', '--output', defaultScene, ...(force ? ['--force'] : [])], 'challenge-card source creation');
  await exportScene(defaultScene);
}
export function listScenes(directory = scenesDir) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listScenes(path) : extname(entry.name) === '.blend' ? [resolveScene(path)] : [];
  }).sort();
}
async function exportAll() {
  const scenes = listScenes();
  if (!scenes.length) fail('No .blend files found in blender/scenes.');
  for (const scene of scenes) await exportScene(scene);
}
async function watchScenes() {
  let queue = Promise.resolve();
  const timers = new Map();
  const watcher = watch(scenesDir, { recursive: true }, (_event, filename) => {
    if (!filename || extname(filename) !== '.blend') return;
    clearTimeout(timers.get(filename));
    timers.set(filename, setTimeout(() => {
      timers.delete(filename);
      queue = queue.then(() => stopping ? undefined : exportScene(filename)).catch((error) => console.error(`[blender] ${error.message}`));
    }, 500));
  });
  watcher.on('error', (error) => { console.error(`[blender] ${error.message}`); process.exitCode = 1; stop(); });
  function stop() { watcher.close(); for (const timer of timers.values()) clearTimeout(timer); }
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  queue = exportAll().catch((error) => console.error(`[blender] ${error.message}`));
  console.log('[blender] watching blender/scenes recursively (save to export)');
  await queue;
}
function stopChildren() {
  stopping = true;
  for (const child of children) {
    if (process.platform === 'win32' && child.pid) spawnSync('taskkill.exe', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    else child.kill('SIGTERM');
  }
}
async function preview(port, withWatcher) {
  const webRoot = join(root, 'apps/web');
  const require = createRequire(join(webRoot, 'package.json'));
  const web = childProcess(process.execPath, [require.resolve('next/dist/bin/next'), 'dev', '--port', port], webRoot);
  const processes = [waitFor(web, 'Next.js')];
  if (withWatcher) processes.push(waitFor(childProcess(process.execPath, [fileURLToPath(import.meta.url), 'watch']), 'Blender watcher'));
  try { await Promise.race(processes); } finally { stopChildren(); }
}
export async function main(argv) {
  const [command = 'export', ...args] = argv.filter((arg) => arg !== '--');
  if (args.includes('--help') || args.includes('-h') || command === '--help') return console.log(help);
  process.once('SIGINT', stopChildren);
  process.once('SIGTERM', stopChildren);
  if (command === 'export' && args.length <= 1) await exportScene(args[0]);
  else if (command === 'create' && (args.length === 0 || args.length === 1 && args[0] === '--force')) await createChallengeCard(args[0] === '--force');
  else if (command === 'export-all' && !args.length) await exportAll();
  else if (command === 'watch' && !args.length) await watchScenes();
  else if (['preview', 'dev'].includes(command)) {
    if (args.length && (args.length !== 2 || args[0] !== '--port' || !/^\d+$/.test(args[1]) || Number(args[1]) < 1 || Number(args[1]) > 65535)) fail('Use --port with a number from 1 to 65535.');
    await preview(args[1] ?? '3000', command === 'dev');
  } else fail(`Invalid command or arguments.\n${help}`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => { console.error(`[blender] ${error.message}`); process.exitCode = 1; });
}
