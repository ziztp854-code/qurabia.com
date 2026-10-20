// Dedicated CLI config deliberately avoids loading repository .env files.
import { defineConfig } from 'prisma/config';
import path from 'node:path';
const url = process.env.VOICE_TEST_DATABASE_URL;
if (!url) throw new Error('VOICE_TEST_DATABASE_URL is required.');
const target = new URL(url);
if (
  !['postgres:', 'postgresql:'].includes(target.protocol) ||
  !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) ||
  !/^\/voice_test(?:_[a-zA-Z0-9_-]+)?$/.test(target.pathname) ||
  target.search ||
  target.hash
) {
  throw new Error('Refusing migrations outside an isolated loopback voice_test database.');
}
export default defineConfig({
  schema: path.resolve(__dirname, '../prisma/schema.prisma'),
  migrations: { path: path.resolve(__dirname, '../prisma/migrations') },
  datasource: { url },
});
