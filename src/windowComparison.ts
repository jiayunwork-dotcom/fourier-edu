import { generateWindow, computeSpectrum, powerToDB } from './mathUtils';
import {
  clearCanvas,
  drawGrid,
  drawAxes,
  drawLinePlotWithX,
} from './canvasUtils';

const WINDOW_COLORS: Record<string, string> = {
  rect: '#ef5350',
  hanning: '#4fc3f7',
  hamming: '#66bb6a',
  blackman: '#ffa726',
  kaiser: '#7c4dff',
};

const WINDOW_NAMES: Record<string, string> = {
  rect: '矩形窗',
  hanning: 'Hanning窗',
  hamming: 'Hamming窗',
  blackman: 'Blackman窗',
  kaiser: 'Kaiser窗',
};

const NUM_POINTS = 256;
const SAMPLE_RATE = 1000;

export class WindowComparison {
  private timeCanvas: HTMLCanvasElement;
  private timeCtx: CanvasRenderingContext2D;
  private freqCanvas: HTMLCanvasElement;
  private freqCtx: CanvasRenderingContext2D;
  private selectedWindows: string[] = ['rect', 'hanning', 'hamming', 'blackman'];
  private kaiserBeta: number = 5;

  constructor() {
    this.timeCanvas = document.getElementById('window-time-domain') as HTMLCanvasElement;
    this.timeCtx = this.timeCanvas.getContext('2d')!;
    this.freqCanvas = document.getElementById('window-frequency-domain') as HTMLCanvasElement;
    this.freqCtx = this.freqCanvas.getContext('2d')!;

    this.setupEventListeners();
    this.render();
  }

  private setupEventListeners(): void {
    const checkboxes = document.querySelectorAll('.window-checkbox');
    checkboxes.forEach((checkbox) => {
      checkbox.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        const value = target.value;

        if (target.checked) {
          if (!this.selectedWindows.includes(value)) {
            this.selectedWindows.push(value);
          }
        } else {
          this.selectedWindows = this.selectedWindows.filter((w) => w !== value);
        }

        this.render();
      });
    });

    document.getElementById('window-kaiser-beta')!.addEventListener('input', (e) => {
      this.kaiserBeta = parseFloat((e.target as HTMLInputElement).value);
      document.getElementById('window-kaiser-beta-value')!.textContent = this.kaiserBeta.toFixed(1);
      this.render();
    });
  }

  public render(): void {
    this.renderTimeDomain();
    this.renderFrequencyDomain();
    this.renderLegend();
  }

  private renderTimeDomain(): void {
    const width = this.timeCanvas.width;
    const height = this.timeCanvas.height;
    const padding = 50;

    const xRange: [number, number] = [0, NUM_POINTS];
    const yRange: [number, number] = [0, 1.1];

    clearCanvas(this.timeCtx, width, height);
    drawGrid(this.timeCtx, width, height, xRange, yRange);
    drawAxes(this.timeCtx, width, height, xRange, yRange, '样本点 n', 'w(n)', padding);

    const xData = Array.from({ length: NUM_POINTS }, (_, i) => i);

    for (const windowType of this.selectedWindows) {
      const window = generateWindow(windowType, NUM_POINTS, this.kaiserBeta);
      const color = WINDOW_COLORS[windowType] || '#ffffff';

      drawLinePlotWithX(
        this.timeCtx,
        xData,
        window,
        width,
        height,
        xRange,
        yRange,
        color,
        2,
        padding
      );
    }
  }

  private renderFrequencyDomain(): void {
    const width = this.freqCanvas.width;
    const height = this.freqCanvas.height;
    const padding = 50;

    const maxFreq = SAMPLE_RATE / 2;
    const xRange: [number, number] = [0, maxFreq];
    const yRange: [number, number] = [-120, 10];

    clearCanvas(this.freqCtx, width, height);
    drawGrid(this.freqCtx, width, height, xRange, yRange);
    drawAxes(this.freqCtx, width, height, xRange, yRange, '频率 (Hz)', '幅度 (dB)', padding);

    const impulse: number[] = new Array(NUM_POINTS).fill(0);
    impulse[Math.floor(NUM_POINTS / 2)] = 1;

    for (const windowType of this.selectedWindows) {
      const window = generateWindow(windowType, NUM_POINTS, this.kaiserBeta);
      const windowedSignal = impulse.map((v, i) => v * window[i]);

      const spectrum = computeSpectrum(windowedSignal, SAMPLE_RATE, 4);
      const powerDB = powerToDB(spectrum.power);

      const displayFreqs: number[] = [];
      const displayPower: number[] = [];
      for (let i = 0; i < spectrum.frequencies.length; i++) {
        if (spectrum.frequencies[i] <= maxFreq) {
          displayFreqs.push(spectrum.frequencies[i]);
          displayPower.push(Math.max(-120, powerDB[i]));
        }
      }

      const color = WINDOW_COLORS[windowType] || '#ffffff';

      drawLinePlotWithX(
        this.freqCtx,
        displayFreqs,
        displayPower,
        width,
        height,
        xRange,
        yRange,
        color,
        2,
        padding
      );
    }
  }

  private renderLegend(): void {
    const legendEl = document.getElementById('window-legend')!;
    legendEl.innerHTML = '';

    for (const windowType of this.selectedWindows) {
      const item = document.createElement('span');
      item.className = 'legend-item';

      const colorSpan = document.createElement('span');
      colorSpan.className = 'legend-color';
      colorSpan.style.background = WINDOW_COLORS[windowType] || '#ffffff';

      const label = document.createElement('span');
      label.textContent = WINDOW_NAMES[windowType] || windowType;
      if (windowType === 'kaiser') {
        label.textContent += ` (β=${this.kaiserBeta.toFixed(1)})`;
      }

      item.appendChild(colorSpan);
      item.appendChild(label);
      legendEl.appendChild(item);
    }
  }
}
