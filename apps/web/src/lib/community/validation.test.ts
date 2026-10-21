import { describe, expect, it } from 'vitest';
import {
  adminCommandSchema,
  isSensitiveBadge,
  profilePatchSchema,
  safeImageUrl,
  validRaster,
} from './validation';
describe('community input boundaries', () => {
  it('accepts reserved grant targets and canonicalizes retired numbers without accepting other short IDs', () => {
    const grant = (accountNumber: number) => ({
      operation: 'grantBadge',
      accountNumber,
      badgeId: 'gold-member',
    });
    for (const accountNumber of [1, 2, 78, 123456789])
      expect(adminCommandSchema.parse(grant(accountNumber))).toMatchObject({ accountNumber });
    expect(adminCommandSchema.parse(grant(123456800))).toMatchObject({ accountNumber: 2 });
    expect(adminCommandSchema.parse(grant(123456821))).toMatchObject({ accountNumber: 78 });
    for (const accountNumber of [0, 3, 77, 79, 2.5, 99999999, 1000000000])
      expect(adminCommandSchema.safeParse(grant(accountNumber)).success).toBe(false);
  });
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
