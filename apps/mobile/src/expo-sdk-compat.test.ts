import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const manifest = require('../package.json') as {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};
const sdkVersions = require('expo/bundledNativeModules.json') as Record<string, string>;

function majorMinorPatch(range: string) {
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(range);
  assert.ok(match, `unparseable version range: ${range}`);
  return match.slice(1).map(Number) as [number, number, number];
}

// Native builds (EAS) fail when these drift from the Expo SDK, even if JS typechecks pass.
test('native dependencies match the versions supported by the installed Expo SDK', () => {
  const declared = { ...manifest.dependencies, ...manifest.devDependencies };
  const mismatches = Object.entries(declared)
    .filter(([name, range]) => sdkVersions[name] && !range.startsWith('workspace:'))
    .filter(([name, range]) => {
      const [major, minor, patch] = majorMinorPatch(range);
      const [sdkMajor, sdkMinor, sdkPatch] = majorMinorPatch(sdkVersions[name]);
      return major !== sdkMajor || minor !== sdkMinor || patch < sdkPatch;
    })
    .map(([name, range]) => `${name}: ${range} (Expo SDK expects ${sdkVersions[name]})`);

  assert.deepEqual(mismatches, []);
});
