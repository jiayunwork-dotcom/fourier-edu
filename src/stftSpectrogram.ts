import {
  generateWindow,
  viridisColor,
  computeSTFT,
  generateChirpSignal,
  normalize,
} from './mathUtils';
import {
  clearCanvas,
  drawGrid,
  drawAxes,
  drawLinePlotWithX,
  autoScaleY,
} from './canvasUtils';
import type { SignalBuilder } from './signalBuilder';

interface STFTSettings {
  frameLength: number;
  hopSizePercent: number;
  windowType: string;
  dbRange: number;
}

interface STFTResult {
  magnitudeSpectrogram: number[][];
  phaseSpectrogram: number[][];
  timeFrames: number[];
  frequencyBins: number[];
  dbSpectrogram: number[][];
}

export class STFTSpectrogram {
  private waveformCanvas: HTMLCanvasElement;
  private waveformCtx: CanvasRenderingContext2D;
  private spectrogramCanvas: HTMLCanvasElement;
  private spectrogramCtx: CanvasRenderingContext2D;
  private colorbarCanvas: HTMLCanvasElement;
  private colorbarCtx: CanvasRenderingContext2D;
  private uncertaintyCanvas: HTMLCanvasElement;
  private uncertaintyCtx: CanvasRenderingContext2D;
  private frameSpectrumCanvas: HTMLCanvasElement;
  private frameSpectrumCtx: CanvasRenderingContext2D;

  private settings: STFTSettings = {
    frameLength: 256,
    hopSizePercent: 50,
    windowType: 'hanning',
    dbRange: 60,
  };

  private currentSignal: number[] = [];
  private sampleRate: number = 8000;
  private stftResult: STFTResult | null = null;
  private signalBuilder: SignalBuilder | null = null;

  private isDragging: boolean = false;
  private dragStart: { x: number; y: number } | null = null;
  private dragEnd: { x: number; y: number } | null = null;
  private selectedRegion: {
    timeStart: number;
    timeEnd: number;
    freqStart: number;
    freqEnd: number;
  } | null = null;

  private padding: number = 50;

  constructor() {
    this.waveformCanvas = document.getElementById('stft-waveform-canvas') as HTMLCanvasElement;
    this.waveformCtx = this.waveformCanvas.getContext('2d')!;
    this.spectrogramCanvas = document.getElementById('stft-spectrogram-canvas') as HTMLCanvasElement;
    this.spectrogramCtx = this.spectrogramCanvas.getContext('2d')!;
    this.colorbarCanvas = document.getElementById('stft-colorbar-canvas') as HTMLCanvasElement;
    this.colorbarCtx = this.colorbarCanvas.getContext('2d')!;
    this.uncertaintyCanvas = document.getElementById('stft-uncertainty-canvas') as HTMLCanvasElement;
    this.uncertaintyCtx = this.uncertaintyCanvas.getContext('2d')!;
    this.frameSpectrumCanvas = document.getElementById('stft-frame-spectrum-canvas') as HTMLCanvasElement;
    this.frameSpectrumCtx = this.frameSpectrumCanvas.getContext('2d')!;

    this.setupEventListeners();
    this.updateResolutionDisplay();
    this.renderUncertaintyPrinciple();
    this.loadBuiltinSignal('chirp');
  }

  public setSignalBuilder(signalBuilder: SignalBuilder): void {
    this.signalBuilder = signalBuilder;
  }

  private setupEventListeners(): void {
    document.getElementById('stft-signal-source')!.addEventListener('change', (e) => {
      const source = (e.target as HTMLSelectElement).value;
      this.updateSignalSourceUI(source);
    });

    document.getElementById('stft-load-signal')!.addEventListener('click', () => {
      this.loadSignal();
    });

    document.getElementById('stft-frame-length')!.addEventListener('change', (e) => {
      this.settings.frameLength = parseInt((e.target as HTMLSelectElement).value);
      this.updateResolutionDisplay();
      this.renderUncertaintyPrinciple();
      this.update();
    });

    document.getElementById('stft-hop-size')!.addEventListener('change', (e) => {
      this.settings.hopSizePercent = parseInt((e.target as HTMLSelectElement).value);
      this.update();
    });

    document.getElementById('stft-window')!.addEventListener('change', (e) => {
      this.settings.windowType = (e.target as HTMLSelectElement).value;
      this.update();
    });

    document.getElementById('stft-db-range')!.addEventListener('input', (e) => {
      this.settings.dbRange = parseInt((e.target as HTMLInputElement).value);
      document.getElementById('stft-db-range-value')!.textContent = `-${this.settings.dbRange} ~ 0 dB`;
      this.update();
    });

    this.spectrogramCanvas.addEventListener('mousemove', (e) => {
      this.handleMouseMove(e);
    });

    this.spectrogramCanvas.addEventListener('mouseleave', () => {
      document.getElementById('stft-info-bar')!.textContent = '悬停在瀑布图上查看详细信息';
    });

    this.spectrogramCanvas.addEventListener('mousedown', (e) => {
      this.handleMouseDown(e);
    });

    this.spectrogramCanvas.addEventListener('mouseup', (e) => {
      this.handleMouseUp(e);
    });

    document.getElementById('stft-close-panel')!.addEventListener('click', () => {
      document.getElementById('stft-side-panel')!.classList.remove('active');
    });

    document.getElementById('stft-imported-samplerate')!.addEventListener('change', (e) => {
      this.sampleRate = parseInt((e.target as HTMLSelectElement).value);
    });
  }

  private updateSignalSourceUI(source: string): void {
    document.getElementById('stft-builtin-group')!.style.display = source === 'builtin' ? 'block' : 'none';
    document.getElementById('stft-manual-group')!.style.display = source === 'manual' ? 'block' : 'none';
    document.getElementById('stft-imported-group')!.style.display = source === 'imported' ? 'block' : 'none';
  }

  private loadSignal(): void {
    const source = (document.getElementById('stft-signal-source') as HTMLSelectElement).value;

    switch (source) {
      case 'builtin':
        const builtinType = (document.getElementById('stft-builtin-signal') as HTMLSelectElement).value;
        this.sampleRate = 8000;
        this.loadBuiltinSignal(builtinType);
        break;
      case 'imported':
        this.sampleRate = parseInt((document.getElementById('stft-imported-samplerate') as HTMLSelectElement).value);
        this.loadImportedSignal();
        break;
      case 'manual':
        this.sampleRate = 8000;
        this.loadManualSignal();
        break;
    }
  }

  private loadBuiltinSignal(type: string): void {
    const duration = 1.0;
    const numSamples = Math.floor(this.sampleRate * duration);
    const signal: number[] = [];

    for (let i = 0; i < numSamples; i++) {
      const t = i / this.sampleRate;
      let value = 0;

      switch (type) {
        case 'chirp':
          value = generateChirpSignal(t, duration, 100, 3000, 1.0);
          break;
        case 'dual':
          if (t < duration / 2) {
            value = Math.sin(2 * Math.PI * 500 * t);
          } else {
            value = Math.sin(2 * Math.PI * 2000 * t);
          }
          break;
        case 'am':
          const carrier = Math.sin(2 * Math.PI * 1500 * t);
          const modulator = 1 + 0.5 * Math.sin(2 * Math.PI * 5 * t);
          value = carrier * modulator;
          break;
      }

      signal.push(value);
    }

    this.currentSignal = normalize(signal);
    this.update();
  }

  private loadImportedSignal(): void {
    if (this.signalBuilder) {
      const duration = 1.0;
      const numSamples = Math.floor(this.sampleRate * duration);
      const signal = this.signalBuilder.getSignal(this.sampleRate, numSamples);
      this.currentSignal = normalize(signal);
      this.update();
    } else {
      alert('请先在"信号构造"模块中生成信号');
    }
  }

  private loadManualSignal(): void {
    const input = (document.getElementById('stft-manual-input') as HTMLTextAreaElement).value;
    try {
      const signal = JSON.parse(input);
      if (!Array.isArray(signal) || signal.length === 0) {
        throw new Error('请输入有效的数值数组');
      }
      if (signal.some(v => typeof v !== 'number')) {
        throw new Error('数组元素必须是数字');
      }
      this.currentSignal = normalize(signal);
      this.update();
    } catch (e) {
      alert('JSON解析错误: ' + (e as Error).message);
    }
  }

  private updateResolutionDisplay(): void {
    const timeResMs = (this.settings.frameLength / this.sampleRate) * 1000;
    const freqResHz = this.sampleRate / this.settings.frameLength;

    document.getElementById('stft-time-resolution')!.textContent = `${timeResMs.toFixed(1)} ms`;
    document.getElementById('stft-freq-resolution')!.textContent = `${freqResHz.toFixed(2)} Hz`;
  }

  private renderUncertaintyPrinciple(): void {
    const width = this.uncertaintyCanvas.width;
    const height = this.uncertaintyCanvas.height;

    clearCanvas(this.uncertaintyCtx, width, height);

    const centerX = width / 2;
    const centerY = height / 2;

    const maxFrameLength = 512;
    const minFrameLength = 64;

    const norm = (this.settings.frameLength - minFrameLength) / (maxFrameLength - minFrameLength);

    const maxTimeWidth = 180;
    const minTimeWidth = 40;
    const maxFreqHeight = 80;
    const minFreqHeight = 20;

    const timeWidth = minTimeWidth + (1 - norm) * (maxTimeWidth - minTimeWidth);
    const freqHeight = minFreqHeight + norm * (maxFreqHeight - minFreqHeight);

    this.uncertaintyCtx.fillStyle = 'rgba(79, 195, 247, 0.2)';
    this.uncertaintyCtx.strokeStyle = '#4fc3f7';
    this.uncertaintyCtx.lineWidth = 2;

    this.uncertaintyCtx.beginPath();
    this.uncertaintyCtx.rect(centerX - timeWidth / 2, centerY - freqHeight / 2, timeWidth, freqHeight);
    this.uncertaintyCtx.fill();
    this.uncertaintyCtx.stroke();

    this.uncertaintyCtx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    this.uncertaintyCtx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
    this.uncertaintyCtx.textAlign = 'center';

    this.uncertaintyCtx.fillText('时间轴', centerX, height - 15);
    this.uncertaintyCtx.save();
    this.uncertaintyCtx.translate(15, centerY);
    this.uncertaintyCtx.rotate(-Math.PI / 2);
    this.uncertaintyCtx.fillText('频率轴', 0, 0);
    this.uncertaintyCtx.restore();

    this.uncertaintyCtx.fillStyle = '#4fc3f7';
    this.uncertaintyCtx.font = 'bold 10px -apple-system, BlinkMacSystemFont, sans-serif';
    this.uncertaintyCtx.textAlign = 'center';
    this.uncertaintyCtx.fillText(
      `Δt = ${((this.settings.frameLength / this.sampleRate) * 1000).toFixed(1)}ms`,
      centerX,
      centerY - freqHeight / 2 - 8
    );
  }

  private update(): void {
    if (this.currentSignal.length === 0) return;

    const hopSize = Math.floor(this.settings.frameLength * (this.settings.hopSizePercent / 100));
    const window = generateWindow(this.settings.windowType, this.settings.frameLength);

    const result = computeSTFT(
      this.currentSignal,
      this.settings.frameLength,
      hopSize,
      window,
      this.sampleRate
    );

    const maxMag = Math.max(...result.magnitudeSpectrogram.flat());
    const reference = maxMag * maxMag;

    const dbSpectrogram: number[][] = result.magnitudeSpectrogram.map(frame =>
      frame.map(mag => {
        const power = mag * mag;
        const db = 10 * Math.log10(power / reference);
        return isFinite(db) ? db : -this.settings.dbRange;
      })
    );

    this.stftResult = {
      ...result,
      dbSpectrogram,
    };

    this.render();
  }

  private render(): void {
    this.renderWaveformThumbnail();
    this.renderSpectrogram();
    this.renderColorbar();
  }

  private renderWaveformThumbnail(): void {
    const width = this.waveformCanvas.width;
    const height = this.waveformCanvas.height;

    clearCanvas(this.waveformCtx, width, height);

    const xRange: [number, number] = [0, this.currentSignal.length / this.sampleRate];
    const yRange = autoScaleY(this.currentSignal, 0.1);

    drawGrid(this.waveformCtx, width, height, xRange, yRange, 10, 3);

    this.waveformCtx.strokeStyle = 'rgba(150, 150, 150, 0.8)';
    this.waveformCtx.lineWidth = 1;
    this.waveformCtx.lineCap = 'round';
    this.waveformCtx.lineJoin = 'round';
    this.waveformCtx.beginPath();

    const plotWidth = width;
    const plotHeight = height;
    const yScale = plotHeight / (yRange[1] - yRange[0]);

    for (let i = 0; i < this.currentSignal.length; i++) {
      const x = (i / (this.currentSignal.length - 1)) * plotWidth;
      const y = height - (this.currentSignal[i] - yRange[0]) * yScale - plotHeight * 0;

      if (i === 0) {
        this.waveformCtx.moveTo(x, y);
      } else {
        this.waveformCtx.lineTo(x, y);
      }
    }

    this.waveformCtx.stroke();

    this.waveformCtx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    this.waveformCtx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
    this.waveformCtx.textAlign = 'left';
    this.waveformCtx.fillText('时域波形', 5, 15);
  }

  private renderSpectrogram(): void {
    if (!this.stftResult) return;

    const width = this.spectrogramCanvas.width;
    const height = this.spectrogramCanvas.height;

    clearCanvas(this.spectrogramCtx, width, height);

    const { dbSpectrogram, timeFrames } = this.stftResult;
    const numFrames = dbSpectrogram.length;
    const numFreqBins = dbSpectrogram[0].length;

    const plotWidth = width - 2 * this.padding;
    const plotHeight = height - 2 * this.padding;

    const cellWidth = plotWidth / numFrames;
    const cellHeight = plotHeight / numFreqBins;

    const minDB = -this.settings.dbRange;
    const maxDB = 0;

    for (let frameIdx = 0; frameIdx < numFrames; frameIdx++) {
      for (let freqIdx = 0; freqIdx < numFreqBins; freqIdx++) {
        const db = dbSpectrogram[frameIdx][numFreqBins - 1 - freqIdx];
        const normalized = Math.max(0, Math.min(1, (db - minDB) / (maxDB - minDB)));
        const color = viridisColor(normalized);

        this.spectrogramCtx.fillStyle = color;
        this.spectrogramCtx.fillRect(
          this.padding + frameIdx * cellWidth,
          this.padding + freqIdx * cellHeight,
          Math.ceil(cellWidth),
          Math.ceil(cellHeight)
        );
      }
    }

    const xRange: [number, number] = [timeFrames[0], timeFrames[timeFrames.length - 1]];
    const yRange: [number, number] = [0, this.sampleRate / 2];

    drawAxes(
      this.spectrogramCtx,
      width,
      height,
      xRange,
      yRange,
      '时间 (s)',
      '频率 (Hz)',
      this.padding
    );

    if (this.selectedRegion) {
      this.renderSelectionBox();
    }
  }

  private renderColorbar(): void {
    const width = this.colorbarCanvas.width;
    const height = this.colorbarCanvas.height;

    clearCanvas(this.colorbarCtx, width, height);

    const barWidth = 15;
    const barHeight = height - 60;
    const startY = 30;
    const x = (width - barWidth) / 2;

    for (let i = 0; i < barHeight; i++) {
      const normalized = 1 - i / barHeight;
      const color = viridisColor(normalized);
      this.colorbarCtx.fillStyle = color;
      this.colorbarCtx.fillRect(x, startY + i, barWidth, 1);
    }

    this.colorbarCtx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    this.colorbarCtx.lineWidth = 1;
    this.colorbarCtx.strokeRect(x, startY, barWidth, barHeight);

    this.colorbarCtx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    this.colorbarCtx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
    this.colorbarCtx.textAlign = 'left';

    const numTicks = 5;
    for (let i = 0; i <= numTicks; i++) {
      const y = startY + (i / numTicks) * barHeight;
      const db = 0 - (i / numTicks) * this.settings.dbRange;

      this.colorbarCtx.fillText(`${db.toFixed(0)}`, x + barWidth + 5, y + 3);
      this.colorbarCtx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      this.colorbarCtx.fillRect(x - 3, y, 3, 1);
      this.colorbarCtx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    }

    this.colorbarCtx.textAlign = 'center';
    this.colorbarCtx.fillText('dB', width / 2, 20);
  }

  private handleMouseMove(e: MouseEvent): void {
    if (!this.stftResult) return;

    const rect = this.spectrogramCanvas.getBoundingClientRect();
    const scaleX = this.spectrogramCanvas.width / rect.width;
    const scaleY = this.spectrogramCanvas.height / rect.height;

    const canvasX = (e.clientX - rect.left) * scaleX;
    const canvasY = (e.clientY - rect.top) * scaleY;

    const plotWidth = this.spectrogramCanvas.width - 2 * this.padding;
    const plotHeight = this.spectrogramCanvas.height - 2 * this.padding;

    if (
      canvasX < this.padding ||
      canvasX > this.padding + plotWidth ||
      canvasY < this.padding ||
      canvasY > this.padding + plotHeight
    ) {
      return;
    }

    const timeNorm = (canvasX - this.padding) / plotWidth;
    const freqNorm = 1 - (canvasY - this.padding) / plotHeight;

    const { timeFrames, dbSpectrogram } = this.stftResult;

    const time = timeFrames[0] + timeNorm * (timeFrames[timeFrames.length - 1] - timeFrames[0]);
    const freq = freqNorm * (this.sampleRate / 2);

    const frameIdx = Math.floor(timeNorm * dbSpectrogram.length);
    const freqIdx = Math.floor(freqNorm * (dbSpectrogram[0].length - 1));

    const db = dbSpectrogram[Math.min(frameIdx, dbSpectrogram.length - 1)][Math.min(freqIdx, dbSpectrogram[0].length - 1)];

    document.getElementById('stft-info-bar')!.textContent =
      `时间: ${time.toFixed(3)}s | 频率: ${freq.toFixed(1)}Hz | 能量: ${db.toFixed(1)}dB`;

    if (this.isDragging && this.dragStart) {
      this.dragEnd = { x: canvasX, y: canvasY };
      this.renderSpectrogram();
      this.renderSelectionBox();
    }
  }

  private handleMouseDown(e: MouseEvent): void {
    if (!this.stftResult) return;

    const rect = this.spectrogramCanvas.getBoundingClientRect();
    const scaleX = this.spectrogramCanvas.width / rect.width;
    const scaleY = this.spectrogramCanvas.height / rect.height;

    const canvasX = (e.clientX - rect.left) * scaleX;
    const canvasY = (e.clientY - rect.top) * scaleY;

    const plotWidth = this.spectrogramCanvas.width - 2 * this.padding;
    const plotHeight = this.spectrogramCanvas.height - 2 * this.padding;

    if (
      canvasX < this.padding ||
      canvasX > this.padding + plotWidth ||
      canvasY < this.padding ||
      canvasY > this.padding + plotHeight
    ) {
      return;
    }

    this.isDragging = true;
    this.dragStart = { x: canvasX, y: canvasY };
    this.dragEnd = null;
    this.selectedRegion = null;
    document.getElementById('stft-selection-info')!.style.display = 'none';
  }

  private handleMouseUp(e: MouseEvent): void {
    if (!this.isDragging || !this.dragStart || !this.stftResult) {
      this.isDragging = false;
      return;
    }

    const rect = this.spectrogramCanvas.getBoundingClientRect();
    const scaleX = this.spectrogramCanvas.width / rect.width;
    const scaleY = this.spectrogramCanvas.height / rect.height;

    const canvasX = (e.clientX - rect.left) * scaleX;
    const canvasY = (e.clientY - rect.top) * scaleY;

    const dragDistance = Math.sqrt(
      Math.pow(canvasX - this.dragStart.x, 2) + Math.pow(canvasY - this.dragStart.y, 2)
    );

    if (dragDistance < 5) {
      this.showFrameSpectrum(this.dragStart.x);
    } else {
      this.dragEnd = { x: canvasX, y: canvasY };
      this.showAverageSpectrum();
    }

    this.isDragging = false;
    this.renderSpectrogram();
  }

  private renderSelectionBox(): void {
    if (!this.dragStart || !this.dragEnd) return;

    const x1 = this.dragStart.x;
    const x2 = this.dragEnd.x;
    const y1 = this.dragStart.y;
    const y2 = this.dragEnd.y;

    const left = Math.min(x1, x2);
    const right = Math.max(x1, x2);
    const top = Math.min(y1, y2);
    const bottom = Math.max(y1, y2);

    this.spectrogramCtx.fillStyle = 'rgba(124, 77, 255, 0.2)';
    this.spectrogramCtx.fillRect(left, top, right - left, bottom - top);

    this.spectrogramCtx.strokeStyle = '#7c4dff';
    this.spectrogramCtx.lineWidth = 2;
    this.spectrogramCtx.setLineDash([5, 5]);
    this.spectrogramCtx.strokeRect(left, top, right - left, bottom - top);
    this.spectrogramCtx.setLineDash([]);
  }

  private showFrameSpectrum(clickX: number): void {
    if (!this.stftResult) return;

    const plotWidth = this.spectrogramCanvas.width - 2 * this.padding;
    const timeNorm = (clickX - this.padding) / plotWidth;
    const frameIdx = Math.floor(timeNorm * this.stftResult.magnitudeSpectrogram.length);
    const clampedIdx = Math.max(0, Math.min(frameIdx, this.stftResult.magnitudeSpectrogram.length - 1));

    const magnitudes = this.stftResult.magnitudeSpectrogram[clampedIdx];
    const frequencies = this.stftResult.frequencyBins;
    const time = this.stftResult.timeFrames[clampedIdx];

    document.getElementById('stft-panel-title')!.textContent = `瞬时频谱 @ ${time.toFixed(3)}s`;

    this.renderFrameSpectrum(frequencies, magnitudes);
    document.getElementById('stft-side-panel')!.classList.add('active');
  }

  private showAverageSpectrum(): void {
    if (!this.stftResult || !this.dragStart || !this.dragEnd) return;

    const plotWidth = this.spectrogramCanvas.width - 2 * this.padding;
    const plotHeight = this.spectrogramCanvas.height - 2 * this.padding;

    const x1 = Math.min(this.dragStart.x, this.dragEnd.x);
    const x2 = Math.max(this.dragStart.x, this.dragEnd.x);
    const y1 = Math.min(this.dragStart.y, this.dragEnd.y);
    const y2 = Math.max(this.dragStart.y, this.dragEnd.y);

    const timeNorm1 = (x1 - this.padding) / plotWidth;
    const timeNorm2 = (x2 - this.padding) / plotWidth;
    const freqNorm1 = 1 - (y1 - this.padding) / plotHeight;
    const freqNorm2 = 1 - (y2 - this.padding) / plotHeight;

    const { timeFrames, frequencyBins, magnitudeSpectrogram } = this.stftResult;

    const timeStart = timeFrames[0] + timeNorm1 * (timeFrames[timeFrames.length - 1] - timeFrames[0]);
    const timeEnd = timeFrames[0] + timeNorm2 * (timeFrames[timeFrames.length - 1] - timeFrames[0]);
    const freqStart = freqNorm2 * (this.sampleRate / 2);
    const freqEnd = freqNorm1 * (this.sampleRate / 2);

    this.selectedRegion = { timeStart, timeEnd, freqStart, freqEnd };

    const frameStart = Math.max(0, Math.floor(timeNorm1 * magnitudeSpectrogram.length));
    const frameEnd = Math.min(magnitudeSpectrogram.length - 1, Math.floor(timeNorm2 * magnitudeSpectrogram.length));
    const binStart = Math.max(0, Math.floor(freqNorm2 * (magnitudeSpectrogram[0].length - 1)));
    const binEnd = Math.min(magnitudeSpectrogram[0].length - 1, Math.ceil(freqNorm1 * (magnitudeSpectrogram[0].length - 1)));

    const numFrames = frameEnd - frameStart + 1;
    const numBins = binEnd - binStart + 1;

    const avgMagnitudes: number[] = new Array(magnitudeSpectrogram[0].length).fill(0);

    for (let f = frameStart; f <= frameEnd; f++) {
      for (let b = binStart; b <= binEnd; b++) {
        avgMagnitudes[b] += magnitudeSpectrogram[f][b];
      }
    }

    for (let b = binStart; b <= binEnd; b++) {
      avgMagnitudes[b] /= numFrames;
    }

    const displayFreqs = frequencyBins.slice(binStart, binEnd + 1);
    const displayMags = avgMagnitudes.slice(binStart, binEnd + 1);

    document.getElementById('stft-panel-title')!.textContent =
      `区域平均频谱 (${numFrames}帧 × ${numBins}频点)`;

    document.getElementById('stft-selection-time')!.textContent =
      `${timeStart.toFixed(3)}s ~ ${timeEnd.toFixed(3)}s`;
    document.getElementById('stft-selection-freq')!.textContent =
      `${Math.min(freqStart, freqEnd).toFixed(0)}Hz ~ ${Math.max(freqStart, freqEnd).toFixed(0)}Hz`;
    document.getElementById('stft-selection-info')!.style.display = 'block';

    this.renderFrameSpectrum(displayFreqs, displayMags);
    document.getElementById('stft-side-panel')!.classList.add('active');
  }

  private renderFrameSpectrum(frequencies: number[], magnitudes: number[]): void {
    const width = this.frameSpectrumCanvas.width;
    const height = this.frameSpectrumCanvas.height;
    const padding = 40;

    clearCanvas(this.frameSpectrumCtx, width, height);

    const maxFreq = Math.max(...frequencies);
    const xRange: [number, number] = [0, maxFreq];
    const yRange = autoScaleY(magnitudes, 0.15);

    drawGrid(this.frameSpectrumCtx, width, height, xRange, yRange, 6, 5);
    drawAxes(
      this.frameSpectrumCtx,
      width,
      height,
      xRange,
      yRange,
      '频率 (Hz)',
      '幅度',
      padding
    );

    drawLinePlotWithX(
      this.frameSpectrumCtx,
      frequencies,
      magnitudes,
      width,
      height,
      xRange,
      yRange,
      '#7c4dff',
      2,
      padding
    );

    const plotWidth = width - 2 * padding;
    const plotHeight = height - 2 * padding;
    const xScale = plotWidth / (xRange[1] - xRange[0]);
    const yScale = plotHeight / (yRange[1] - yRange[0]);

    for (let i = 0; i < frequencies.length; i++) {
      const x = padding + (frequencies[i] - xRange[0]) * xScale;
      const y = height - padding - (magnitudes[i] - yRange[0]) * yScale;

      this.frameSpectrumCtx.fillStyle = '#7c4dff';
      this.frameSpectrumCtx.beginPath();
      this.frameSpectrumCtx.arc(x, y, 2, 0, Math.PI * 2);
      this.frameSpectrumCtx.fill();
    }
  }
}
