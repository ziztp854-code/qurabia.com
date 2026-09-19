import { sleep } from 'workflow';
import { sendOnboardingEmail, sendWelcomeEmail } from './user-signup.steps';

export type SignupWorkflowUser = {
  id: string;
  email: string;
  name: string | null;
};

export async function handleUserSignup(user: SignupWorkflowUser) {
  'use workflow';

  await sendWelcomeEmail(user);
  await sleep('5s');
  await sendOnboardingEmail(user);

  return { userId: user.id, status: 'onboarded' as const };
}
