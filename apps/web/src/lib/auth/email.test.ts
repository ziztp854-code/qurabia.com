import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sendMock = vi.hoisted(() => vi.fn());

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

import { sendOnboardingEmail, sendWelcomeEmail } from './email';

describe('signup email delivery', () => {
  beforeEach(() => {
    vi.stubEnv('RESEND_API_KEY', 'test-key');
    vi.stubEnv('AUTH_EMAIL_FROM', 'Tahaddi <hello@example.com>');
    vi.stubEnv('AUTH_URL', 'https://qurabia.com');
    sendMock.mockResolvedValue({ data: { id: 'email_123' }, error: null });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('escapes user-provided names and uses a stable welcome idempotency key', async () => {
    await sendWelcomeEmail({
      id: 'user_123',
      email: 'player@example.com',
      name: '<img src=x onerror=alert(1)>',
    });

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'player@example.com',
        html: expect.not.stringContaining('<img'),
      }),
      { idempotencyKey: 'signup-welcome-user_123' },
    );
  });

  it('uses a separate idempotency key for the onboarding message', async () => {
    await sendOnboardingEmail({ id: 'user_123', email: 'player@example.com', name: null });

    expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({ subject: 'جاهز لأول تحدٍ؟' }), {
      idempotencyKey: 'signup-onboarding-user_123',
    });
  });
});
