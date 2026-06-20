import { generateWaveform, sincInterpolation } from './mathUtils';
import {
  clearCanvas,
  drawGrid,
  drawAxes,
  drawLinePlotWithX,
  drawVerticalLines,
  autoScaleY,
} from './canvasUtils';

const HIGH_SAMPLE_RATE = 2000;
const TIME_RANGE: [number, number] = [0, 0.05];

export class SamplingTheorem {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private signalFreq: number = 50;
  private samplingRate: number = 200;
  private signalPhase: number = 0;

  constructor() {
    this.canvas = document.getElementById('sampling-canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;

    this.setupEventListeners();
    this.updateInfo();
    this.render();
  }

  private setupEventListeners(): void {
    document.getElementById('signal-freq')!.addEventListener('input', (e) => {
      this.signalFreq = parseInt((e.target as HTMLInputElement).value);
      document.getElementById('signal-freq-value')!.textContent = this.signalFreq.toString();
      this.updateInfo();
      this.render();
    });

    document.getElementById('sampling-rate')!.addEventListener('input', (e) => {
      this.samplingRate = parseInt((e.target as HTMLInputElement).value);
      document.getElementById('sampling-rate-value')!.textContent = this.samplingRate.toString();
      this.updateInfo();
      this.render();
    });

    document.getElementById('signal-phase')!.addEventListener('input', (e) => {
      this.signalPhase = parseInt((e.target as HTMLInputElement).value);
      document.getElementById('signal-phase-value')!.textContent = this.signalPhase.toString();
      this.render();
    });
  }

  private updateInfo(): void {
    const nyquistFreq = this.samplingRate / 2;
    const minRequired = 2 * this.signalFreq;

    document.getElementById('nyquist-freq')!.textContent = nyquistFreq.toString();
    document.getElementById('nyquist-min')!.textContent = minRequired.toString();

    const statusEl = document.getElementById('aliasing-status')!;
    const aliasedLegend = document.getElementById('aliased-legend')!;

    if (this.samplingRate >= minRequired * 1.1) {
      statusEl.textContent = '✓ 无混叠';
      statusEl.className = 'status-ok';
      aliasedLegend.style.display = 'none';
    } else if (this.samplingRate >= minRequired) {
      statusEl.textContent = '⚠ 临界采样';
      statusEl.className = 'status-warning';
      aliasedLegend.style.display = 'none';
    } else {
      statusEl.textContent = '✗ 发生混叠！';
      statusEl.className = 'status-error';
      aliasedLegend.style.display = 'inline-block';
    }
  }

  private hasAliasing(): boolean {
    return this.samplingRate < 2 * this.signalFreq;
  }

  private getOriginalSignal(): { x: number[]; y: number[] } {
    const numPoints = Math.floor(HIGH_SAMPLE_RATE * (TIME_RANGE[1] - TIME_RANGE[0]));
    const x: number[] = [];
    const y: number[] = [];
    const dt = 1 / HIGH_SAMPLE_RATE;

    for (let i = 0; i < numPoints; i++) {
      const t = TIME_RANGE[0] + i * dt;
      x.push(t);
      y.push(generateWaveform('sine', 1, this.signalFreq, this.signalPhase, t));
    }

    return { x, y };
  }

  private getSamples(): { x: number[]; y: number[] } {
    const numSamples = Math.floor(this.samplingRate * (TIME_RANGE[1] - TIME_RANGE[0])) + 1;
    const x: number[] = [];
    const y: number[] = [];
    const dt = 1 / this.samplingRate;

    for (let i = 0; i < numSamples; i++) {
      const t = TIME_RANGE[0] + i * dt;
      x.push(t);
      y.push(generateWaveform('sine', 1, this.signalFreq, this.signalPhase, t));
    }

    return { x, y };
  }

  private getReconstructedSignal(samples: { x: number[]; y: number[] }): { x: number[]; y: number[] } {
    const numPoints = Math.floor(HIGH_SAMPLE_RATE * (TIME_RANGE[1] - TIME_RANGE[0]));
    const x: number[] = [];
    const y: number[] = [];
    const dt = 1 / HIGH_SAMPLE_RATE;

    for (let i = 0; i < numPoints; i++) {
      const t = TIME_RANGE[0] + i * dt;
      x.push(t);
      y.push(sincInterpolation(samples.y, this.samplingRate, t - TIME_RANGE[0]));
    }

    return { x, y };
  }

  public render(): void {
    const original = this.getOriginalSignal();
    const samples = this.getSamples();
    const reconstructed = this.getReconstructedSignal(samples);

    const allValues = [...original.y, ...samples.y, ...reconstructed.y];
    const yRange = autoScaleY(allValues, 0.15);

    clearCanvas(this.ctx, this.canvas.width, this.canvas.height);
    drawGrid(
      this.ctx,
      this.canvas.width,
      this.canvas.height,
      TIME_RANGE,
      yRange
    );
    drawAxes(
      this.ctx,
      this.canvas.width,
      this.canvas.height,
      TIME_RANGE,
      yRange,
      '时间 (s)',
      '幅值'
    );

    drawLinePlotWithX(
      this.ctx,
      original.x,
      original.y,
      this.canvas.width,
      this.canvas.height,
      TIME_RANGE,
      yRange,
      '#4fc3f7',
      3,
      50
    );

    const aliasing = this.hasAliasing();

    drawVerticalLines(
      this.ctx,
      samples.x,
      samples.y,
      this.canvas.width,
      this.canvas.height,
      TIME_RANGE,
      yRange,
      '#ffa726',
      2,
      50
    );

    drawLinePlotWithX(
      this.ctx,
      reconstructed.x,
      reconstructed.y,
      this.canvas.width,
      this.canvas.height,
      TIME_RANGE,
      yRange,
      aliasing ? '#ef5350' : '#66bb6a',
      2,
      50
    );

    if (aliasing) {
      this.ctx.fillStyle = 'rgba(239, 83, 80, 0.9)';
      this.ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(
        '⚠ 混叠发生：采样率低于 Nyquist 频率',
        this.canvas.width / 2,
        25
      );
    }
  }
}
