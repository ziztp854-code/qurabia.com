export type DatabaseUrlSummary = {
  valid: boolean;
  provider: 'supabase' | 'postgres' | 'unknown';
  connection: 'pooler' | 'direct' | 'unknown';
  sslMode: 'required' | 'present' | 'missing' | 'unknown';
  pgbouncer: boolean;
};

export function summarizeDatabaseUrl(value: string | null | undefined): DatabaseUrlSummary {
  if (!value) {
    return {
      valid: false,
      provider: 'unknown',
      connection: 'unknown',
      sslMode: 'unknown',
      pgbouncer: false,
    };
  }

  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const port = url.port;
    const sslMode = url.searchParams.get('sslmode');
    const pgbouncer = url.searchParams.get('pgbouncer') === 'true';

    return {
      valid: url.protocol === 'postgresql:' || url.protocol === 'postgres:',
      provider: host.includes('supabase') ? 'supabase' : 'postgres',
      connection: port === '6543' || pgbouncer ? 'pooler' : port === '5432' ? 'direct' : 'unknown',
      sslMode: sslMode === 'require' ? 'required' : sslMode ? 'present' : 'missing',
      pgbouncer,
    };
  } catch {
    return {
      valid: false,
      provider: 'unknown',
      connection: 'unknown',
      sslMode: 'unknown',
      pgbouncer: false,
    };
  }
}
