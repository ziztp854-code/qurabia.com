'use server';

import { randomUUID } from 'node:crypto';
import { planDefinition, isPlanCode } from '@tahaddi/domain';
import { headers } from 'next/headers';
import { z } from 'zod';
import { getPrismaClient, hasDatabaseUrl } from '@/lib/auth/prisma';
import { checkRateLimit } from '@/lib/auth/rate-limit';
import { hashPassword } from '@/lib/auth/password';
import { signUpSchema } from '@/lib/auth/validation';
import type { AuthActionState } from '../actions';

const stampRegistrationSchema = signUpSchema.extend({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{6,32}$/, 'أدخل رمز ختم صحيحًا'),
});

const registrationUnavailable =
  'تعذّر التسجيل بهذه البيانات. تحقق من الختم أو سجّل دخولك إن كان لديك حساب.';

async function requestIp() {
  const requestHeaders = await headers();
  return requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

export async function registerWithStamp(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = stampRegistrationSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    password: formData.get('password'),
    code: formData.get('code'),
  });
  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    return {
      status: 'error',
      message: 'راجع الحقول وحاول مرة أخرى.',
      errors: Object.fromEntries(
        Object.entries(errors).flatMap(([key, values]) => (values?.[0] ? [[key, values[0]]] : [])),
      ),
    };
  }
  if (!hasDatabaseUrl()) {
    return { status: 'error', message: 'خدمة التسجيل غير متاحة حاليًا. حاول لاحقًا.' };
  }
  const ip = await requestIp();
  if (
    !(await checkRateLimit(`signup-ip:${ip}`, 5)) ||
    !(await checkRateLimit(`signup:${ip}:${parsed.data.email}`, 5)) ||
    !(await checkRateLimit(`signup-stamp-email:${parsed.data.email}`, 5))
  ) {
    return { status: 'error', message: 'تعذّر إكمال التسجيل الآن. حاول لاحقًا.' };
  }

  const { name, email, password, code } = parsed.data;
  const passwordHash = await hashPassword(password);
  try {
    const result = await getPrismaClient().$transaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: { email }, select: { id: true } });
      const stamp = await tx.subscriptionStamp.findUnique({ where: { code } });
      if (
        existing ||
        !stamp ||
        stamp.status !== 'UNUSED' ||
        !isPlanCode(stamp.planCode) ||
        stamp.durationDays < 1 ||
        stamp.durationDays > 365
      ) {
        return { ok: false as const, message: registrationUnavailable };
      }

      const userId = randomUUID();
      const now = new Date();
      const claimed = await tx.subscriptionStamp.updateMany({
        where: { id: stamp.id, status: 'UNUSED' },
        data: { status: 'REDEEMED', redeemedBy: userId, redeemedAt: now },
      });
      if (claimed.count !== 1) return { ok: false as const, message: registrationUnavailable };

      await tx.user.create({
        data: {
          id: userId,
          name,
          email,
          passwordHash,
          role: 'USER',
          status: 'ACTIVE',
          profile: { create: { displayName: name } },
        },
      });
      const expiresAt = new Date(now.getTime() + stamp.durationDays * 24 * 60 * 60 * 1_000);
      await tx.userSubscription.create({
        data: {
          userId,
          stampId: stamp.id,
          planCode: stamp.planCode,
          planVersion: stamp.planVersion,
          status: 'ACTIVE',
          source: 'STAMP',
          startedAt: now,
          expiresAt,
        },
      });
      return { ok: true as const, planCode: stamp.planCode };
    });

    return result.ok
      ? {
          status: 'success',
          message: `تم إنشاء حسابك وتفعيل رتبة «${planDefinition(result.planCode).name}». سجّل دخولك بالبريد وكلمة المرور.`,
        }
      : { status: 'error', message: result.message };
  } catch (error) {
    if (error instanceof Object && 'code' in error && error.code === 'P2002') {
      return {
        status: 'error',
        message: registrationUnavailable,
      };
    }
    throw error;
  }
}
