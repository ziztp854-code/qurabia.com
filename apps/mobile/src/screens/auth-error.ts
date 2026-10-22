import { ApiError } from '../auth/http-client';

export type LoginFailureKind = 'credentials' | 'network' | 'timeout' | 'server' |
  'rate-limit' | 'access-denied' | 'csrf' | 'session' | 'storage' |
  'protocol' | 'cancelled' | 'busy' | 'unknown';
export type LoginFailure = { kind: LoginFailureKind; message: string };
const failure = (kind: LoginFailureKind, message: string): LoginFailure => ({ kind, message });

/** Never display native exception text, callback URLs, response bodies or credential data. */
export function presentLoginError(error: unknown): LoginFailure {
  if (!(error instanceof ApiError))
    return failure('unknown', 'تعذّر إكمال تسجيل الدخول. حاول مجددًا، وتواصل مع الدعم إذا استمرت المشكلة.');
  if (error.status >= 500 || error.code === 'AUTH_SERVER_ERROR')
    return failure('server', 'خدمة تسجيل الدخول تواجه مشكلة حاليًا. حاول لاحقًا.');
  if (error.status === 429 || error.code === 'RATE_LIMIT' || error.code === 'RATE_LIMITED')
    return failure('rate-limit', 'محاولات كثيرة. انتظر قليلًا ثم حاول مجددًا.');
  switch (error.code) {
    case 'INVALID_CREDENTIALS':
      if (error.status === 400)
        return failure('credentials', 'أدخل بريدًا إلكترونيًا صحيحًا وكلمة مرور، ثم أعد المحاولة.');
      // CredentialsSignin also covers server policy and throttling.
      return failure('credentials', 'لم يقبل الخادم تسجيل الدخول بهذه البيانات. راجع البريد وكلمة المرور، أو حاول لاحقًا.');
    case 'AUTH_ACCESS_DENIED':
      return failure('access-denied', 'لم يسمح الخادم بإكمال تسجيل الدخول. حاول لاحقًا، وتواصل مع الدعم إذا استمر الرفض.');
    case 'NETWORK':
      return failure('network', 'تعذّر الوصول إلى خدمة تسجيل الدخول. تحقق من اتصال الإنترنت ثم حاول مجددًا.');
    case 'TIMEOUT':
      return failure('timeout', 'انتهت مهلة تسجيل الدخول. تحقق من الاتصال ثم أعد المحاولة.');
    case 'AUTH_CSRF_REJECTED':
    case 'CSRF_UNAVAILABLE':
      return failure('csrf', 'تعذّر بدء جلسة دخول آمنة. أعد المحاولة، وحدّث التطبيق إذا استمرت المشكلة.');
    case 'SESSION_NOT_ESTABLISHED':
      return failure('session', 'لم تُنشأ جلسة الدخول على هذا الجهاز. أعد تسجيل الدخول، وحدّث التطبيق إذا تكرر ذلك.');
    case 'STALE_SESSION':
    case 'SESSION_REVOKED':
      return failure('session', 'تغيّرت جلسة الدخول أو انتهت صلاحيتها. أعد تسجيل الدخول.');
    case 'SECURE_STORAGE':
      return failure('storage', 'تعذّر حفظ جلسة الدخول بأمان على الجهاز. تحقق من إعدادات الجهاز ثم حاول مجددًا.');
    case 'INVALID_RESPONSE':
    case 'UNEXPECTED_REDIRECT':
    case 'UNTRUSTED_URL':
      return failure('protocol', 'استجابة تسجيل الدخول غير متوافقة مع التطبيق. حدّث التطبيق، أو تواصل مع الدعم إذا استمرت المشكلة.');
    case 'ABORTED':
      return failure('cancelled', 'أُلغي تسجيل الدخول. يمكنك المحاولة مجددًا.');
    case 'AUTH_BUSY':
      return failure('busy', 'انتظر اكتمال عملية تسجيل الدخول الحالية.');
    default:
      return failure('unknown', 'تعذّر إكمال تسجيل الدخول. حاول مجددًا، وتواصل مع الدعم إذا استمرت المشكلة.');
  }
}

export function presentConnectionError(error: unknown): string {
  const kind = presentLoginError(error).kind;
  if (kind === 'network') return 'تعذّر الوصول إلى الخادم. تحقق من اتصال الإنترنت ثم أعد الفحص.';
  if (kind === 'timeout') return 'انتهت مهلة التحقق من الخادم. تحقق من الاتصال ثم أعد الفحص.';
  if (kind === 'server') return 'الخادم أعاد خطأً أثناء فحص الجلسة. حاول لاحقًا.';
  return 'لم يكتمل التحقق من جلسة الدخول على الخادم. أعد الفحص، وحدّث التطبيق إذا استمرت المشكلة.';
}

/** AuthSnapshot carries a string: allow only known local recovery notices. */
export function presentSessionNotice(message: string | null): string | null {
  if (!message) return null;
  const allowed = new Set([
    'انتهت الجلسة. سجّل الدخول مجددًا.',
    'تعذّر حذف الجلسة المحفوظة بأمان. أعد محاولة تسجيل الخروج.',
    'تم الخروج من هذا الجهاز؛ تعذّر تأكيد طلب الخروج على الخادم.',
    'تعذّر حفظ الجلسة بأمان. حاول مجددًا.',
  ]);
  return allowed.has(message) ? message : 'تعذّر استعادة جلسة الدخول. حاول تسجيل الدخول مجددًا.';
}
