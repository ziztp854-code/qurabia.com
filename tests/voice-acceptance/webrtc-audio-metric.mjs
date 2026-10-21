/** Test-only PCM oracle: Hann-windowed radix-2 FFT, independent of ICE/signaling. */
export function analyzePcmTone(samples, sampleRate = 48000) {
  if (!samples.length)
    return { frequencyHz: 0, zeroCrossingHz: 0, rms: 0, bandPower440: 0, bandPower660: 0 };
  let size = 1;
  while (size < samples.length) size *= 2;
  const real = new Float64Array(size);
  const imaginary = new Float64Array(size);
  let sumSquares = 0;
  let crossings = 0;
  for (let i = 0; i < samples.length; i++) {
    sumSquares += samples[i] * samples[i];
    if (i && samples[i] >= 0 !== samples[i - 1] >= 0) crossings++;
    const weight =
      samples.length === 1 ? 1 : 0.5 * (1 - Math.cos((2 * Math.PI * i) / (samples.length - 1)));
    real[i] = samples[i] * weight;
  }
  for (let i = 1, j = 0; i < size; i++) {
    let bit = size >> 1;
    while (j & bit) {
      j ^= bit;
      bit >>= 1;
    }
    j ^= bit;
    if (i < j) [real[i], real[j]] = [real[j], real[i]];
  }
  for (let width = 2; width <= size; width *= 2) {
    const angle = (-2 * Math.PI) / width;
    const stepReal = Math.cos(angle);
    const stepImaginary = Math.sin(angle);
    for (let start = 0; start < size; start += width) {
      let weightReal = 1;
      let weightImaginary = 0;
      for (let offset = 0; offset < width / 2; offset++) {
        const even = start + offset;
        const odd = even + width / 2;
        const oddReal = real[odd] * weightReal - imaginary[odd] * weightImaginary;
        const oddImaginary = real[odd] * weightImaginary + imaginary[odd] * weightReal;
        real[odd] = real[even] - oddReal;
        imaginary[odd] = imaginary[even] - oddImaginary;
        real[even] += oddReal;
        imaginary[even] += oddImaginary;
        const nextReal = weightReal * stepReal - weightImaginary * stepImaginary;
        weightImaginary = weightReal * stepImaginary + weightImaginary * stepReal;
        weightReal = nextReal;
      }
    }
  }
  let peak = 0;
  let peakPower = 0;
  let totalPower = 0;
  let band440 = 0;
  let band660 = 0;
  for (let bin = 0; bin <= size / 2; bin++) {
    const power = real[bin] ** 2 + imaginary[bin] ** 2;
    const frequency = (bin * sampleRate) / size;
    totalPower += power;
    if (bin && power > peakPower) {
      peak = bin;
      peakPower = power;
    }
    if (Math.abs(frequency - 440) < 25) band440 += power;
    if (Math.abs(frequency - 660) < 25) band660 += power;
  }
  return {
    frequencyHz: peakPower ? (peak * sampleRate) / size : 0,
    zeroCrossingHz: (crossings * sampleRate) / (2 * samples.length),
    rms: Math.sqrt(sumSquares / samples.length),
    bandPower440: totalPower ? band440 / totalPower : 0,
    bandPower660: totalPower ? band660 / totalPower : 0,
  };
}

export function matchesTone(audio, expectedHz) {
  const bandPower = expectedHz === 440 ? audio.bandPower440 : audio.bandPower660;
  return (
    audio.frames >= 15 &&
    audio.rms > 300 &&
    Math.abs(audio.frequencyHz - expectedHz) < 25 &&
    bandPower >= 0.8
  );
}
