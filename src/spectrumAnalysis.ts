import { computeSpectrum, powerToDB, generateWindow } from './mathUtils';
import {
  clearCanvas,
  drawGrid,
  drawAxes,
  drawStemPlotWithX,
  autoScaleYWithZero,
} from './canvasUtils';

export interface SpectrumSettings {
  sampleRate: number;
  numPoints: number;
  zeroPadding: number;
  windowType: string;
  kaiserBeta: number;
}

export class SpectrumAnalysis {
  private magCanvas: HTMLCanvasElement;
  private magCtx: CanvasRenderingContext2D;
  private phaseCanvas: HTMLCanvasElement;
  private phaseCtx: CanvasRenderingContext2D;
  private powerCanvas: HTMLCanvasElement;
  private powerCtx: CanvasRenderingContext2D;
  private settings: SpectrumSettings = {
    sampleRate: 1000,
    numPoints: 256,
    zeroPadding: 1,
    windowType: 'rect',
    kaiserBeta: 5,
  };
  private currentSignal: number[] = [];

  constructor() {
    this.magCanvas = document.getElementById('magnitude-spectrum') as HTMLCanvasElement;
    this.magCtx = this.magCanvas.getContext('2d')!;
    this.phaseCanvas = document.getElementById('phase-spectrum') as HTMLCanvasElement;
    this.phaseCtx = this.phaseCanvas.getContext('2d')!;
    this.powerCanvas = document.getElementById('power-spectrum') as HTMLCanvasElement;
    this.powerCtx = this.powerCanvas.getContext('2d')!;

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    document.getElementById('dft-n')!.addEventListener('change', (e) => {
      this.settings.numPoints = parseInt((e.target as HTMLSelectElement).value);
      this.update();
    });

    document.getElementById('sample-rate')!.addEventListener('input', (e) => {
      this.settings.sampleRate = parseInt((e.target as HTMLInputElement).value);
      document.getElementById('sample-rate-value')!.textContent = this.settings.sampleRate.toString();
      this.update();
    });

    document.getElementById('zero-padding')!.addEventListener('change', (e) => {
      this.settings.zeroPadding = parseInt((e.target as HTMLSelectElement).value);
      this.update();
    });

    document.getElementById('dft-window')!.addEventListener('change', (e) => {
      this.settings.windowType = (e.target as HTMLSelectElement).value;
      const kaiserGroup = document.getElementById('kaiser-beta-group')!;
      kaiserGroup.style.display = this.settings.windowType === 'kaiser' ? 'block' : 'none';
      this.update();
    });

    document.getElementById('kaiser-beta')!.addEventListener('input', (e) => {
      this.settings.kaiserBeta = parseFloat((e.target as HTMLInputElement).value);
      document.getElementById('kaiser-beta-value')!.textContent = this.settings.kaiserBeta.toFixed(1);
      this.update();
    });
  }

  public setSignal(signal: number[]): void {
    this.currentSignal = signal.slice(0, this.settings.numPoints);
    this.update();
  }

  private update(): void {
    if (this.currentSignal.length > 0) {
      this.render(this.currentSignal);
    }
  }

  public getSettings(): SpectrumSettings {
    return { ...this.settings };
  }

  public render(signal: number[]): void {
    const window = generateWindow(
      this.settings.windowType,
      signal.length,
      this.settings.kaiserBeta
    );

    const spectrum = computeSpectrum(
      signal,
      this.settings.sampleRate,
      this.settings.zeroPadding,
      window
    );

    this.renderMagnitude(spectrum.frequencies, spectrum.magnitude);
    this.renderPhase(spectrum.frequencies, spectrum.phase);
    this.renderPower(spectrum.frequencies, spectrum.power);
  }

  private renderMagnitude(frequencies: number[], magnitude: number[]): void {
    const width = this.magCanvas.width;
    const height = this.magCanvas.height;
    const padding = 50;

    const maxFreq = this.settings.sampleRate / 2;
    const xRange: [number, number] = [0, maxFreq];
    const yRange = autoScaleYWithZero(magnitude, 0.2);

    clearCanvas(this.magCtx, width, height);
    drawGrid(this.magCtx, width, height, xRange, yRange);
    drawAxes(this.magCtx, width, height, xRange, yRange, '频率 (Hz)', '幅值', padding);

    const displayFreqs: number[] = [];
    const displayMags: number[] = [];
    for (let i = 0; i < frequencies.length; i++) {
      if (frequencies[i] <= maxFreq) {
        displayFreqs.push(frequencies[i]);
        displayMags.push(magnitude[i]);
      }
    }

    drawStemPlotWithX(
      this.magCtx,
      displayFreqs,
      displayMags,
      width,
      height,
      xRange,
      yRange,
      '#4fc3f7',
      2,
      3,
      padding
    );
  }

  private renderPhase(frequencies: number[], phase: number[]): void {
    const width = this.phaseCanvas.width;
    const height = this.phaseCanvas.height;
    const padding = 50;

    const maxFreq = this.settings.sampleRate / 2;
    const xRange: [number, number] = [0, maxFreq];
    const yRange: [number, number] = [-Math.PI - 0.3, Math.PI + 0.3];

    clearCanvas(this.phaseCtx, width, height);
    drawGrid(this.phaseCtx, width, height, xRange, yRange);
    drawAxes(this.phaseCtx, width, height, xRange, yRange, '频率 (Hz)', '相位 (rad)', padding);

    const displayFreqs: number[] = [];
    const displayPhases: number[] = [];
    for (let i = 0; i < frequencies.length; i++) {
      if (frequencies[i] <= maxFreq) {
        displayFreqs.push(frequencies[i]);
        let p = phase[i];
        if (p > Math.PI) p -= 2 * Math.PI;
        if (p < -Math.PI) p += 2 * Math.PI;
        displayPhases.push(p);
      }
    }

    drawStemPlotWithX(
      this.phaseCtx,
      displayFreqs,
      displayPhases,
      width,
      height,
      xRange,
      yRange,
      '#ffa726',
      2,
      3,
      padding
    );
  }

  private renderPower(frequencies: number[], power: number[]): void {
    const width = this.powerCanvas.width;
    const height = this.powerCanvas.height;
    const padding = 50;

    const maxFreq = this.settings.sampleRate / 2;
    const xRange: [number, number] = [0, maxFreq];

    const powerDB = powerToDB(power);
    const yRange: [number, number] = [-100, 10];

    clearCanvas(this.powerCtx, width, height);
    drawGrid(this.powerCtx, width, height, xRange, yRange);
    drawAxes(this.powerCtx, width, height, xRange, yRange, '频率 (Hz)', '功率 (dB)', padding);

    const displayFreqs: number[] = [];
    const displayPower: number[] = [];
    for (let i = 0; i < frequencies.length; i++) {
      if (frequencies[i] <= maxFreq) {
        displayFreqs.push(frequencies[i]);
        displayPower.push(Math.max(-100, powerDB[i]));
      }
    }

    drawStemPlotWithX(
      this.powerCtx,
      displayFreqs,
      displayPower,
      width,
      height,
      xRange,
      yRange,
      '#7c4dff',
      2,
      3,
      padding
    );
  }
}
