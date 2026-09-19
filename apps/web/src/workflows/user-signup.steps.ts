import {
  sendOnboardingEmail as deliverOnboardingEmail,
  sendWelcomeEmail as deliverWelcomeEmail,
} from '@/lib/auth/email';
import type { SignupWorkflowUser } from './user-signup';

export async function sendWelcomeEmail(user: SignupWorkflowUser) {
  'use step';

  await deliverWelcomeEmail(user);
}

export async function sendOnboardingEmail(user: SignupWorkflowUser) {
  'use step';

  await deliverOnboardingEmail(user);
}
