import { test } from 'node:test';
import assert from 'node:assert/strict';
import { measureVoiceSignal } from './voice-audio-signal.mjs';
const tone = (hz) =>
  Int16Array.from({ length: 48_000 }, (_, n) =>
    Math.round(6000 * Math.sin((2 * Math.PI * hz * n) / 48_000)),
  );
test('decoded PCM must contain the expected tone with sufficient duration and energy', () => {
  assert.equal(measureVoiceSignal(tone(440), 440, 660).passed, true);
  assert.equal(measureVoiceSignal(tone(660), 660, 440).passed, true);
  assert.equal(measureVoiceSignal(tone(660), 440, 660).passed, false);
  assert.equal(measureVoiceSignal(new Int16Array(48_000), 440, 660).passed, false);
  assert.equal(measureVoiceSignal(tone(440).subarray(0, 480), 440, 660).passed, false);
});

test('decoded tone survives a phase discontinuity instead of cancelling across the recording', () => {
  for (const [expected, other] of [
    [440, 660],
    [660, 440],
  ]) {
    const samples = Int16Array.from({ length: 115_200 }, (_, n) =>
      Math.round(6000 * Math.sin((2 * Math.PI * expected * n) / 48_000) * (n < 57_600 ? 1 : -1)),
    );
    assert.equal(measureVoiceSignal(samples, expected, other).passed, true);
    assert.equal(measureVoiceSignal(samples, other, expected).passed, false);
  }
});

test('phase resets never turn silence, weak audio or unrelated noise into a pass', () => {
  const weak = Int16Array.from(tone(440), (sample) => Math.round(sample / 100));
  let state = 123;
  const noise = Int16Array.from({ length: 48_000 }, () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return (state % 12001) - 6000;
  });
  for (const samples of [weak, noise, new Int16Array(48_000)]) {
    assert.equal(measureVoiceSignal(samples, 440, 660).passed, false);
    assert.equal(measureVoiceSignal(samples, 660, 440).passed, false);
  }
});
