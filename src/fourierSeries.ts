import { fourierSeriesCoefficients, reconstructFromSeries, generateWaveform } from './mathUtils';
import {
  clearCanvas,
  drawGrid,
  drawAxes,
  drawLinePlot,
  drawBarPlot,
  autoScaleY,
  autoScaleYWithZero,
} from './canvasUtils';

const FUNDAMENTAL_FREQ = 10;
const NUM_POINTS = 1000;
const TIME_RANGE: [number, number] = [0, 0.2];

export class FourierSeries {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private barsCanvas: HTMLCanvasElement;
  private barsCtx: CanvasRenderingContext2D;
  private signalType: string = 'square';
  private currentHarmonics: number = 1;
  private maxHarmonics: number = 50;
  private animationId: number | null = null;
  private isPaused: boolean = false;
  private animationSpeed: number = 5;
  private amplitudes: number[] = [];
  private phases: number[] = [];

  constructor() {
    this.canvas = document.getElementById('series-canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.barsCanvas = document.getElementById('harmonic-bars-canvas') as HTMLCanvasElement;
    this.barsCtx = this.barsCanvas.getContext('2d')!;

    this.setupEventListeners();
    this.calculateCoefficients();
    this.render();
  }

  private setupEventListeners(): void {
    document.getElementById('series-signal-type')!.addEventListener('change', (e) => {
      this.signalType = (e.target as HTMLSelectElement).value;
      this.calculateCoefficients();
      this.currentHarmonics = 1;
      (document.getElementById('harmonic-slider') as HTMLInputElement).value = '1';
      document.getElementById('harmonic-count')!.textContent = '1';
      this.stopAnimation();
      this.render();
    });

    document.getElementById('harmonic-slider')!.addEventListener('input', (e) => {
      this.currentHarmonics = parseInt((e.target as HTMLInputElement).value);
      document.getElementById('harmonic-count')!.textContent = this.currentHarmonics.toString();
      this.render();
    });

    document.getElementById('animation-speed')!.addEventListener('input', (e) => {
      this.animationSpeed = parseInt((e.target as HTMLInputElement).value);
    });

    document.getElementById('start-series')!.addEventListener('click', () => this.startAnimation());
    document.getElementById('pause-series')!.addEventListener('click', () => this.togglePause());
    document.getElementById('reset-series')!.addEventListener('click', () => this.resetAnimation());
  }

  private calculateCoefficients(): void {
    const result = fourierSeriesCoefficients(this.signalType, this.maxHarmonics);
    this.amplitudes = result.amplitudes;
    this.phases = result.phases;
  }

  private startAnimation(): void {
    this.stopAnimation();
    this.isPaused = false;
    this.currentHarmonics = 1;
    (document.getElementById('harmonic-slider') as HTMLInputElement).value = '1';
    document.getElementById('harmonic-count')!.textContent = '1';
    (document.getElementById('pause-series') as HTMLButtonElement).textContent = '暂停';

    this.animate();
  }

  private animate(): void {
    if (this.isPaused) return;

    this.currentHarmonics++;
    if (this.currentHarmonics > this.maxHarmonics) {
      this.currentHarmonics = this.maxHarmonics;
      this.stopAnimation();
      return;
    }

    (document.getElementById('harmonic-slider') as HTMLInputElement).value = this.currentHarmonics.toString();
    document.getElementById('harmonic-count')!.textContent = this.currentHarmonics.toString();
    this.render();

    const delay = 500 / this.animationSpeed;
    this.animationId = window.setTimeout(() => this.animate(), delay);
  }

  private togglePause(): void {
    this.isPaused = !this.isPaused;
    const btn = document.getElementById('pause-series') as HTMLButtonElement;
    btn.textContent = this.isPaused ? '继续' : '暂停';

    if (!this.isPaused && this.currentHarmonics < this.maxHarmonics) {
      this.animate();
    }
  }

  private stopAnimation(): void {
    if (this.animationId !== null) {
      clearTimeout(this.animationId);
      this.animationId = null;
    }
  }

  private resetAnimation(): void {
    this.stopAnimation();
    this.isPaused = false;
    this.currentHarmonics = 1;
    (document.getElementById('harmonic-slider') as HTMLInputElement).value = '1';
    document.getElementById('harmonic-count')!.textContent = '1';
    (document.getElementById('pause-series') as HTMLButtonElement).textContent = '暂停';
    this.render();
  }

  private getOriginalSignal(): number[] {
    const signal: number[] = [];
    const dt = (TIME_RANGE[1] - TIME_RANGE[0]) / NUM_POINTS;

    for (let i = 0; i < NUM_POINTS; i++) {
      const t = TIME_RANGE[0] + i * dt;
      signal.push(generateWaveform(this.signalType, 1, FUNDAMENTAL_FREQ, 0, t));
    }

    return signal;
  }

  private getApproximatedSignal(): number[] {
    const signal: number[] = [];
    const dt = (TIME_RANGE[1] - TIME_RANGE[0]) / NUM_POINTS;

    for (let i = 0; i < NUM_POINTS; i++) {
      const t = TIME_RANGE[0] + i * dt;
      signal.push(reconstructFromSeries(
        this.amplitudes,
        this.phases,
        FUNDAMENTAL_FREQ,
        t,
        this.currentHarmonics
      ));
    }

    return signal;
  }

  private checkGibbs(): boolean {
    if (this.signalType !== 'square' && this.signalType !== 'sawtooth') return false;
    if (this.currentHarmonics < 5) return false;

    const approx = this.getApproximatedSignal();
    const original = this.getOriginalSignal();
    const maxApprox = Math.max(...approx);
    const maxOriginal = Math.max(...original);

    return maxApprox > maxOriginal * 1.05;
  }

  public render(): void {
    const original = this.getOriginalSignal();
    const approximated = this.getApproximatedSignal();

    const allValues = [...original, ...approximated];
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

    drawLinePlot(
      this.ctx,
      original,
      this.canvas.width,
      this.canvas.height,
      TIME_RANGE,
      yRange,
      'rgba(255, 255, 255, 0.3)',
      2
    );

    drawLinePlot(
      this.ctx,
      approximated,
      this.canvas.width,
      this.canvas.height,
      TIME_RANGE,
      yRange,
      '#4fc3f7',
      2.5
    );

    const hasGibbs = this.checkGibbs();
    const gibbsNote = document.getElementById('gibbs-note') as HTMLElement;
    gibbsNote.style.display = hasGibbs ? 'block' : 'none';

    this.renderHarmonicBars();
  }

  private renderHarmonicBars(): void {
    const displayAmplitudes = this.amplitudes.slice(0, Math.min(this.currentHarmonics, 20));
    const displayPhases = this.phases.slice(0, Math.min(this.currentHarmonics, 20));

    const yRangeAmp = autoScaleYWithZero(displayAmplitudes, 0.2);
    const xRange: [number, number] = [0, displayAmplitudes.length];

    clearCanvas(this.barsCtx, this.barsCanvas.width, this.barsCanvas.height);

    this.barsCtx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    this.barsCtx.font = 'bold 12px -apple-system, BlinkMacSystemFont, sans-serif';
    this.barsCtx.textAlign = 'center';
    this.barsCtx.fillText('幅值', this.barsCanvas.width / 2, 15);

    const halfHeight = this.barsCanvas.height / 2 - 10;

    drawGrid(
      this.barsCtx,
      this.barsCanvas.width,
      halfHeight - 20,
      xRange,
      yRangeAmp,
      5,
      4
    );
    drawAxes(
      this.barsCtx,
      this.barsCanvas.width,
      halfHeight - 20,
      xRange,
      yRangeAmp,
      '谐波次数',
      '幅值',
      40
    );

    const highlightIndices = Array.from({ length: displayAmplitudes.length }, (_, i) => i);

    drawBarPlot(
      this.barsCtx,
      displayAmplitudes,
      this.barsCanvas.width,
      halfHeight - 20,
      xRange,
      yRangeAmp,
      '#7c4dff',
      0.7,
      40,
      highlightIndices
    );

    this.barsCtx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    this.barsCtx.fillText('相位', this.barsCanvas.width / 2, halfHeight + 25);

    const yRangePhase: [number, number] = [-Math.PI - 0.5, Math.PI + 0.5];
    const phaseValues = displayPhases.map(p => (p > Math.PI ? p - 2 * Math.PI : p));

    drawGrid(
      this.barsCtx,
      this.barsCanvas.width,
      halfHeight - 20,
      xRange,
      yRangePhase,
      5,
      4
    );

    const secondHalfY = halfHeight + 40;
    this.barsCtx.save();
    this.barsCtx.translate(0, secondHalfY);

    drawAxes(
      this.barsCtx,
      this.barsCanvas.width,
      halfHeight - 20,
      xRange,
      yRangePhase,
      '谐波次数',
      '相位 (rad)',
      40
    );

    drawBarPlot(
      this.barsCtx,
      phaseValues,
      this.barsCanvas.width,
      halfHeight - 20,
      xRange,
      yRangePhase,
      '#ffa726',
      0.7,
      40,
      highlightIndices
    );

    this.barsCtx.restore();
  }

  public destroy(): void {
    this.stopAnimation();
  }
}
