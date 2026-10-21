import { z } from 'zod';
import { canonicalAccountNumber, PUBLIC_ACCOUNT_NUMBER_PATTERN } from '@/lib/account-number';
import { ENTRANCE_TIERS } from './contracts';
import { profileIdentitySchema } from '@/lib/profile/identity';

const slug = z.string().regex(/^[a-z][a-z0-9-]{1,79}$/);
export const nullableId = slug.nullable();
export function safeImageUrl(value: string): boolean {
  if (value.length > 2048 && !value.startsWith('data:')) return false;
  if (
    /^\/api\/community\/assets\/(?:badge|cosmetic)\/[a-z][a-z0-9-]{1,79}\?v=\d{1,16}$/.test(value)
  )
    return true;
  if (/^\/api\/profile\/avatar\/[a-zA-Z0-9_-]+(?:\?v=[a-zA-Z0-9_-]+)?$/.test(value)) return true;
  if (value.startsWith('/'))
    return (
      /^\/(?:profile|ranks|uploads\/community)\/[a-zA-Z0-9/_.-]+\.(?:png|webp|jpg|jpeg)$/.test(
        value,
      ) && !value.includes('..')
    );
  if (value.startsWith('data:')) {
    const match = /^data:image\/(png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
    if (!match || value.length > 140000) return false;
    const bytes = Buffer.from(match[2]!, 'base64');
    return validRaster(bytes, match[1]!);
  }
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      !/^(?:localhost|.*\.local|127\..*|0\..*|10\..*|192\.168\..*|\[.*\])$/i.test(url.hostname) &&
      (/\.(?:png|webp|jpg|jpeg)$/i.test(url.pathname) ||
        url.hostname === 'avatars.githubusercontent.com' ||
        url.hostname.endsWith('.googleusercontent.com'))
    );
  } catch {
    return false;
  }
}
export function validRaster(bytes: Uint8Array, type: string): boolean {
  if (bytes.length < 30 || bytes.length > 100000) return false;
  const data = Buffer.from(bytes);
  let width = 0,
    height = 0;
  if (type === 'png') {
    if (
      data.length < 45 ||
      !data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
      data.readUInt32BE(8) !== 13 ||
      data.subarray(12, 16).toString() !== 'IHDR' ||
      data.subarray(data.length - 8, data.length - 4).toString() !== 'IEND'
    )
      return false;
    width = data.readUInt32BE(16);
    height = data.readUInt32BE(20);
  } else if (type === 'webp') {
    if (
      data.subarray(0, 4).toString() !== 'RIFF' ||
      data.subarray(8, 12).toString() !== 'WEBP' ||
      data.readUInt32LE(4) !== data.length - 8
    )
      return false;
    const chunk = data.subarray(12, 16).toString();
    if (chunk === 'VP8X') {
      width = 1 + data.readUIntLE(24, 3);
      height = 1 + data.readUIntLE(27, 3);
    } else if (chunk === 'VP8L' && data[20] === 47) {
      const bits = data.readUInt32LE(21);
      width = 1 + (bits & 16383);
      height = 1 + ((bits >>> 14) & 16383);
    } else if (chunk === 'VP8 ' && data.subarray(23, 26).equals(Buffer.from([157, 1, 42]))) {
      width = data.readUInt16LE(26) & 16383;
      height = data.readUInt16LE(28) & 16383;
    } else return false;
  } else return false;
  return width > 0 && height > 0 && width <= 2048 && height <= 2048;
}
const image = z
  .string()
  .max(140000)
  .refine(safeImageUrl, 'Use a safe PNG, WebP or JPEG image URL')
  .nullable();
export const appearanceSchema = z
  .object({
    frameId: nullableId,
    effectId: nullableId,
    primaryBadgeId: nullableId,
    nameCardId: nullableId,
    backgroundId: nullableId,
    glowId: nullableId,
  })
  .strict();
export const profilePatchSchema = z
  .object({
    displayName: profileIdentitySchema.shape.displayName.optional(),
    username: profileIdentitySchema.shape.username.nullable().optional(),
    bio: profileIdentitySchema.shape.bio.nullable().optional(),
    avatarUrl: image.optional(),
    coverUrl: image.optional(),
    visibility: z.enum(['PUBLIC', 'MEMBERS', 'PRIVATE']).optional(),
    showRooms: z.boolean().optional(),
    showCollection: z.boolean().optional(),
    appearance: appearanceSchema.optional(),
    entranceEnabled: z.boolean().optional(),
    entranceSound: z.boolean().optional(),
    reduceEffects: z.boolean().optional(),
  })
  .strict();
export const badgeSchema = z
  .object({
    operation: z.literal('saveBadge'),
    id: slug,
    name: z.string().trim().min(2).max(80),
    description: z.string().trim().max(500),
    category: z.enum(['ADMIN', 'DISTINCTION', 'ACHIEVEMENT', 'COMMUNITY']),
    rarity: z.enum(['common', 'rare', 'epic', 'legendary']),
    assetUrl: image.default(null),
    sensitive: z.boolean().default(false),
    archived: z.boolean().default(false),
    effectId: nullableId.default(null),
    frameId: nullableId.default(null),
  })
  .strict();
export const cosmeticSchema = z
  .object({
    operation: z.literal('saveCosmetic'),
    id: slug,
    name: z.string().trim().min(2).max(80),
    description: z.string().trim().max(500),
    kind: z.enum(['FRAME', 'EFFECT', 'NAME_CARD', 'BACKGROUND', 'GLOW']),
    tier: z.enum(ENTRANCE_TIERS),
    token: z.enum(['neutral', 'silver', 'gold', 'diamond', 'royal', 'legend']),
    assetUrl: image.default(null),
    free: z.boolean().default(false),
    archived: z.boolean().default(false),
  })
  .strict();
const grantSchema = z
  .object({
    operation: z.enum(['grantBadge', 'revokeBadge', 'grantCosmetic', 'revokeCosmetic']),
    accountNumber: z
      .number()
      .int()
      .refine((n) => PUBLIC_ACCOUNT_NUMBER_PATTERN.test(String(n)))
      .transform(canonicalAccountNumber),
    badgeId: slug.optional(),
    cosmeticId: slug.optional(),
    expiresAt: z.iso.datetime().nullable().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const badge = value.operation.endsWith('Badge');
    if (badge ? !value.badgeId || value.cosmeticId : !value.cosmeticId || value.badgeId)
      ctx.addIssue({ code: 'custom', message: 'Choose the correct grant item' });
    if (value.expiresAt && new Date(value.expiresAt).getTime() <= Date.now())
      ctx.addIssue({ code: 'custom', message: 'Expiry must be in the future' });
  });
export const adminCommandSchema = z.union([badgeSchema, cosmeticSchema, grantSchema]);
export function isSensitiveBadge(badge: { category: string; sensitive: boolean; name: string }) {
  return (
    badge.category === 'ADMIN' ||
    badge.sensitive ||
    /مؤسس|مدير|مشرف|founder|admin|moderator/i.test(badge.name)
  );
}
