'use server';

import { hasDatabaseUrl } from '@/lib/auth/prisma';
import { InvalidPasswordResetTokenError, resetPasswordWithToken } from '@/lib/auth/password-reset';
import { resetPasswordSchema } from '@/lib/auth/validation';

export type ResetPasswordActionState = {
  status: 'idle' | 'success' | 'error';
  message: string;
  errors?: Record<string, string>;
};

export async function resetPassword(
  rawToken: string,
  _previousState: ResetPasswordActionState,
  formData: FormData,
): Promise<ResetPasswordActionState> {
  const parsed = resetPasswordSchema.safeParse({
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  });

  if (!parsed.success) {
    const flattened = parsed.error.flatten().fieldErrors;
    return {
      status: 'error',
      message: 'راجع كلمة المرور وحاول مرة أخرى.',
      errors: Object.fromEntries(
        Object.entries(flattened).flatMap(([key, value]) => (value?.[0] ? [[key, value[0]]] : [])),
      ),
    };
  }

  if (!hasDatabaseUrl()) {
    return { status: 'error', message: 'خدمة إعادة التعيين غير متاحة حاليًا.' };
  }

  try {
    await resetPasswordWithToken(rawToken, parsed.data.password);
    return {
      status: 'success',
      message: 'تم تحديث كلمة المرور. يمكنك الآن تسجيل الدخول بالكلمة الجديدة.',
    };
  } catch (error) {
    if (error instanceof InvalidPasswordResetTokenError) {
      return { status: 'error', message: 'رابط الاستعادة غير صالح أو انتهت صلاحيته.' };
    }
    throw error;
  }
}
