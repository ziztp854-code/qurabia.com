import * as Sentry from '@sentry/nextjs';
import { createSentryOptions } from './src/lib/observability/sentry-options';

const options = createSentryOptions({
  ...process.env,
  NEXT_PUBLIC_SENTRY_RELEASE: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
});

if (options.enabled) {
  Sentry.init(options);
}
