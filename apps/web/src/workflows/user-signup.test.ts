import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sleepMock, sendWelcomeEmailMock, sendOnboardingEmailMock } = vi.hoisted(() => ({
  sleepMock: vi.fn(),
  sendWelcomeEmailMock: vi.fn(),
  sendOnboardingEmailMock: vi.fn(),
}));

vi.mock('workflow', () => ({ sleep: sleepMock }));
vi.mock('./user-signup.steps', () => ({
  sendWelcomeEmail: sendWelcomeEmailMock,
  sendOnboardingEmail: sendOnboardingEmailMock,
}));

import { handleUserSignup } from './user-signup';

describe('handleUserSignup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends both onboarding messages around a durable delay', async () => {
    const user = { id: 'user_123', email: 'player@example.com', name: 'لاعب' };

    await expect(handleUserSignup(user)).resolves.toEqual({
      userId: user.id,
      status: 'onboarded',
    });

    expect(sendWelcomeEmailMock).toHaveBeenCalledWith(user);
    expect(sleepMock).toHaveBeenCalledWith('5s');
    expect(sendOnboardingEmailMock).toHaveBeenCalledWith(user);
    expect(sendWelcomeEmailMock.mock.invocationCallOrder[0]).toBeLessThan(
      sleepMock.mock.invocationCallOrder[0],
    );
    expect(sleepMock.mock.invocationCallOrder[0]).toBeLessThan(
      sendOnboardingEmailMock.mock.invocationCallOrder[0],
    );
  });
});
