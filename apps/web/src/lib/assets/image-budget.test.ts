import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const publicAsset = (path: string) => resolve(process.cwd(), 'public', path);

describe('critical image budgets', () => {
  it('keeps the home trophy below 350 KiB', () => {
    expect(statSync(publicAsset('home/tahaddi-trophy-ornate-transparent.webp')).size).toBeLessThan(
      350 * 1024,
    );
  });

  it('keeps the quote game catalog art below 200 KiB', () => {
    expect(statSync(publicAsset('game-art/catalog-v2/quote-master.webp')).size).toBeLessThan(
      200 * 1024,
    );
  });
});
