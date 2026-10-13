// Reuse Next's existing sharp dependency; never download, upscale or replace the source.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const requireWeb = createRequire(path.join(root, 'apps/web/package.json'));
const sharp = requireWeb(createRequire(requireWeb.resolve('next/package.json')).resolve('sharp'));
const directory = path.join(root, 'apps/web/public/game-art/kingdoms/city-scenes');
const source = path.join(directory, 'market.webp');
const bytes = await readFile(source);
const metadata = await sharp(bytes).metadata();
const renditions = [];
for (const width of [768, 1280, 1672]) {
  if (width > metadata.width) throw new Error('Market renditions must never upscale.');
  for (const format of ['webp', 'avif']) {
    const filename = `market-${width}.${format}`;
    const pipeline = sharp(bytes).resize({ width, withoutEnlargement: true });
    await pipeline[format]({ quality: format === 'avif' ? 65 : 86 }).toFile(path.join(directory, filename));
    const result = await sharp(path.join(directory, filename)).metadata();
    renditions.push({ filename, width: result.width, height: result.height, bytes: (await stat(path.join(directory, filename))).size });
  }
}
const manifest = { source: 'market.webp', width: metadata.width, height: metadata.height, bytes: bytes.length, note: 'Derived from existing WebP, no new detail or resolution added; visually review encoding.', renditions };
await writeFile(path.join(directory, 'market-renditions.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify(manifest, null, 2));
