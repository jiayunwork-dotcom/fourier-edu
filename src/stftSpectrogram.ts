import {
  generateWindow,
  viridisColor,
  computeSTFT,
  generateChirpSignal,
  normalize,
  idft,
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

interface PeakInfo {
  frameIdx: number;
  binIdx: number;
  freq: number;
  db: number;
}

interface PeakTrack {
  peaks: PeakInfo[];
  avgFreq: number;
  color: string;
}

interface MaskRect {
  id: number;
  timeStart: number;
  timeEnd: number;
  freqStart: number;
  freqEnd: number;
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

  private peakTrackingEnabled: boolean = false;
  private peakTracks: PeakTrack[] = [];

  private masks: MaskRect[] = [];
  private nextMaskId: number = 0;
  private selectedMaskId: number | null = null;
  private isDrawingMask: boolean = false;

  private reconstructedSignal: number[] = [];
  private reconstructedCanvas: HTMLCanvasElement | null = null;
  private reconstructedCtx: CanvasRenderingContext2D | null = null;

  private audioContext: AudioContext | null = null;
  private audioSource: AudioBufferSourceNode | null = null;
  private isPlaying: boolean = false;

  private signalPadSamples: number = 0;
  private stftResultPadded: STFTResult | null = null;

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
    this.reconstructedCanvas = document.getElementById('stft-reconstructed-canvas') as HTMLCanvasElement;
    this.reconstructedCtx = this.reconstructedCanvas?.getContext('2d') || null;

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

    document.getElementById('stft-start-peak-tracking')!.addEventListener('click', () => {
      this.startPeakTracking();
    });

    document.getElementById('stft-stop-peak-tracking')!.addEventListener('click', () => {
      this.stopPeakTracking();
    });

    document.getElementById('stft-clear-masks')!.addEventListener('click', () => {
      this.clearAllMasks();
    });

    document.getElementById('stft-apply-mask')!.addEventListener('click', () => {
      this.applyMasksAndReconstruct();
    });

    document.getElementById('stft-play-reconstructed')!.addEventListener('click', () => {
      this.playReconstructedSignal();
    });

    document.getElementById('stft-stop-reconstructed')!.addEventListener('click', () => {
      this.stopReconstructedSignal();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (this.selectedMaskId !== null) {
          this.deleteSelectedMask();
          e.preventDefault();
        }
      }
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

    this.signalPadSamples = this.settings.frameLength;
    const paddedSignal = new Array(this.signalPadSamples).fill(0)
      .concat(this.currentSignal)
      .concat(new Array(this.signalPadSamples).fill(0));

    const paddedResult = computeSTFT(
      paddedSignal,
      this.settings.frameLength,
      hopSize,
      window,
      this.sampleRate
    );

    const paddedMaxMag = Math.max(...paddedResult.magnitudeSpectrogram.flat());
    const paddedReference = paddedMaxMag * paddedMaxMag;

    const paddedDbSpectrogram: number[][] = paddedResult.magnitudeSpectrogram.map(frame =>
      frame.map(mag => {
        const power = mag * mag;
        const db = 10 * Math.log10(power / paddedReference);
        return isFinite(db) ? db : -this.settings.dbRange;
      })
    );

    this.stftResultPadded = {
      ...paddedResult,
      dbSpectrogram: paddedDbSpectrogram,
    };

    this.peakTracks = [];
    this.peakTrackingEnabled = false;
    this.masks = [];
    this.selectedMaskId = null;
    this.reconstructedSignal = [];
    document.getElementById('stft-reconstructed-section')!.style.display = 'none';

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

  private pixelYToFreqBin(canvasY: number, numFreqBins: number): number {
    const plotHeight = this.spectrogramCanvas.height - 2 * this.padding;
    const norm = 1 - (canvasY - this.padding) / plotHeight;
    return Math.max(0, Math.min(numFreqBins - 1, Math.round(norm * (numFreqBins - 1))));
  }

  private pixelXToFrameIdx(canvasX: number, numFrames: number): number {
    const plotWidth = this.spectrogramCanvas.width - 2 * this.padding;
    const norm = (canvasX - this.padding) / plotWidth;
    return Math.max(0, Math.min(numFrames - 1, Math.round(norm * (numFrames - 1))));
  }

  private freqBinToPixelY(freqBinIdx: number, numFreqBins: number): number {
    const plotHeight = this.spectrogramCanvas.height - 2 * this.padding;
    const norm = 1 - freqBinIdx / (numFreqBins - 1);
    return this.padding + norm * plotHeight;
  }

  private frameIdxToPixelX(frameIdx: number, numFrames: number): number {
    const plotWidth = this.spectrogramCanvas.width - 2 * this.padding;
    const norm = frameIdx / (numFrames - 1);
    return this.padding + norm * plotWidth;
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

    const minDB = -this.settings.dbRange;
    const maxDB = 0;

    for (let frameIdx = 0; frameIdx < numFrames; frameIdx++) {
      const xLeft = this.frameIdxToPixelX(frameIdx, numFrames);
      const xRight = this.frameIdxToPixelX(frameIdx + 1 < numFrames ? frameIdx + 1 : frameIdx, numFrames);
      let cellWidth = xRight - xLeft;
      if (frameIdx === numFrames - 1) {
        cellWidth = (this.padding + plotWidth) - xLeft;
      }
      cellWidth = Math.max(cellWidth, 1);

      for (let freqBinIdx = 0; freqBinIdx < numFreqBins; freqBinIdx++) {
        const yTop = this.freqBinToPixelY(freqBinIdx + 1, numFreqBins);
        const yBottom = this.freqBinToPixelY(freqBinIdx, numFreqBins);
        let cellHeight = yBottom - yTop;
        cellHeight = Math.max(cellHeight, 1);

        const db = dbSpectrogram[frameIdx][freqBinIdx];
        const normalized = Math.max(0, Math.min(1, (db - minDB) / (maxDB - minDB)));
        const color = viridisColor(normalized);

        this.spectrogramCtx.fillStyle = color;
        this.spectrogramCtx.fillRect(xLeft, yTop, cellWidth, cellHeight);
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

    this.renderMasks();
    this.renderPeakTracks();
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

    const inPlot = 
      canvasX >= this.padding &&
      canvasX <= this.padding + plotWidth &&
      canvasY >= this.padding &&
      canvasY <= this.padding + plotHeight;

    if (this.isDrawingMask && this.dragStart) {
      this.dragEnd = { x: canvasX, y: canvasY };
      this.renderSpectrogram();
      this.renderMaskDragPreview();
      return;
    }

    if (!inPlot) {
      return;
    }

    const { dbSpectrogram, timeFrames, frequencyBins } = this.stftResult;
    const numFrames = dbSpectrogram.length;
    const numFreqBins = dbSpectrogram[0].length;

    const frameIdx = this.pixelXToFrameIdx(canvasX, numFrames);
    const freqBinIdx = this.pixelYToFreqBin(canvasY, numFreqBins);

    const time = timeFrames[frameIdx];
    const freq = frequencyBins[freqBinIdx];
    const db = dbSpectrogram[frameIdx][freqBinIdx];

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

    if (e.shiftKey) {
      this.isDrawingMask = true;
      this.dragStart = { x: canvasX, y: canvasY };
      this.dragEnd = { x: canvasX, y: canvasY };
      this.selectedMaskId = null;
      this.renderSpectrogram();
      return;
    }

    const clickedMask = this.findMaskAtPoint(canvasX, canvasY);
    if (clickedMask !== null) {
      this.selectedMaskId = clickedMask;
      this.renderSpectrogram();
      return;
    }

    this.selectedMaskId = null;
    this.isDragging = true;
    this.dragStart = { x: canvasX, y: canvasY };
    this.dragEnd = null;
    this.selectedRegion = null;
    document.getElementById('stft-selection-info')!.style.display = 'none';
    this.renderSpectrogram();
  }

  private handleMouseUp(e: MouseEvent): void {
    if (this.isDrawingMask && this.dragStart && this.dragEnd && this.stftResult) {
      const rect = this.spectrogramCanvas.getBoundingClientRect();
      const scaleX = this.spectrogramCanvas.width / rect.width;
      const scaleY = this.spectrogramCanvas.height / rect.height;

      const canvasX = (e.clientX - rect.left) * scaleX;
      const canvasY = (e.clientY - rect.top) * scaleY;

      const dragDistance = Math.sqrt(
        Math.pow(canvasX - this.dragStart.x, 2) + Math.pow(canvasY - this.dragStart.y, 2)
      );

      if (dragDistance >= 5) {
        this.addMaskFromDrag();
      }

      this.isDrawingMask = false;
      this.dragStart = null;
      this.dragEnd = null;
      this.renderSpectrogram();
      return;
    }

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

    const numFrames = this.stftResult.magnitudeSpectrogram.length;
    const frameIdx = this.pixelXToFrameIdx(clickX, numFrames);

    const magnitudes = this.stftResult.magnitudeSpectrogram[frameIdx];
    const frequencies = this.stftResult.frequencyBins;
    const time = this.stftResult.timeFrames[frameIdx];

    document.getElementById('stft-panel-title')!.textContent = `瞬时频谱 @ ${time.toFixed(3)}s`;

    this.renderFrameSpectrum(frequencies, magnitudes, true);
    document.getElementById('stft-side-panel')!.classList.add('active');
  }

  private showAverageSpectrum(): void {
    if (!this.stftResult || !this.dragStart || !this.dragEnd) return;

    const { magnitudeSpectrogram, frequencyBins, timeFrames } = this.stftResult;
    const numFrames = magnitudeSpectrogram.length;
    const numFreqBins = magnitudeSpectrogram[0].length;

    const x1 = Math.min(this.dragStart.x, this.dragEnd.x);
    const x2 = Math.max(this.dragStart.x, this.dragEnd.x);
    const y1 = Math.min(this.dragStart.y, this.dragEnd.y);
    const y2 = Math.max(this.dragStart.y, this.dragEnd.y);

    const frameStart = this.pixelXToFrameIdx(x1, numFrames);
    const frameEnd = this.pixelXToFrameIdx(x2, numFrames);
    const binStart = this.pixelYToFreqBin(y2, numFreqBins);
    const binEnd = this.pixelYToFreqBin(y1, numFreqBins);

    const realFrameStart = Math.min(frameStart, frameEnd);
    const realFrameEnd = Math.max(frameStart, frameEnd);
    const realBinStart = Math.min(binStart, binEnd);
    const realBinEnd = Math.max(binStart, binEnd);

    const timeStart = timeFrames[realFrameStart];
    const timeEnd = timeFrames[realFrameEnd];
    const freqStart = frequencyBins[realBinStart];
    const freqEnd = frequencyBins[realBinEnd];

    this.selectedRegion = { timeStart, timeEnd, freqStart, freqEnd };

    const validFrameStart = Math.max(0, realFrameStart);
    const validFrameEnd = Math.min(numFrames - 1, realFrameEnd);
    const validBinStart = Math.max(0, realBinStart);
    const validBinEnd = Math.min(numFreqBins - 1, realBinEnd);

    const usedNumFrames = validFrameEnd - validFrameStart + 1;
    const usedNumBins = validBinEnd - validBinStart + 1;

    const avgMagnitudes: number[] = new Array(magnitudeSpectrogram[0].length).fill(0);

    for (let f = validFrameStart; f <= validFrameEnd; f++) {
      for (let b = validBinStart; b <= validBinEnd; b++) {
        avgMagnitudes[b] += magnitudeSpectrogram[f][b];
      }
    }

    for (let b = validBinStart; b <= validBinEnd; b++) {
      avgMagnitudes[b] /= usedNumFrames;
    }

    const displayFreqs = frequencyBins.slice(validBinStart, validBinEnd + 1);
    const displayMags = avgMagnitudes.slice(validBinStart, validBinEnd + 1);

    document.getElementById('stft-panel-title')!.textContent =
      `区域平均频谱 (${usedNumFrames}帧 × ${usedNumBins}频点)`;

    document.getElementById('stft-selection-time')!.textContent =
      `${timeStart.toFixed(3)}s ~ ${timeEnd.toFixed(3)}s`;
    document.getElementById('stft-selection-freq')!.textContent =
      `${Math.min(freqStart, freqEnd).toFixed(0)}Hz ~ ${Math.max(freqStart, freqEnd).toFixed(0)}Hz`;
    document.getElementById('stft-selection-info')!.style.display = 'block';

    this.renderFrameSpectrum(displayFreqs, displayMags, false);
    document.getElementById('stft-side-panel')!.classList.add('active');
  }

  private renderFrameSpectrum(frequencies: number[], magnitudes: number[], fullRange: boolean): void {
    const width = this.frameSpectrumCanvas.width;
    const height = this.frameSpectrumCanvas.height;
    const padding = 40;

    clearCanvas(this.frameSpectrumCtx, width, height);

    const maxFreq = fullRange ? this.sampleRate / 2 : Math.max(...frequencies);
    const xRange: [number, number] = fullRange ? [0, this.sampleRate / 2] : [Math.min(...frequencies), maxFreq];
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

  private startPeakTracking(): void {
    if (!this.stftResult) return;

    this.peakTrackingEnabled = true;
    this.computePeakTracks();
    this.renderSpectrogram();
  }

  private stopPeakTracking(): void {
    this.peakTrackingEnabled = false;
    this.peakTracks = [];
    this.renderSpectrogram();
  }

  private computePeakTracks(): void {
    if (!this.stftResult) return;

    const { dbSpectrogram, frequencyBins } = this.stftResult;
    const numFrames = dbSpectrogram.length;
    const numFreqBins = dbSpectrogram[0].length;
    const freqResolution = this.sampleRate / this.settings.frameLength;
    const maxFreqDiff = 2 * freqResolution;

    const allPeaks: PeakInfo[][] = [];

    for (let f = 0; f < numFrames; f++) {
      const framePeaks: PeakInfo[] = [];
      const frame = dbSpectrogram[f];

      for (let b = 1; b < numFreqBins - 1; b++) {
        const isLocalMax = frame[b] > frame[b - 1] && frame[b] > frame[b + 1];
        const aboveNeighbors6dB = frame[b] - frame[b - 1] >= 6 && frame[b] - frame[b + 1] >= 6;

        if (isLocalMax && aboveNeighbors6dB) {
          framePeaks.push({
            frameIdx: f,
            binIdx: b,
            freq: frequencyBins[b],
            db: frame[b],
          });
        }
      }

      framePeaks.sort((a, b) => b.db - a.db);
      allPeaks.push(framePeaks.slice(0, 3));
    }

    const tracks: PeakTrack[] = [];
    const usedPeaks: Set<string> = new Set();

    const trackColors = [
      '#ff6b6b',
      '#4ecdc4',
      '#ffe66d',
      '#95e1d3',
      '#f38181',
      '#aa96da',
      '#fcbad3',
      '#a8d8ea',
    ];

    for (let f = 0; f < numFrames; f++) {
      for (const peak of allPeaks[f]) {
        const peakKey = `${f}-${peak.binIdx}`;
        if (usedPeaks.has(peakKey)) continue;

        const track: PeakInfo[] = [peak];
        usedPeaks.add(peakKey);

        let currentPeak = peak;
        for (let nextF = f + 1; nextF < numFrames; nextF++) {
          let bestNext: PeakInfo | null = null;
          let bestDiff = Infinity;

          for (const nextPeak of allPeaks[nextF]) {
            const nextKey = `${nextF}-${nextPeak.binIdx}`;
            if (usedPeaks.has(nextKey)) continue;

            const freqDiff = Math.abs(nextPeak.freq - currentPeak.freq);
            if (freqDiff <= maxFreqDiff && freqDiff < bestDiff) {
              bestDiff = freqDiff;
              bestNext = nextPeak;
            }
          }

          if (bestNext) {
            track.push(bestNext);
            usedPeaks.add(`${nextF}-${bestNext.binIdx}`);
            currentPeak = bestNext;
          } else {
            break;
          }
        }

        if (track.length >= 3) {
          const avgFreq = track.reduce((sum, p) => sum + p.freq, 0) / track.length;
          tracks.push({
            peaks: track,
            avgFreq,
            color: trackColors[tracks.length % trackColors.length],
          });
        }
      }
    }

    this.peakTracks = tracks;
  }

  private renderPeakTracks(): void {
    if (!this.peakTrackingEnabled || !this.stftResult || this.peakTracks.length === 0) return;

    const numFrames = this.stftResult.dbSpectrogram.length;

    for (const track of this.peakTracks) {
      if (track.peaks.length < 2) continue;

      this.spectrogramCtx.strokeStyle = track.color;
      this.spectrogramCtx.lineWidth = 3;
      this.spectrogramCtx.globalAlpha = 0.6;
      this.spectrogramCtx.lineCap = 'round';
      this.spectrogramCtx.lineJoin = 'round';
      this.spectrogramCtx.beginPath();

      for (let i = 0; i < track.peaks.length; i++) {
        const peak = track.peaks[i];
        const x = this.frameIdxToPixelX(peak.frameIdx, numFrames);
        const y = this.freqBinToPixelY(peak.binIdx, this.stftResult.frequencyBins.length);

        if (i === 0) {
          this.spectrogramCtx.moveTo(x, y);
        } else {
          this.spectrogramCtx.lineTo(x, y);
        }
      }

      this.spectrogramCtx.stroke();
      this.spectrogramCtx.globalAlpha = 1;

      for (const peak of track.peaks) {
        const x = this.frameIdxToPixelX(peak.frameIdx, numFrames);
        const y = this.freqBinToPixelY(peak.binIdx, this.stftResult.frequencyBins.length);

        this.spectrogramCtx.fillStyle = track.color;
        this.spectrogramCtx.beginPath();
        this.spectrogramCtx.arc(x, y, 3, 0, Math.PI * 2);
        this.spectrogramCtx.fill();
      }

      const midPeak = track.peaks[Math.floor(track.peaks.length / 2)];
      const labelX = this.frameIdxToPixelX(midPeak.frameIdx, numFrames);
      const labelY = this.freqBinToPixelY(midPeak.binIdx, this.stftResult.frequencyBins.length) - 10;

      this.spectrogramCtx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      const labelText = `${track.avgFreq.toFixed(0)} Hz`;
      this.spectrogramCtx.font = 'bold 11px -apple-system, BlinkMacSystemFont, sans-serif';
      const textWidth = this.spectrogramCtx.measureText(labelText).width;
      this.spectrogramCtx.fillRect(labelX - textWidth / 2 - 4, labelY - 10, textWidth + 8, 16);

      this.spectrogramCtx.fillStyle = track.color;
      this.spectrogramCtx.textAlign = 'center';
      this.spectrogramCtx.fillText(labelText, labelX, labelY + 2);
      this.spectrogramCtx.textAlign = 'left';
    }
  }

  private findMaskAtPoint(x: number, y: number): number | null {
    if (!this.stftResult) return null;

    for (let i = this.masks.length - 1; i >= 0; i--) {
      const mask = this.masks[i];

      const x1 = this.timeToPixelX(mask.timeStart);
      const x2 = this.timeToPixelX(mask.timeEnd);
      const y1 = this.freqToPixelY(mask.freqStart);
      const y2 = this.freqToPixelY(mask.freqEnd);

      const left = Math.min(x1, x2);
      const right = Math.max(x1, x2);
      const top = Math.min(y1, y2);
      const bottom = Math.max(y1, y2);

      if (x >= left && x <= right && y >= top && y <= bottom) {
        return mask.id;
      }
    }

    return null;
  }

  private timeToPixelX(time: number): number {
    if (!this.stftResult) return this.padding;
    const { timeFrames } = this.stftResult;
    const norm = (time - timeFrames[0]) / (timeFrames[timeFrames.length - 1] - timeFrames[0]);
    return this.padding + norm * (this.spectrogramCanvas.width - 2 * this.padding);
  }

  private freqToPixelY(freq: number): number {
    if (!this.stftResult) return this.padding;
    const nyquist = this.sampleRate / 2;
    const norm = 1 - freq / nyquist;
    return this.padding + norm * (this.spectrogramCanvas.height - 2 * this.padding);
  }

  private pixelXToTime(x: number): number {
    if (!this.stftResult) return 0;
    const { timeFrames } = this.stftResult;
    const plotWidth = this.spectrogramCanvas.width - 2 * this.padding;
    const norm = (x - this.padding) / plotWidth;
    return timeFrames[0] + norm * (timeFrames[timeFrames.length - 1] - timeFrames[0]);
  }

  private pixelYToFreq(y: number): number {
    if (!this.stftResult) return 0;
    const nyquist = this.sampleRate / 2;
    const plotHeight = this.spectrogramCanvas.height - 2 * this.padding;
    const norm = 1 - (y - this.padding) / plotHeight;
    return norm * nyquist;
  }

  private addMaskFromDrag(): void {
    if (!this.dragStart || !this.dragEnd || !this.stftResult) return;

    const x1 = Math.min(this.dragStart.x, this.dragEnd.x);
    const x2 = Math.max(this.dragStart.x, this.dragEnd.x);
    const y1 = Math.min(this.dragStart.y, this.dragEnd.y);
    const y2 = Math.max(this.dragStart.y, this.dragEnd.y);

    const timeStart = this.pixelXToTime(x1);
    const timeEnd = this.pixelXToTime(x2);
    const freqStart = this.pixelYToFreq(y2);
    const freqEnd = this.pixelYToFreq(y1);

    const mask: MaskRect = {
      id: this.nextMaskId++,
      timeStart,
      timeEnd,
      freqStart,
      freqEnd,
    };

    this.masks.push(mask);
    this.selectedMaskId = mask.id;
  }

  private renderMasks(): void {
    if (!this.stftResult) return;

    for (const mask of this.masks) {
      const x1 = this.timeToPixelX(mask.timeStart);
      const x2 = this.timeToPixelX(mask.timeEnd);
      const y1 = this.freqToPixelY(mask.freqStart);
      const y2 = this.freqToPixelY(mask.freqEnd);

      const left = Math.min(x1, x2);
      const right = Math.max(x1, x2);
      const top = Math.min(y1, y2);
      const bottom = Math.max(y1, y2);

      const isSelected = mask.id === this.selectedMaskId;

      this.spectrogramCtx.fillStyle = isSelected ? 'rgba(255, 77, 77, 0.4)' : 'rgba(255, 100, 100, 0.25)';
      this.spectrogramCtx.fillRect(left, top, right - left, bottom - top);

      this.spectrogramCtx.strokeStyle = isSelected ? '#ff4d4d' : '#ff6b6b';
      this.spectrogramCtx.lineWidth = isSelected ? 2.5 : 1.5;
      this.spectrogramCtx.strokeRect(left, top, right - left, bottom - top);

      if (isSelected) {
        const handleSize = 6;
        const corners = [
          [left, top],
          [right, top],
          [left, bottom],
          [right, bottom],
        ];

        this.spectrogramCtx.fillStyle = '#ff4d4d';
        for (const [cx, cy] of corners) {
          this.spectrogramCtx.fillRect(cx - handleSize / 2, cy - handleSize / 2, handleSize, handleSize);
        }
      }
    }
  }

  private renderMaskDragPreview(): void {
    if (!this.dragStart || !this.dragEnd) return;

    const x1 = Math.min(this.dragStart.x, this.dragEnd.x);
    const x2 = Math.max(this.dragStart.x, this.dragEnd.x);
    const y1 = Math.min(this.dragStart.y, this.dragEnd.y);
    const y2 = Math.max(this.dragStart.y, this.dragEnd.y);

    this.spectrogramCtx.fillStyle = 'rgba(255, 100, 100, 0.2)';
    this.spectrogramCtx.fillRect(x1, y1, x2 - x1, y2 - y1);

    this.spectrogramCtx.strokeStyle = '#ff6b6b';
    this.spectrogramCtx.lineWidth = 1.5;
    this.spectrogramCtx.setLineDash([5, 3]);
    this.spectrogramCtx.strokeRect(x1, y1, x2 - x1, y2 - y1);
    this.spectrogramCtx.setLineDash([]);
  }

  private clearAllMasks(): void {
    this.masks = [];
    this.selectedMaskId = null;
    this.renderSpectrogram();
  }

  private deleteSelectedMask(): void {
    if (this.selectedMaskId === null) return;

    this.masks = this.masks.filter(m => m.id !== this.selectedMaskId);
    this.selectedMaskId = null;
    this.renderSpectrogram();
  }

  private applyMasksAndReconstruct(): void {
    if (!this.stftResultPadded || this.currentSignal.length === 0) return;

    const hopSize = Math.floor(this.settings.frameLength * (this.settings.hopSizePercent / 100));
    const window = generateWindow(this.settings.windowType, this.settings.frameLength);

    const numFrames = this.stftResultPadded.magnitudeSpectrogram.length;
    const numFreqBins = this.stftResultPadded.frequencyBins.length;
    const padTime = this.signalPadSamples / this.sampleRate;

    const maskedMagnitudes: number[][] = [];
    const maskedPhases: number[][] = [];

    for (let f = 0; f < numFrames; f++) {
      const frameMags = [...this.stftResultPadded.magnitudeSpectrogram[f]];
      const framePhases = [...this.stftResultPadded.phaseSpectrogram[f]];
      const paddedFrameTime = this.stftResultPadded.timeFrames[f];
      const originalFrameTime = paddedFrameTime - padTime;

      for (const mask of this.masks) {
        if (originalFrameTime >= mask.timeStart && originalFrameTime <= mask.timeEnd) {
          for (let b = 0; b < numFreqBins; b++) {
            const binFreq = this.stftResultPadded.frequencyBins[b];
            if (binFreq >= mask.freqStart && binFreq <= mask.freqEnd) {
              frameMags[b] = 0;
            }
          }
        }
      }

      maskedMagnitudes.push(frameMags);
      maskedPhases.push(framePhases);
    }

    const fullReconstructed = this.inverseSTFT(maskedMagnitudes, maskedPhases, window, hopSize);

    const startIdx = this.signalPadSamples;
    const endIdx = startIdx + this.currentSignal.length;
    this.reconstructedSignal = fullReconstructed.slice(startIdx, endIdx);

    const section = document.getElementById('stft-reconstructed-section');
    if (section) {
      section.style.display = 'block';
    }

    this.renderReconstructedSignal();
  }

  private inverseSTFT(
    magnitudeSpectrogram: number[][],
    phaseSpectrogram: number[][],
    window: number[],
    hopSize: number
  ): number[] {
    const numFrames = magnitudeSpectrogram.length;
    const frameLength = window.length;
    const outputLength = (numFrames - 1) * hopSize + frameLength;

    const output: number[] = new Array(outputLength).fill(0);
    const windowSum: number[] = new Array(outputLength).fill(0);

    for (let i = 0; i < numFrames; i++) {
      const spectrum: { real: number; imag: number }[] = [];

      for (let k = 0; k < magnitudeSpectrogram[i].length; k++) {
        const mag = magnitudeSpectrogram[i][k];
        const phase = phaseSpectrogram[i][k];
        spectrum.push({
          real: mag * Math.cos(phase),
          imag: mag * Math.sin(phase),
        });
      }

      for (let k = magnitudeSpectrogram[i].length; k < frameLength; k++) {
        const mirrorIdx = frameLength - k;
        if (mirrorIdx > 0 && mirrorIdx < magnitudeSpectrogram[i].length) {
          const mag = magnitudeSpectrogram[i][mirrorIdx];
          const phase = -phaseSpectrogram[i][mirrorIdx];
          spectrum.push({
            real: mag * Math.cos(phase),
            imag: mag * Math.sin(phase),
          });
        } else {
          spectrum.push({ real: 0, imag: 0 });
        }
      }

      const frame = idft(spectrum);

      const startIdx = i * hopSize;
      for (let n = 0; n < frameLength; n++) {
        if (startIdx + n < outputLength) {
          output[startIdx + n] += frame[n];
          windowSum[startIdx + n] += window[n];
        }
      }
    }

    for (let n = 0; n < outputLength; n++) {
      if (windowSum[n] > 1e-10) {
        output[n] /= windowSum[n];
      }
    }

    return output;
  }

  private renderReconstructedSignal(): void {
    if (!this.reconstructedCtx || !this.reconstructedCanvas) return;
    if (this.reconstructedSignal.length === 0) return;

    const width = this.reconstructedCanvas.width;
    const height = this.reconstructedCanvas.height;

    clearCanvas(this.reconstructedCtx, width, height);

    const xRange: [number, number] = [0, this.reconstructedSignal.length / this.sampleRate];
    const yRange = autoScaleY(this.reconstructedSignal, 0.1);

    drawGrid(this.reconstructedCtx, width, height, xRange, yRange, 10, 3);

    this.reconstructedCtx.strokeStyle = '#ff6b6b';
    this.reconstructedCtx.lineWidth = 1.5;
    this.reconstructedCtx.lineCap = 'round';
    this.reconstructedCtx.lineJoin = 'round';
    this.reconstructedCtx.beginPath();

    const plotWidth = width;
    const plotHeight = height;
    const yScale = plotHeight / (yRange[1] - yRange[0]);

    for (let i = 0; i < this.reconstructedSignal.length; i++) {
      const x = (i / (this.reconstructedSignal.length - 1)) * plotWidth;
      const y = height - (this.reconstructedSignal[i] - yRange[0]) * yScale;

      if (i === 0) {
        this.reconstructedCtx.moveTo(x, y);
      } else {
        this.reconstructedCtx.lineTo(x, y);
      }
    }

    this.reconstructedCtx.stroke();

    this.reconstructedCtx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    this.reconstructedCtx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
    this.reconstructedCtx.textAlign = 'left';
    this.reconstructedCtx.fillText('重建信号', 5, 15);

    if (this.currentSignal.length > 0 && this.reconstructedSignal.length > 0) {
      let maxError = 0;
      const minLen = Math.min(this.currentSignal.length, this.reconstructedSignal.length);
      for (let i = 0; i < minLen; i++) {
        const err = Math.abs(this.currentSignal[i] - this.reconstructedSignal[i]);
        if (err > maxError) maxError = err;
      }
      this.reconstructedCtx.fillText(`最大误差: ${maxError.toExponential(2)}`, 5, height - 5);
    }
  }

  private playReconstructedSignal(): void {
    if (this.reconstructedSignal.length === 0) return;

    this.stopReconstructedSignal();

    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    const audioBuffer = this.audioContext.createBuffer(
      1,
      this.reconstructedSignal.length,
      this.sampleRate
    );

    const channelData = audioBuffer.getChannelData(0);
    for (let i = 0; i < this.reconstructedSignal.length; i++) {
      channelData[i] = this.reconstructedSignal[i];
    }

    this.audioSource = this.audioContext.createBufferSource();
    this.audioSource.buffer = audioBuffer;
    this.audioSource.connect(this.audioContext.destination);

    this.audioSource.onended = () => {
      this.isPlaying = false;
      this.updatePlayButtonState();
    };

    this.audioSource.start();
    this.isPlaying = true;
    this.updatePlayButtonState();
  }

  private stopReconstructedSignal(): void {
    if (this.audioSource) {
      try {
        this.audioSource.stop();
      } catch (e) {
        // Ignore if already stopped
      }
      this.audioSource = null;
    }
    this.isPlaying = false;
    this.updatePlayButtonState();
  }

  private updatePlayButtonState(): void {
    const playBtn = document.getElementById('stft-play-reconstructed');
    const stopBtn = document.getElementById('stft-stop-reconstructed');

    if (playBtn) {
      playBtn.style.display = this.isPlaying ? 'none' : 'inline-block';
    }
    if (stopBtn) {
      stopBtn.style.display = this.isPlaying ? 'inline-block' : 'none';
    }
  }
}
