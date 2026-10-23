/** Measure actual decoded PCM, rejecting silence and the other test tone. */
export function measureVoiceSignal(samples, frequency, otherFrequency, sampleRate = 48_000) {
  let energy = 0;
  for (const sample of samples) energy += sample * sample;
  const power = (hz) => {
    const coefficient = 2 * Math.cos((2 * Math.PI * hz) / sampleRate);
    // Sum power, not phase, across 100 ms PCM windows. A phase reset or
    // packet concealment must not cancel a valid tone elsewhere in the capture.
    const windowSize = Math.max(1, Math.round(sampleRate / 10));
    let total = 0;
    for (let start = 0; start < samples.length; start += windowSize) {
      let previous = 0,
        beforePrevious = 0;
      const end = Math.min(start + windowSize, samples.length);
      for (let index = start; index < end; index++) {
        const value = samples[index] + coefficient * previous - beforePrevious;
        beforePrevious = previous;
        previous = value;
      }
      total += Math.max(
        0,
        previous * previous +
          beforePrevious * beforePrevious -
          coefficient * previous * beforePrevious,
      );
    }
    return total;
  };
  const rms = Math.sqrt(energy / Math.max(1, samples.length));
  const ratio = power(frequency) / Math.max(1, power(otherFrequency));
  return {
    samples: samples.length,
    rms: Math.round(rms),
    expectedHz: frequency,
    toneRatio: Math.round(ratio),
    passed: samples.length >= sampleRate / 2 && rms > 200 && ratio > 10,
  };
}
