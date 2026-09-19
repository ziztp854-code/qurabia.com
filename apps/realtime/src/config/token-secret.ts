type ConfigReader = {
  get<T>(propertyPath: string, defaultValue?: T): T;
};

/**
 * Single source of truth for the HMAC secret shared with the web app.
 * NEXTAUTH_SECRET remains a fallback so deployments that only set the
 * legacy variable keep verifying host/guest tokens.
 */
export function resolveTokenSecret(config: ConfigReader): string {
  return (
    config.get<string>('AUTH_SECRET') ??
    config.get<string>('NEXTAUTH_SECRET') ??
    ''
  );
}
