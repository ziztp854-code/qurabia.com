import { createRequire } from 'node:module';
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// MapLibre 6 ESM workers import their shared sibling. Copy both from the installed
// host dependency on every dev/build, as recommended for Next's two bundlers.
const web = fileURLToPath(new URL('../apps/web/', import.meta.url));
const require = createRequire(join(web, 'package.json'));
const sdk = dirname(require.resolve('maplibre-gl/package.json'));
const output = join(web, 'public', 'maplibre');
mkdirSync(output, { recursive: true });
for (const file of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
  copyFileSync(join(sdk, 'dist', file), join(output, file));
}
copyFileSync(join(sdk, 'LICENSE.txt'), join(output, 'LICENSE.txt'));
// Reuse the site's existing Cairo font in native MapLibre 6 Arabic labels.
const cairo = dirname(require.resolve('@fontsource-variable/cairo/package.json'));
for (const subset of ['arabic', 'latin']) {
  const name = `cairo-${subset}-wght-normal.woff2`;
  copyFileSync(join(cairo, 'files', name), join(output, name));
}
copyFileSync(join(cairo, 'LICENSE'), join(output, 'Cairo-LICENSE.txt'));
console.log('Prepared matching MapLibre worker and shared module for the host.');
