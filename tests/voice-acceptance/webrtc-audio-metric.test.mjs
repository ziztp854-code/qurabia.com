import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { analyzePcmTone, matchesTone } from './webrtc-audio-metric.mjs';
const tone = (hz, count = 21600) =>
  Array.from({ length: count }, (_, i) =>
    Math.round(10000 * Math.sin((i * 2 * Math.PI * hz) / 48000)),
  );
const metric = (samples) => ({ frames: 45, ...analyzePcmTone(samples) });
for (const hz of [440, 660])
  test(`accepts known generated ${hz}Hz`, () => {
    const stats = metric(tone(hz));
    assert(Math.abs(stats.frequencyHz - hz) < 2);
    assert(matchesTone(stats, hz));
    assert(!matchesTone(stats, hz === 440 ? 660 : 440), 'other identity tone must be rejected');
  });
test('rejects silence, unrelated tone, and wideband noise', () => {
  let seed = 1337;
  const noise = Array.from({ length: 21600 }, () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return (seed / 2 ** 32 - 0.5) * 20000;
  });
  for (const samples of [new Array(21600).fill(0), tone(880), noise]) {
    assert(!matchesTone(metric(samples), 440));
    assert(!matchesTone(metric(samples), 660));
  }
});
test('rejects low amplitude and insufficient decoded frames', () => {
  assert(!matchesTone(metric(tone(440).map((n) => n / 100)), 440));
  assert(!matchesTone({ ...metric(tone(440)), frames: 14 }, 440));
});
test('reproduces zero-crossing false rejection on captured decoded PCM', () => {
  const evidence = JSON.parse(
    readFileSync(
      new URL(
        '../../docs/visual-evidence/live-room-responsive/closure-webrtc-pcm-diagnostic.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  let oldFalseRejects = 0;
  for (const snapshot of evidence.samples)
    snapshot.pcm.forEach((frames, index) => {
      const expected = index === 0 ? 660 : 440;
      const stats = metric(frames.flatMap((frame) => frame.samples));
      if (Math.abs(stats.zeroCrossingHz - expected) >= 25) oldFalseRejects++;
      assert(matchesTone(stats, expected));
    });
  assert(oldFalseRejects >= 1, 'recorded signal must demonstrate the old oracle failure');
});
