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
