import {
  computeSpectrum,
  dft,
  idft,
  applyFilter,
  generateWindow,
} from './mathUtils';
import {
  clearCanvas,
  drawGrid,
  drawAxes,
  drawStemPlotWithX,
  drawLinePlot,
  drawSelectionBox,
  autoScaleY,
  autoScaleYWithZero,
} from './canvasUtils';

const SAMPLE_RATE = 1000;

export class FrequencyFilter {
  private specCanvas: HTMLCanvasElement;
  private specCtx: CanvasRenderingContext2D;
  private timeCanvas: HTMLCanvasElement;
  private timeCtx: CanvasRenderingContext2D;
  private filterType: string = 'lowpass';
  private cutoff1: number = 50;
  private cutoff2: number = 150;
  private filteredSignal: number[] | null = null;
  private isSelecting: boolean = false;
  private selectionStart: { x: number; y: number } | null = null;
  private selectionEnd: { x: number; y: number } | null = null;
  private selectionEnabled: boolean = false;
  private selectedFreqRange: [number, number] | null = null;
  private currentSignal: number[] = [];

  constructor() {
    this.specCanvas = document.getElementById('filter-spectrum') as HTMLCanvasElement;
    this.specCtx = this.specCanvas.getContext('2d')!;
    this.timeCanvas = document.getElementById('filter-time-domain') as HTMLCanvasElement;
    this.timeCtx = this.timeCanvas.getContext('2d')!;

    this.setupEventListeners();
  }

  public setSignal(signal: number[]): void {
    this.currentSignal = signal.slice(0, 512);
    this.filteredSignal = null;
    this.update();
  }

  private update(): void {
    if (this.currentSignal.length > 0) {
      this.render(this.currentSignal);
    }
  }

  private setupEventListeners(): void {
    document.getElementById('filter-type')!.addEventListener('change', (e) => {
      this.filterType = (e.target as HTMLSelectElement).value;
      const cutoff2Group = document.getElementById('cutoff2-group')!;
      cutoff2Group.style.display = this.filterType === 'bandpass' ? 'block' : 'none';
      this.applyFilterToSignal();
    });

    document.getElementById('cutoff1')!.addEventListener('input', (e) => {
      this.cutoff1 = parseInt((e.target as HTMLInputElement).value);
      document.getElementById('cutoff1-value')!.textContent = this.cutoff1.toString();
    });

    document.getElementById('cutoff2')!.addEventListener('input', (e) => {
      this.cutoff2 = parseInt((e.target as HTMLInputElement).value);
      document.getElementById('cutoff2-value')!.textContent = this.cutoff2.toString();
    });

    document.getElementById('apply-filter')!.addEventListener('click', () => {
      this.applyFilterToSignal();
    });

    document.getElementById('reset-filter')!.addEventListener('click', () => {
      this.filteredSignal = null;
      this.selectedFreqRange = null;
      this.update();
    });

    document.getElementById('enable-selection')!.addEventListener('click', () => {
      this.selectionEnabled = !this.selectionEnabled;
      const btn = document.getElementById('enable-selection') as HTMLButtonElement;
      if (this.selectionEnabled) {
        btn.textContent = '取消框选';
        btn.classList.remove('btn-secondary');
        btn.classList.add('btn-primary');
        this.specCanvas.style.cursor = 'crosshair';
      } else {
        btn.textContent = '框选频率范围';
        btn.classList.add('btn-secondary');
        btn.classList.remove('btn-primary');
        this.specCanvas.style.cursor = 'default';
      }
    });

    this.specCanvas.addEventListener('mousedown', (e) => this.startSelection(e));
    this.specCanvas.addEventListener('mousemove', (e) => this.updateSelection(e));
    this.specCanvas.addEventListener('mouseup', (e) => this.endSelection(e));
    this.specCanvas.addEventListener('mouseleave', () => this.cancelSelection());
  }

  private startSelection(e: MouseEvent): void {
    if (!this.selectionEnabled) return;
    this.isSelecting = true;
    const rect = this.specCanvas.getBoundingClientRect();
    this.selectionStart = {
      x: (e.clientX - rect.left) * (this.specCanvas.width / rect.width),
      y: (e.clientY - rect.top) * (this.specCanvas.height / rect.height),
    };
    this.selectionEnd = { ...this.selectionStart };
  }

  private updateSelection(e: MouseEvent): void {
    if (!this.isSelecting || !this.selectionStart) return;
    const rect = this.specCanvas.getBoundingClientRect();
    this.selectionEnd = {
      x: (e.clientX - rect.left) * (this.specCanvas.width / rect.width),
      y: (e.clientY - rect.top) * (this.specCanvas.height / rect.height),
    };
  }

  private endSelection(_e: MouseEvent): void {
    if (!this.isSelecting || !this.selectionStart || !this.selectionEnd) return;

    const padding = 50;
    const plotWidth = this.specCanvas.width - 2 * padding;
    const maxFreq = SAMPLE_RATE / 2;

    let freq1 = ((this.selectionStart.x - padding) / plotWidth) * maxFreq;
    let freq2 = ((this.selectionEnd.x - padding) / plotWidth) * maxFreq;

    freq1 = Math.max(0, Math.min(maxFreq, freq1));
    freq2 = Math.max(0, Math.min(maxFreq, freq2));

    this.selectedFreqRange = [Math.min(freq1, freq2), Math.max(freq1, freq2)];

    this.cutoff1 = Math.round(this.selectedFreqRange[0]);
    this.cutoff2 = Math.round(this.selectedFreqRange[1]);

    (document.getElementById('cutoff1') as HTMLInputElement).value = this.cutoff1.toString();
    document.getElementById('cutoff1-value')!.textContent = this.cutoff1.toString();
    (document.getElementById('cutoff2') as HTMLInputElement).value = this.cutoff2.toString();
    document.getElementById('cutoff2-value')!.textContent = this.cutoff2.toString();

    if (this.selectedFreqRange[1] - this.selectedFreqRange[0] > 5) {
      this.filterType = 'bandpass';
      (document.getElementById('filter-type') as HTMLSelectElement).value = 'bandpass';
      document.getElementById('cutoff2-group')!.style.display = 'block';
    } else {
      if (this.selectedFreqRange[0] < maxFreq / 2) {
        this.filterType = 'lowpass';
        (document.getElementById('filter-type') as HTMLSelectElement).value = 'lowpass';
        document.getElementById('cutoff2-group')!.style.display = 'none';
      } else {
        this.filterType = 'highpass';
        (document.getElementById('filter-type') as HTMLSelectElement).value = 'highpass';
        document.getElementById('cutoff2-group')!.style.display = 'none';
      }
    }

    this.isSelecting = false;
    this.selectionStart = null;
    this.selectionEnd = null;
  }

  private cancelSelection(): void {
    this.isSelecting = false;
    this.selectionStart = null;
    this.selectionEnd = null;
  }

  private applyFilterToSignal(): void {
    const event = new CustomEvent('filter-request', {
      detail: {
        filterType: this.filterType,
        cutoff1: this.cutoff1,
        cutoff2: this.cutoff2,
      },
    });
    document.dispatchEvent(event);
  }

  public processSignal(signal: number[]): number[] | null {
    const window = generateWindow('hanning', signal.length);
    const windowed = signal.map((v, i) => v * window[i]);

    const spectrum = dft(windowed);
    const filtered = applyFilter(spectrum, this.filterType, this.cutoff1, this.cutoff2, SAMPLE_RATE);
    this.filteredSignal = idft(filtered);

    return this.filteredSignal;
  }

  public render(originalSignal: number[] | null): void {
    if (originalSignal) {
      const window = generateWindow('hanning', originalSignal.length);
      const windowed = originalSignal.map((v, i) => v * window[i]);
      const spectrum = computeSpectrum(windowed, SAMPLE_RATE);
      this.renderSpectrum(spectrum.frequencies, spectrum.magnitude);
    }

    this.renderTimeDomain(originalSignal);
  }

  private renderSpectrum(frequencies: number[], magnitude: number[]): void {
    const width = this.specCanvas.width;
    const height = this.specCanvas.height;
    const padding = 50;

    const maxFreq = SAMPLE_RATE / 2;
    const xRange: [number, number] = [0, maxFreq];
    const yRange = autoScaleYWithZero(magnitude, 0.2);

    clearCanvas(this.specCtx, width, height);
    drawGrid(this.specCtx, width, height, xRange, yRange);
    drawAxes(this.specCtx, width, height, xRange, yRange, '频率 (Hz)', '幅值', padding);

    const displayFreqs: number[] = [];
    const displayMags: number[] = [];
    for (let i = 0; i < frequencies.length; i++) {
      if (frequencies[i] <= maxFreq) {
        displayFreqs.push(frequencies[i]);
        displayMags.push(magnitude[i]);
      }
    }

    drawStemPlotWithX(
      this.specCtx,
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

    if (this.selectionStart && this.selectionEnd) {
      drawSelectionBox(
        this.specCtx,
        this.selectionStart.x,
        this.selectionEnd.x,
        this.selectionStart.y,
        this.selectionEnd.y
      );
    }

    if (this.selectedFreqRange) {
      const plotWidth = width - 2 * padding;
      const x1 = padding + (this.selectedFreqRange[0] / maxFreq) * plotWidth;
      const x2 = padding + (this.selectedFreqRange[1] / maxFreq) * plotWidth;

      this.specCtx.fillStyle = 'rgba(124, 77, 255, 0.15)';
      this.specCtx.fillRect(x1, padding, x2 - x1, height - 2 * padding);

      this.specCtx.strokeStyle = '#7c4dff';
      this.specCtx.lineWidth = 2;
      this.specCtx.strokeRect(x1, padding, x2 - x1, height - 2 * padding);
    }

    this.drawFilterMask(xRange, yRange, padding, width, height);
  }

  private drawFilterMask(
    xRange: [number, number],
    _yRange: [number, number],
    padding: number,
    width: number,
    height: number
  ): void {
    const plotWidth = width - 2 * padding;
    const plotHeight = height - 2 * padding;
    // const yScale = plotHeight / (yRange[1] - yRange[0]);
    // const maskY = height - padding - (0 - yRange[0]) * yScale;

    this.specCtx.fillStyle = 'rgba(239, 83, 80, 0.1)';

    if (this.filterType === 'lowpass') {
      const x = padding + (this.cutoff1 / xRange[1]) * plotWidth;
      this.specCtx.fillRect(x, padding, width - x - padding, plotHeight);
    } else if (this.filterType === 'highpass') {
      const x = padding + (this.cutoff1 / xRange[1]) * plotWidth;
      this.specCtx.fillRect(padding, padding, x - padding, plotHeight);
    } else if (this.filterType === 'bandpass') {
      const x1 = padding + (this.cutoff1 / xRange[1]) * plotWidth;
      const x2 = padding + (this.cutoff2 / xRange[1]) * plotWidth;
      this.specCtx.fillRect(padding, padding, x1 - padding, plotHeight);
      this.specCtx.fillRect(x2, padding, width - x2 - padding, plotHeight);
    }
  }

  private renderTimeDomain(originalSignal: number[] | null): void {
    const width = this.timeCanvas.width;
    const height = this.timeCanvas.height;
    const padding = 50;
    const timeRange: [number, number] = [0, 0.1];

    let yRange: [number, number] = [-1, 1];
    if (originalSignal) {
      const allValues = [...originalSignal];
      if (this.filteredSignal) {
        allValues.push(...this.filteredSignal);
      }
      yRange = autoScaleY(allValues, 0.15);
    }

    clearCanvas(this.timeCtx, width, height);
    drawGrid(this.timeCtx, width, height, timeRange, yRange);
    drawAxes(this.timeCtx, width, height, timeRange, yRange, '时间 (s)', '幅值', padding);

    if (originalSignal) {
      drawLinePlot(
        this.timeCtx,
        originalSignal,
        width,
        height,
        timeRange,
        yRange,
        '#4fc3f7',
        2,
        padding
      );
    }

    if (this.filteredSignal) {
      this.timeCtx.setLineDash([5, 5]);
      drawLinePlot(
        this.timeCtx,
        this.filteredSignal,
        width,
        height,
        timeRange,
        yRange,
        '#7c4dff',
        2,
        padding
      );
      this.timeCtx.setLineDash([]);
    }
  }

  public getFilteredSignal(): number[] | null {
    return this.filteredSignal;
  }
}
