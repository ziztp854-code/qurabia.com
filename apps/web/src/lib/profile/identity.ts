import { z } from 'zod';

const cleanText = (value: string) => value.normalize('NFC').trim();
const safeText = (value: string) =>
  !/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value);
export const profileIdentitySchema = z.object({
  displayName: z
    .string()
    .transform(cleanText)
    .pipe(
      z
        .string()
        .min(1, 'اكتب الاسم الذي سيظهر للأعضاء.')
        .max(80, 'الاسم لا يتجاوز ٨٠ حرفًا.')
        .refine(safeText, 'أزل الرموز غير المرئية من الاسم.'),
    ),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{3,24}$/, 'استخدم ٣ إلى ٢٤ حرفًا إنجليزيًا أو رقمًا أو شرطة سفلية.'),
  bio: z
    .string()
    .transform(cleanText)
    .pipe(
      z
        .string()
        .max(500, 'النبذة لا تتجاوز ٥٠٠ حرف.')
        .refine(
          (text) => safeText(text.replace(/\r?\n/g, '')),
          'أزل الرموز غير المرئية من النبذة.',
        ),
    ),
});

export type ProfileIdentityFields = z.infer<typeof profileIdentitySchema>;
export type ProfileIdentity = {
  displayName: string;
  username: string | null;
  bio: string;
  image: string | null;
};
export const PROFILE_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const PROFILE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
