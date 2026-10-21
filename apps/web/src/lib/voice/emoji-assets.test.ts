import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { EMOJI_MAX_BYTES, normalizeEmoji } from './emoji-assets';
describe('WebP upload validation', () => {
  it('preserves animation, emits a static poster, and rejects excessive animation duration', async () => {
    const make = (color: string) =>
      sharp({ create: { width: 32, height: 32, channels: 4, background: color } })
        .png()
        .toBuffer();
    const frames = [await make('red'), await make('blue')];
    const bytes = await sharp(frames, { join: { animated: true } })
      .webp({ loop: 0, delay: [100, 100] })
      .toBuffer();
    const asset = await normalizeEmoji(bytes, 'image/webp');
    expect(asset.animated).toBe(true);
    expect((await sharp(asset.content, { animated: true }).metadata()).pages).toBe(2);
    expect((await sharp(asset.poster).metadata()).pages ?? 1).toBe(1);
    const tooLong = await sharp(frames, { join: { animated: true } })
      .webp({ delay: [4000, 4000] })
      .toBuffer();
    await expect(normalizeEmoji(tooLong, 'image/webp')).rejects.toThrow();
  });
  it('decodes and normalizes a valid static WebP and creates a still poster', async () => {
    const bytes = await sharp({
      create: { width: 32, height: 32, channels: 4, background: 'red' },
    })
      .webp()
      .toBuffer();
    const asset = await normalizeEmoji(bytes, 'image/webp');
    expect(asset.animated).toBe(false);
    expect((await sharp(asset.content).metadata()).format).toBe('webp');
    expect((await sharp(asset.poster).metadata()).width).toBe(32);
  });
  it('rejects spoofed, oversized and excessive-dimension assets', async () => {
    await expect(normalizeEmoji(Buffer.from('<svg/>'), 'image/webp')).rejects.toThrow();
    await expect(normalizeEmoji(Buffer.alloc(EMOJI_MAX_BYTES + 1), 'image/webp')).rejects.toThrow();
    const bytes = await sharp({
      create: { width: 257, height: 32, channels: 4, background: 'red' },
    })
      .webp()
      .toBuffer();
    await expect(normalizeEmoji(bytes, 'image/webp')).rejects.toThrow();
    await expect(normalizeEmoji(bytes, 'image/png')).rejects.toThrow();
  });
});
