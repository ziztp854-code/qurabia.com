import { describe, expect, it } from 'vitest';
import { recoverySchema, resetPasswordSchema, signInSchema, signUpSchema } from './validation';

describe('auth validation', () => {
  it('normalizes email at auth boundaries', () => {
    const parsed = signInSchema.parse({
      email: ' USER@Example.COM ',
      password: 'anything',
    });

    expect(parsed.email).toBe('user@example.com');
  });

  it('requires stronger passwords for registration', () => {
    expect(
      signUpSchema.safeParse({ name: 'سارة', email: 'sara@example.com', password: 'short' })
        .success,
    ).toBe(false);
    expect(
      signUpSchema.safeParse({ name: 'سارة', email: 'sara@example.com', password: 'StrongPass123' })
        .success,
    ).toBe(true);
  });

  it('keeps recovery input generic and email-only', () => {
    expect(recoverySchema.safeParse({ email: 'bad-email' }).success).toBe(false);
    expect(recoverySchema.safeParse({ email: 'player@example.com' }).success).toBe(true);
  });

  it('requires matching strong passwords during reset', () => {
    expect(
      resetPasswordSchema.safeParse({
        password: 'StrongPass123',
        confirmPassword: 'DifferentPass123',
      }).success,
    ).toBe(false);
    expect(
      resetPasswordSchema.safeParse({
        password: 'StrongPass123',
        confirmPassword: 'StrongPass123',
      }).success,
    ).toBe(true);
  });
});
