process.env.DATABASE_URL ??=
  'postgresql://postgres:postgres@127.0.0.1:5432/tahaddi_test';
process.env.AUTH_SECRET ??= 'test-only-auth-secret-32-characters';
process.env.REDIS_URL ??= 'redis://127.0.0.1:6379';
