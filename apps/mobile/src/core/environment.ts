const DEFAULT_PUBLIC_ORIGIN = 'https://qurabia.com';
const DEFAULT_REALTIME_ORIGIN = 'https://realtime.qurabia.com';

type MobileEnvironmentInput = {
  EXPO_PUBLIC_API_URL?: string;
  EXPO_PUBLIC_REALTIME_URL?: string;
};

type MobileEnvironmentOptions = {
  allowInsecureLocalhost?: boolean;
};

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]']);

function resolveHttpOrigin(
  value: string | undefined,
  name: string,
  options: MobileEnvironmentOptions,
) {
  const candidate = value?.trim() || DEFAULT_PUBLIC_ORIGIN;

  try {
    const url = new URL(candidate);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      throw new Error('invalid origin');
    }

    if (
      url.protocol === 'http:' &&
      !(options.allowInsecureLocalhost && LOOPBACK_HOSTS.has(url.hostname))
    ) {
      throw new Error('insecure origin');
    }

    return url.origin;
  } catch {
    throw new Error(`${name} must be a valid HTTP(S) origin.`);
  }
}

export function resolveMobileEnvironment(
  input: MobileEnvironmentInput,
  options: MobileEnvironmentOptions = {},
) {
  return {
    apiBaseUrl: resolveHttpOrigin(input.EXPO_PUBLIC_API_URL, 'EXPO_PUBLIC_API_URL', options),
    realtimeUrl: resolveHttpOrigin(
      input.EXPO_PUBLIC_REALTIME_URL ?? DEFAULT_REALTIME_ORIGIN,
      'EXPO_PUBLIC_REALTIME_URL',
      options,
    ),
    universalLinkBaseUrl: DEFAULT_PUBLIC_ORIGIN,
  } as const;
}

export const mobileEnvironment = resolveMobileEnvironment(
  {
    EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
    EXPO_PUBLIC_REALTIME_URL: process.env.EXPO_PUBLIC_REALTIME_URL,
  },
  { allowInsecureLocalhost: typeof __DEV__ !== 'undefined' && __DEV__ },
);
