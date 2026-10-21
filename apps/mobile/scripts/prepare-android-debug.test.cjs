const test = require('node:test');
const assert = require('node:assert/strict');
const { bundledGradle, offlineHost } = require('./prepare-android-debug.cjs');

test('bundled debug retains the release configuration and Expo bundler', () => {
  const release = 'buildTypes { release { signingConfig signingConfigs.debug } }';
  const result = bundledGradle('react {\n  bundleCommand = "export:embed"\n}\n' + release);
  assert.ok(result.includes('debuggableVariants = []'));
  assert.ok(result.includes('bundleCommand = "export:embed"'));
  assert.ok(result.endsWith(release));
});
test('unknown or already configured Gradle templates stop instead of silently producing a Metro APK', () => {
  assert.throws(() => bundledGradle('react {}\n'), /bundler/);
  assert.throws(() => bundledGradle('bundleCommand = "export:embed"\n'), /react block/);
  assert.throws(() => bundledGradle('react {\n debuggableVariants = []\n bundleCommand = "export:embed"\n}'), /already configured/);
});
test('native debug host uses its bundled application without Metro', () => {
  const source = 'ExpoReactHostFactory.getDefaultReactHost(\n context = applicationContext,\n packageList = PackageList(this).packages\n)';
  const result = offlineHost(source);
  assert.ok(result.includes('useDevSupport = false,'));
  assert.ok(result.includes('packageList = PackageList(this).packages'));
  assert.throws(() => offlineHost(result), /already configured/);
});
test('unknown native host templates stop explicitly', () => {
  assert.throws(() => offlineHost('ReactNativeHost()'), /ExpoReactHostFactory/);
  assert.throws(() => offlineHost('ExpoReactHostFactory.getDefaultReactHost()'), /React host context/);
});
