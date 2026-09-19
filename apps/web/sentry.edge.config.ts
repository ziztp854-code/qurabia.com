import * as Sentry from '@sentry/nextjs';
import { createSentryOptions } from './src/lib/observability/sentry-options';

const options = createSentryOptions(process.env);

if (options.enabled) {
  Sentry.init(options);
}
