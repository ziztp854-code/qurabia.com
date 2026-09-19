const fallbackPath = '/dashboard';

export function sanitizeCallbackPath(value: string | null | undefined, fallback = fallbackPath) {
  if (!value) {
    return fallback;
  }

  try {
    const decoded = decodeURIComponent(value);
    if (!decoded.startsWith('/') || decoded.startsWith('//') || decoded.includes('\\')) {
      return fallback;
    }

    const url = new URL(decoded, 'http://tahaddi.local');
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
