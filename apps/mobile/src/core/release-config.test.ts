import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

type JsonRecord = Record<string, unknown>;

function readJson(path: URL) {
  return JSON.parse(readFileSync(path, 'utf8')) as JsonRecord;
}

test('keeps the native identifiers, verified link domain, and notification plugin aligned', () => {
  const appConfig = readJson(new URL('../../app.json', import.meta.url));
  const expo = appConfig.expo as JsonRecord;
  const ios = expo.ios as JsonRecord;
  const plugins = expo.plugins as unknown[];
  const notifications = plugins.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-notifications',
  ) as [string, JsonRecord] | undefined;

  assert.equal(expo.scheme, 'tahaddi');
  assert.equal(expo.userInterfaceStyle, undefined);
  assert.equal(ios.bundleIdentifier, 'com.qurabia.tahaddi');
  assert.equal(ios.userInterfaceStyle, 'dark');
  assert.equal(ios.supportsTablet, false);
  assert.deepEqual(ios.associatedDomains, ['applinks:qurabia.com']);
  assert.deepEqual(notifications?.[1], {
    color: '#FFB74D',
    defaultChannel: 'default',
    enableBackgroundRemoteNotifications: false,
  });
});

test('pins every EAS build profile to its matching environment', () => {
  const easConfig = readJson(new URL('../../eas.json', import.meta.url));
  const build = easConfig.build as Record<string, JsonRecord>;

  assert.equal(build.development?.environment, 'development');
  assert.equal(build.preview?.environment, 'preview');
  assert.equal(build.production?.environment, 'production');
  assert.equal(build.production?.autoIncrement, true);
  assert.equal((build.development?.ios as JsonRecord | undefined)?.simulator, true);
});
