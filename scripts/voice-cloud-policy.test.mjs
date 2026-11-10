import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { buildWebContentSecurityPolicy, buildWebSecurityHeaders } from '../config/web-security.mjs';
import origins from '../config/voice-cloud-origins.json' with { type: 'json' };

test('the production document permits every configured Cloud media/signaling region', () => {
  const env = {
    NODE_ENV: 'production',
    LIVEKIT_MODE: 'cloud',
    LIVEKIT_URL: origins.find((o) => o.startsWith('wss:')),
  };
  const policy = buildWebContentSecurityPolicy(env);
  assert.equal(
    buildWebSecurityHeaders(env).find((h) => h.key === 'Content-Security-Policy').value,
    policy,
  );
  const connect = policy
    .split('; ')
    .find((d) => d.startsWith('connect-src '))
    .split(' ');
  for (const origin of origins)
    assert.ok(connect.includes(origin), `Missing Cloud origin: ${origin}`);
  assert.ok(policy.includes("frame-ancestors 'none'"));
});

test('self-hosted voice keeps the configured gateway in the document policy', () => {
  const policy = buildWebContentSecurityPolicy({ LIVEKIT_URL: 'wss://voice.example.com' });
  assert.ok(policy.includes('https://voice.example.com'));
  assert.ok(policy.includes('wss://voice.example.com'));
});

test('a preview skips active Cloud checks without accessing any credentials', () => {
  const output = execFileSync(process.execPath, ['scripts/voice-cloud-check.mjs'], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH, DEPLOY_ENV: 'preview', LIVEKIT_MODE: 'cloud' },
  });
  assert.match(output, /skipped outside production Cloud mode/);
});
