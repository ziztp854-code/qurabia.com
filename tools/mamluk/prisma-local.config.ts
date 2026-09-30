import { defineConfig } from 'prisma/config';

const value = process.env.KINGDOMS_TEST_DATABASE_URL;
if (!value) throw new Error('Set KINGDOMS_TEST_DATABASE_URL to the isolated local database.');
const url = new URL(value);
if (
  !['postgres:', 'postgresql:'].includes(url.protocol) ||
  !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
  !/^\/kingdoms_test(?:_[a-zA-Z0-9_-]+)?$/.test(url.pathname) ||
  url.search ||
  url.hash
) {
  throw new Error('Only an isolated local kingdoms_test database is allowed.');
}
export default defineConfig({
  schema: '../../prisma/schema.prisma',
  migrations: { path: '../../prisma/migrations' },
  datasource: { url: value },
});
