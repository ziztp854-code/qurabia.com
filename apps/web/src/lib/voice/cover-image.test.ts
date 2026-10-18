import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { normalizeVoiceCover, VOICE_COVER_MAX_BYTES } from './cover-image';
describe('voice cover processing', () => {
  it('decodes and re-encodes an uploaded raster image to bounded WebP', async () => {
    const input = await sharp({
      create: { width: 1600, height: 900, channels: 3, background: '#b28549' },
    })
      .png()
      .toBuffer();
    const output = await normalizeVoiceCover(input, 'image/png');
    const meta = await sharp(output).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(1280);
    expect(meta.height).toBe(720);
    expect(meta.exif).toBeUndefined();
  });
  it('rejects disguised SVG, corrupt data and oversized bodies', async () => {
    await expect(
      normalizeVoiceCover(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/png'),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      normalizeVoiceCover(Buffer.from('not a photo'), 'image/jpeg'),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      normalizeVoiceCover(Buffer.alloc(VOICE_COVER_MAX_BYTES + 1), 'image/png'),
    ).rejects.toMatchObject({ status: 413 });
  });
  it('requires a supported type matching the decoded format', async () => {
    const input = await sharp({
      create: { width: 50, height: 50, channels: 3, background: '#ab935b' },
    })
      .png()
      .toBuffer();
    await expect(normalizeVoiceCover(input, 'image/jpeg')).rejects.toMatchObject({ status: 400 });
    await expect(normalizeVoiceCover(input, 'image/svg+xml')).rejects.toMatchObject({
      status: 415,
    });
  });
});
