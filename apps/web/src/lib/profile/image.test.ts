import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { normalizeProfileImage, readProfileForm } from './image';
import { PROFILE_IMAGE_MAX_BYTES } from './identity';
describe('profile image processing', () => {
  it('decodes, squares and re-encodes as WebP without metadata', async () => {
    const original = await sharp({
      create: { width: 640, height: 900, channels: 3, background: 'white' },
    })
      .jpeg()
      .withMetadata()
      .toBuffer();
    const result = await normalizeProfileImage(original, 'image/jpeg');
    const meta = await sharp(result).metadata();
    expect(meta).toMatchObject({ format: 'webp', width: 512, height: 512 });
    expect(meta.exif).toBeUndefined();
    expect(result.length).toBeLessThan(200_000);
  });
  it('rejects oversized, mislabeled, corrupt and SVG content', async () => {
    await expect(
      normalizeProfileImage(Buffer.alloc(PROFILE_IMAGE_MAX_BYTES + 1), 'image/png'),
    ).rejects.toMatchObject({ status: 413 });
    await expect(
      normalizeProfileImage(Buffer.from('<svg/>'), 'image/svg+xml'),
    ).rejects.toMatchObject({ status: 415 });
    await expect(normalizeProfileImage(Buffer.from('corrupt'), 'image/png')).rejects.toMatchObject({
      status: 400,
    });
    const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'white' } })
      .png()
      .toBuffer();
    await expect(normalizeProfileImage(png, 'image/jpeg')).rejects.toMatchObject({ status: 400 });
  });
  it('enforces the body limit even without content-length', async () => {
    const req = new Request('http://localhost/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'multipart/form-data; boundary=test' },
      body: Buffer.alloc(PROFILE_IMAGE_MAX_BYTES + 40_000),
    });
    await expect(readProfileForm(req)).rejects.toMatchObject({ status: 413 });
  });
});
