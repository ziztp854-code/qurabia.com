// Reuse the site's bounded JSON reader, origin guard and safe error envelope.
export {
  assertSameOrigin,
  readCommandBody,
  stableFingerprint,
  jsonSuccess,
  jsonFailure,
  KingdomsHttpError as AlfazaaHttpError,
} from '@/lib/kingdoms/http';
