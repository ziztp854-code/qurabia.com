import { z } from 'zod';

export const normalizedEmail = z
  .string()
  .trim()
  .toLowerCase()
  .email('أدخل بريدًا إلكترونيًا صحيحًا')
  .max(320, 'البريد الإلكتروني طويل جدًا');

export const passwordSchema = z
  .string()
  .min(10, 'كلمة المرور يجب أن تكون 10 أحرف على الأقل')
  .max(128, 'كلمة المرور طويلة جدًا')
  .regex(/[A-Za-z]/, 'أضف حرفًا واحدًا على الأقل')
  .regex(/\d/, 'أضف رقمًا واحدًا على الأقل');

export const signInSchema = z.object({
  email: normalizedEmail,
  password: z.string().min(1, 'أدخل كلمة المرور').max(128),
});

export const signUpSchema = z.object({
  name: z.string().trim().min(2, 'أدخل اسمًا من حرفين على الأقل').max(120, 'الاسم طويل جدًا'),
  email: normalizedEmail,
  password: passwordSchema,
});

export const recoverySchema = z.object({
  email: normalizedEmail,
});

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ['confirmPassword'],
    message: 'كلمتا المرور غير متطابقتين',
  });

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type RecoveryInput = z.infer<typeof recoverySchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
