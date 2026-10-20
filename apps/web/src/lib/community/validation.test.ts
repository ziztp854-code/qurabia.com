import { describe, expect, it } from 'vitest';
import {
  adminCommandSchema,
  isSensitiveBadge,
  profilePatchSchema,
  safeImageUrl,
  validRaster,
} from './validation';
describe('community input boundaries', () => {
  it('rejects account/role/XP injection and normalizes usernames', () => {
    for (const input of [{ userId: 'other' }, { role: 'OWNER' }, { xp: 99999 }])
      expect(profilePatchSchema.safeParse(input).success).toBe(false);
    expect(profilePatchSchema.parse({ username: '  Player_1 ' }).username).toBe('player_1');
    expect(profilePatchSchema.safeParse({ username: '<script>' }).success).toBe(false);
  });
  it('rejects unsafe image URLs and uploaded scripts', () => {
    for (const value of [
      'javascript:alert(1)',
      '//evil.test/x.png',
      'https://localhost/x.png',
      '/profile/../secret.png',
      'data:image/svg+xml,<svg/>',
      'https://example.test/x.svg',
    ])
      expect(safeImageUrl(value)).toBe(false);
    expect(safeImageUrl('/profile/badge-owner.png')).toBe(true);
    expect(safeImageUrl('https://images.example.test/avatar.webp')).toBe(true);
  });
  it('accepts bounded PNG and rejects truncated or huge images', () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=',
      'base64',
    );
    expect(validRaster(png, 'png')).toBe(true);
    expect(validRaster(png.subarray(0, 12), 'png')).toBe(false);
    const giant = Buffer.from(png);
    giant.writeUInt32BE(99999, 16);
    expect(validRaster(giant, 'png')).toBe(false);
  });
  it('guards administrative categories/names even when caller unsets sensitivity', () => {
    expect(isSensitiveBadge({ category: 'ADMIN', name: 'اسم', sensitive: false })).toBe(true);
    expect(isSensitiveBadge({ category: 'COMMUNITY', name: 'مشرف المنصة', sensitive: false })).toBe(
      true,
    );
    expect(isSensitiveBadge({ category: 'COMMUNITY', name: 'Supporter', sensitive: false })).toBe(
      false,
    );
  });
  it('rejects arbitrary effect tokens and expired grants', () => {
    expect(
      adminCommandSchema.safeParse({
        operation: 'saveCosmetic',
        id: 'custom-effect',
        name: 'Effect',
        description: '',
        kind: 'EFFECT',
        tier: 'gold',
        token: 'javascript',
      }).success,
    ).toBe(false);
    expect(
      adminCommandSchema.safeParse({
        operation: 'grantBadge',
        accountNumber: 123456789,
        badgeId: 'gold-member',
        expiresAt: '2000-01-01T00:00:00.000Z',
      }).success,
    ).toBe(false);
  });
});
