/** Measure actual decoded PCM, rejecting silence and the other test tone. */
export function measureVoiceSignal(samples, frequency, otherFrequency, sampleRate = 48_000) {
  let energy = 0;
  for (const sample of samples) energy += sample * sample;
  const power = (hz) => {
    const coefficient = 2 * Math.cos((2 * Math.PI * hz) / sampleRate);
    let previous = 0,
      beforePrevious = 0;
    for (const sample of samples) {
      const value = sample + coefficient * previous - beforePrevious;
      beforePrevious = previous;
      previous = value;
    }
    return (
      previous * previous +
      beforePrevious * beforePrevious -
      coefficient * previous * beforePrevious
    );
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
