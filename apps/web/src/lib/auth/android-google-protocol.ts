export const androidGoogleProvider = 'android-google-handoff';
export const androidGoogleStart = '/auth/android-google/start/';
export const androidGoogleReturn = '/auth/android-google/return/';
export const androidGoogleFinish = '/auth/android-google/finish/';

export function isAndroidGoogleValue(input: unknown): input is string {
  return typeof input === 'string' && /^[A-Za-z0-9_-]{43}$/u.test(input);
}

export function androidGoogleReturnIntent(state: string, code: string) {
  if (!isAndroidGoogleValue(state) || !isAndroidGoogleValue(code)) {
    throw new Error('Invalid Android Google return');
  }
  // Chrome targets the app package explicitly when the user presses Return.
  return `intent://google/return?state=${state}&code=${code}#Intent;scheme=com.qurabia.tahaddi.oauth;package=com.qurabia.tahaddi;end`;
}
