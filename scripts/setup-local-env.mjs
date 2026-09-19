import { copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const envPath = resolve(root, '.env');
const examplePath = resolve(root, '.env.example');

if (existsSync(envPath)) {
  console.log('.env already exists. No changes were made.');
  process.exit(0);
}

if (!existsSync(examplePath)) {
  console.error('.env.example was not found.');
  process.exit(1);
}

copyFileSync(examplePath, envPath);
console.log('Created .env from .env.example.');
