import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../apps/web/package.json', import.meta.url));
const threeRoot = resolve(dirname(require.resolve('three')), '..');
const publicRoot = new URL('../apps/web/public/3d/', import.meta.url);

for (const [folder, files] of Object.entries({
  draco: ['draco_decoder.js', 'draco_decoder.wasm', 'draco_wasm_wrapper.js'],
  basis: ['basis_transcoder.js', 'basis_transcoder.wasm'],
})) {
  const destination = new URL(`${folder}/`, publicRoot);
  mkdirSync(destination, { recursive: true });
  for (const file of files) cpSync(join(threeRoot, 'examples', 'jsm', 'libs', folder === 'basis' ? 'basis' : 'draco/gltf', file), new URL(file, destination));
}
