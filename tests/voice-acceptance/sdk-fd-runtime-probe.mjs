/** No server/network: distinguish lazy native runtime descriptors from sessions. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { AudioSource, AudioFrame, dispose } from '@livekit/rtc-node';
import { snapshotDescriptors, compareDescriptorTypes } from './sdk-fd-snapshot.mjs';

const output = process.argv[2];
if (!output) throw new Error('An evidence JSON path is required');
const samples = [];
const record = (stage) => samples.push({ stage, ...snapshotDescriptors() });
record('module-imported-before-native-initialization');
for (let cycle = 1; cycle <= 3; cycle++) {
  let source = new AudioSource(48000, 1, 50);
  await source.captureFrame(new AudioFrame(new Int16Array(480), 48000, 1, 480));
  record(`source-${cycle}-active`);
  await source.close();
  source = undefined;
  await delay(100);
  record(`source-${cycle}-closed-settled-100ms`);
}
await delay(1000);
record('all-sources-closed-settled-1000ms');
if (global.gc) {
  global.gc();
  await delay(100);
  record('all-references-dropped-after-test-only-gc');
}
await dispose();
await delay(100);
record('native-dispose-settled-100ms');
const warmBaseline = samples[2];
for (const sample of samples.slice(3)) {
  assert.deepEqual(sample.types, warmBaseline.types, `Descriptor types changed at ${sample.stage}`);
  assert.equal(sample.stableCount, warmBaseline.stableCount, `FD growth at ${sample.stage}`);
}
fs.writeFileSync(
  output,
  JSON.stringify(
    {
      scope:
        'Native SDK initialization and three local AudioSource cycles; no SFU or network joins',
      testOnlyGcAvailable: Boolean(global.gc),
      samples,
      afterWarmupDifference: compareDescriptorTypes(warmBaseline, samples.at(-2)),
      coldToWarmDifference: compareDescriptorTypes(samples[0], warmBaseline),
      checks: {
        threeAudioSourcesClosed: true,
        postWarmupDescriptorTypesStable: true,
        testOnlyGcDoesNotReleaseSharedRuntime: Boolean(global.gc),
      },
      passed: true,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  JSON.stringify(samples.map(({ stage, stableCount, types }) => ({ stage, stableCount, types }))),
);
