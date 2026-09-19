import { describe, expect, it } from 'vitest';
import { summarizeDatabaseUrl } from './database-url';

describe('database url summary', () => {
  it('classifies Supabase transaction pooler URLs without exposing credentials', () => {
    const summary = summarizeDatabaseUrl(
      'postgresql://user:secret@aws-0-region.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require',
    );

    expect(summary).toEqual({
      valid: true,
      provider: 'supabase',
      connection: 'pooler',
      sslMode: 'required',
      pgbouncer: true,
    });
  });

  it('classifies direct PostgreSQL URLs used for migrations', () => {
    const summary = summarizeDatabaseUrl('postgresql://user:secret@db.example.supabase.co:5432/postgres?sslmode=require');

    expect(summary.connection).toBe('direct');
    expect(summary.provider).toBe('supabase');
  });

  it('returns an invalid summary for absent values', () => {
    expect(summarizeDatabaseUrl(undefined).valid).toBe(false);
  });
});
