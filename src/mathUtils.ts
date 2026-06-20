export interface Complex {
  real: number;
  imag: number;
}

export interface WaveformComponent {
  type: 'sine' | 'cosine' | 'square' | 'triangle' | 'sawtooth' | 'chirp' | 'noise' | 'noise-sine';
  amplitude: number;
  frequency: number;
  phase: number;
  chirpStartFreq?: number;
  chirpEndFreq?: number;
  noiseLevel?: number;
  signalFrequency?: number;
}

export interface DFTResult {
  magnitude: number[];
  phase: number[];
  power: number[];
  frequencies: number[];
}

export function generateWaveform(
  type: string,
  amplitude: number,
  frequency: number,
  phase: number,
  t: number
): number {
  const omega = 2 * Math.PI * frequency;
  const phi = (phase * Math.PI) / 180;
  const arg = omega * t + phi;

  switch (type) {
    case 'sine':
      return amplitude * Math.sin(arg);
    case 'cosine':
      return amplitude * Math.cos(arg);
    case 'square':
      return amplitude * (Math.sin(arg) >= 0 ? 1 : -1);
    case 'triangle':
      return amplitude * (2 / Math.PI) * Math.asin(Math.sin(arg));
    case 'sawtooth':
      return amplitude * (2 / Math.PI) * Math.atan(Math.tan(arg / 2));
    default:
      return 0;
  }
}

export function generateChirpSignal(
  t: number,
  duration: number,
  startFreq: number,
  endFreq: number,
  amplitude: number = 1
): number {
  const k = (endFreq - startFreq) / duration;
  const phase = 2 * Math.PI * (startFreq * t + 0.5 * k * t * t);
  return amplitude * Math.sin(phase);
}

export function generateWhiteNoise(amplitude: number = 1): number {
  return amplitude * (2 * Math.random() - 1);
}

export function generateNoiseSineSignal(
  t: number,
  signalFreq: number,
  signalAmp: number,
  noiseAmp: number
): number {
  const signal = signalAmp * Math.sin(2 * Math.PI * signalFreq * t);
  const noise = noiseAmp * (2 * Math.random() - 1);
  return signal + noise;
}

export function generateCompositeSignal(
  components: WaveformComponent[],
  t: number,
  duration: number = 0.1
): number {
  return components.reduce((sum, comp) => {
    if (comp.type === 'chirp') {
      return sum + generateChirpSignal(
        t,
        duration,
        comp.chirpStartFreq || 20,
        comp.chirpEndFreq || 200,
        comp.amplitude
      );
    } else if (comp.type === 'noise') {
      return sum + generateWhiteNoise(comp.amplitude);
    } else if (comp.type === 'noise-sine') {
      return sum + generateNoiseSineSignal(
        t,
        comp.signalFrequency || 50,
        comp.amplitude,
        comp.noiseLevel || 0.3
      );
    } else {
      return sum + generateWaveform(comp.type, comp.amplitude, comp.frequency, comp.phase, t);
    }
  }, 0);
}

export function generateTimeSeries(
  components: WaveformComponent[],
  sampleRate: number,
  numSamples: number,
  startTime: number = 0
): number[] {
  const dt = 1 / sampleRate;
  const duration = numSamples / sampleRate;
  const result: number[] = [];
  for (let i = 0; i < numSamples; i++) {
    result.push(generateCompositeSignal(components, startTime + i * dt, duration));
  }
  return result;
}

export function dft(signal: number[], window?: number[]): Complex[] {
  const N = signal.length;
  const result: Complex[] = [];

  const windowedSignal = window
    ? signal.map((val, i) => val * window[i])
    : signal;

  for (let k = 0; k < N; k++) {
    let real = 0;
    let imag = 0;
    for (let n = 0; n < N; n++) {
      const angle = (-2 * Math.PI * k * n) / N;
      real += windowedSignal[n] * Math.cos(angle);
      imag += windowedSignal[n] * Math.sin(angle);
    }
    result.push({ real, imag });
  }
  return result;
}

export function idft(spectrum: Complex[]): number[] {
  const N = spectrum.length;
  const result: number[] = [];

  for (let n = 0; n < N; n++) {
    let real = 0;
    let imag = 0;
    for (let k = 0; k < N; k++) {
      const angle = (2 * Math.PI * k * n) / N;
      real += spectrum[k].real * Math.cos(angle) - spectrum[k].imag * Math.sin(angle);
      imag += spectrum[k].real * Math.sin(angle) + spectrum[k].imag * Math.cos(angle);
    }
    result.push(real / N);
  }
  return result;
}

export function fft(signal: number[]): Complex[] {
  const N = signal.length;

  if (N <= 1) {
    return [{ real: signal[0] || 0, imag: 0 }];
  }

  if ((N & (N - 1)) !== 0) {
    return dft(signal);
  }

  const even: number[] = [];
  const odd: number[] = [];
  for (let i = 0; i < N; i++) {
    if (i % 2 === 0) {
      even.push(signal[i]);
    } else {
      odd.push(signal[i]);
    }
  }

  const evenFFT = fft(even);
  const oddFFT = fft(odd);

  const result: Complex[] = new Array(N);
  for (let k = 0; k < N / 2; k++) {
    const angle = (-2 * Math.PI * k) / N;
    const twiddleReal = Math.cos(angle);
    const twiddleImag = Math.sin(angle);

    const oddReal = oddFFT[k].real * twiddleReal - oddFFT[k].imag * twiddleImag;
    const oddImag = oddFFT[k].real * twiddleImag + oddFFT[k].imag * twiddleReal;

    result[k] = {
      real: evenFFT[k].real + oddReal,
      imag: evenFFT[k].imag + oddImag,
    };

    result[k + N / 2] = {
      real: evenFFT[k].real - oddReal,
      imag: evenFFT[k].imag - oddImag,
    };
  }

  return result;
}

export function ifft(spectrum: Complex[]): number[] {
  const N = spectrum.length;

  const conjugated: Complex[] = spectrum.map((c) => ({
    real: c.real,
    imag: -c.imag,
  }));

  const forward = fft(conjugated.map((c) => c.real));

  const result: number[] = [];
  for (let n = 0; n < N; n++) {
    if (n < forward.length) {
      result.push(forward[n].real / N);
    } else {
      result.push(0);
    }
  }
  return result;
}

export function computeSpectrum(
  signal: number[],
  sampleRate: number,
  zeroPadding: number = 1,
  window?: number[]
): DFTResult {
  const N = signal.length;
  const paddedN = N * zeroPadding;

  let paddedSignal = [...signal];
  while (paddedSignal.length < paddedN) {
    paddedSignal.push(0);
  }

  let windowArr: number[] | undefined;
  if (window) {
    windowArr = [...window];
    while (windowArr.length < paddedN) {
      windowArr.push(0);
    }
  }

  const spectrum = dft(paddedSignal, windowArr);

  const magnitude: number[] = [];
  const phase: number[] = [];
  const power: number[] = [];
  const frequencies: number[] = [];

  const freqStep = sampleRate / paddedN;

  for (let k = 0; k < paddedN / 2; k++) {
    const mag = Math.sqrt(spectrum[k].real ** 2 + spectrum[k].imag ** 2);
    const ph = Math.atan2(spectrum[k].imag, spectrum[k].real);

    magnitude.push((2 * mag) / N);
    phase.push(ph);
    power.push(mag ** 2);
    frequencies.push(k * freqStep);
  }

  return { magnitude, phase, power, frequencies };
}

export function powerToDB(power: number[], reference: number = 1): number[] {
  return power.map((p) => {
    const val = p / reference;
    return val > 0 ? 10 * Math.log10(val) : -100;
  });
}

export function generateWindow(type: string, N: number, beta: number = 5): number[] {
  const window: number[] = [];

  switch (type) {
    case 'rect':
      for (let n = 0; n < N; n++) {
        window.push(1);
      }
      break;

    case 'hanning':
      for (let n = 0; n < N; n++) {
        window.push(0.5 * (1 - Math.cos((2 * Math.PI * n) / (N - 1))));
      }
      break;

    case 'hamming':
      for (let n = 0; n < N; n++) {
        window.push(0.54 - 0.46 * Math.cos((2 * Math.PI * n) / (N - 1)));
      }
      break;

    case 'blackman':
      for (let n = 0; n < N; n++) {
        window.push(
          0.42 -
            0.5 * Math.cos((2 * Math.PI * n) / (N - 1)) +
            0.08 * Math.cos((4 * Math.PI * n) / (N - 1))
        );
      }
      break;

    case 'kaiser':
      const alpha = (N - 1) / 2;
      const besselBeta = besselI0(beta);
      for (let n = 0; n < N; n++) {
        const x = (n - alpha) / alpha;
        window.push(besselI0(beta * Math.sqrt(1 - x * x)) / besselBeta);
      }
      break;

    default:
      for (let n = 0; n < N; n++) {
        window.push(1);
      }
  }

  return window;
}

export function besselI0(x: number): number {
  let result = 1;
  let term = 1;
  const xSquared = x * x / 4;

  for (let i = 1; i <= 50; i++) {
    term *= xSquared / (i * i);
    result += term;
    if (term < 1e-10) break;
  }

  return result;
}

export function fourierSeriesCoefficients(
  signalType: string,
  numHarmonics: number
): { amplitudes: number[]; phases: number[] } {
  const amplitudes: number[] = [];
  const phases: number[] = [];

  switch (signalType) {
    case 'square':
      for (let n = 1; n <= numHarmonics; n++) {
        if (n % 2 === 1) {
          amplitudes.push(4 / (Math.PI * n));
          phases.push(0);
        } else {
          amplitudes.push(0);
          phases.push(0);
        }
      }
      break;

    case 'triangle':
      for (let n = 1; n <= numHarmonics; n++) {
        if (n % 2 === 1) {
          amplitudes.push((8 / (Math.PI * Math.PI * n * n)) * (n % 4 === 1 ? 1 : -1));
          phases.push(n % 4 === 1 ? 0 : Math.PI);
        } else {
          amplitudes.push(0);
          phases.push(0);
        }
      }
      break;

    case 'sawtooth':
      for (let n = 1; n <= numHarmonics; n++) {
        amplitudes.push(2 / (Math.PI * n) * Math.pow(-1, n + 1));
        phases.push(Math.pow(-1, n + 1) > 0 ? 0 : Math.PI);
      }
      break;

    case 'rect':
      const dutyCycle = 0.3;
      for (let n = 1; n <= numHarmonics; n++) {
        const sinc = Math.sin(Math.PI * n * dutyCycle) / (Math.PI * n);
        amplitudes.push(2 * dutyCycle * Math.abs(sinc));
        phases.push(sinc >= 0 ? 0 : Math.PI);
      }
      break;

    default:
      for (let n = 1; n <= numHarmonics; n++) {
        amplitudes.push(0);
        phases.push(0);
      }
  }

  return { amplitudes, phases };
}

export function reconstructFromSeries(
  amplitudes: number[],
  phases: number[],
  fundamentalFreq: number,
  t: number,
  numHarmonics: number
): number {
  let result = 0;
  const omega = 2 * Math.PI * fundamentalFreq;

  for (let n = 1; n <= numHarmonics && n <= amplitudes.length; n++) {
    result += amplitudes[n - 1] * Math.cos(n * omega * t + phases[n - 1]);
  }

  return result;
}

export function sincInterpolation(
  samples: number[],
  sampleRate: number,
  t: number
): number {
  const T = 1 / sampleRate;
  let result = 0;

  for (let n = 0; n < samples.length; n++) {
    const x = (t - n * T) / T;
    if (Math.abs(x) < 0.001) {
      result += samples[n];
    } else {
      result += samples[n] * Math.sin(Math.PI * x) / (Math.PI * x);
    }
  }

  return result;
}

export function applyFilter(
  spectrum: Complex[],
  filterType: string,
  cutoff1: number,
  cutoff2: number,
  sampleRate: number
): Complex[] {
  const N = spectrum.length;
  const freqStep = sampleRate / N;
  const filtered = spectrum.map((c) => ({ ...c }));

  for (let k = 0; k < N; k++) {
    let freq = k * freqStep;
    if (k > N / 2) {
      freq = (N - k) * freqStep;
    }

    let keep = false;

    switch (filterType) {
      case 'lowpass':
        keep = freq <= cutoff1;
        break;
      case 'highpass':
        keep = freq >= cutoff1;
        break;
      case 'bandpass':
        keep = freq >= cutoff1 && freq <= cutoff2;
        break;
    }

    if (!keep) {
      filtered[k].real = 0;
      filtered[k].imag = 0;
    }
  }

  return filtered;
}

export function zeroPad(signal: number[], targetLength: number): number[] {
  const result = [...signal];
  while (result.length < targetLength) {
    result.push(0);
  }
  return result;
}

export function normalize(signal: number[]): number[] {
  const max = Math.max(...signal.map((v) => Math.abs(v)));
  if (max === 0) return signal;
  return signal.map((v) => v / max);
}

export function findPeaks(values: number[], threshold: number = 0.1): number[] {
  const peaks: number[] = [];
  const maxVal = Math.max(...values);
  const minPeak = threshold * maxVal;

  let i = 1;
  while (i < values.length - 1) {
    if (values[i] > minPeak) {
      if (values[i] >= values[i - 1] && values[i] >= values[i + 1]) {
        if (values[i] > values[i - 1] || values[i] > values[i + 1]) {
          peaks.push(i);
          i += 2;
          continue;
        } else if (values[i] === values[i + 1]) {
          let j = i + 1;
          while (j < values.length - 1 && values[j] === values[i]) j++;
          if (j < values.length && values[i] >= values[j]) {
            const mid = Math.floor((i + j - 1) / 2);
            peaks.push(mid);
          }
          i = j;
          continue;
        }
      }
    }
    i++;
  }

  for (let pass = 0; pass < peaks.length; pass++) {
    for (let j = 1; j < peaks.length; j++) {
      if (values[peaks[j]] > values[peaks[j - 1]]) {
        const tmp = peaks[j];
        peaks[j] = peaks[j - 1];
        peaks[j - 1] = tmp;
      }
    }
  }

  return peaks;
}

export function computeSNR(signal: number[], noise: number[]): number {
  const signalPower = signal.reduce((sum, v) => sum + v * v, 0) / signal.length;
  const noisePower = noise.reduce((sum, v) => sum + v * v, 0) / noise.length;
  if (noisePower === 0) return 100;
  return 10 * Math.log10(signalPower / noisePower);
}

export function nextPowerOf2(n: number): number {
  return Math.pow(2, Math.ceil(Math.log2(n)));
}

export function linspace(start: number, end: number, n: number): number[] {
  const result: number[] = [];
  const step = (end - start) / (n - 1);
  for (let i = 0; i < n; i++) {
    result.push(start + i * step);
  }
  return result;
}
