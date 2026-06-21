import {
  Complex,
  dft,
  idft,
  normalize,
} from './mathUtils';

import {
  clearCanvas,
  drawGrid,
  drawAxes,
  drawLinePlot,
  autoScaleY,
} from './canvasUtils';

type DrawMode = 'point' | 'line' | 'rect';
type EditTarget = 'magnitude' | 'phase';

interface SpectrumSlot {
  magnitude: number[];
  phase: number[];
  N: number;
  sampleRate: number;
}

export class SpectrumEditor {
  private N: number = 256;
  private sampleRate: number = 8000;

  private magnitude: number[] = [];
  private phase: number[] = [];

  private timeSignal: number[] = [];
  private verifyMagnitude: number[] | null = null;
  private verifyPhase: number[] | null = null;

  private slotA: SpectrumSlot | null = null;
  private slotB: SpectrumSlot | null = null;

  private drawMode: DrawMode = 'point';
  private editTarget: EditTarget = 'magnitude';
  private brushMag: number = 1.0;
  private brushPhase: number = 0;

  private isDrawing: boolean = false;
  private drawStartBin: number = -1;
  private lineStartBin: number = -1;
  private lineStartValue: number = 0;

  private magCanvas: HTMLCanvasElement;
  private magCtx: CanvasRenderingContext2D;
  private phaseCanvas: HTMLCanvasElement;
  private phaseCtx: CanvasRenderingContext2D;
  private timeCanvas: HTMLCanvasElement;
  private timeCtx: CanvasRenderingContext2D;

  private audioContext: AudioContext | null = null;
  private audioSource: AudioBufferSourceNode | null = null;
  private isPlaying: boolean = false;

  private signalBuilder: any = null;

  private readonly PADDING = 50;

  constructor() {
    this.magCanvas = document.getElementById('se-magnitude-canvas') as HTMLCanvasElement;
    this.magCtx = this.magCanvas.getContext('2d')!;
    this.phaseCanvas = document.getElementById('se-phase-canvas') as HTMLCanvasElement;
    this.phaseCtx = this.phaseCanvas.getContext('2d')!;
    this.timeCanvas = document.getElementById('se-time-canvas') as HTMLCanvasElement;
    this.timeCtx = this.timeCanvas.getContext('2d')!;

    this.initSpectrum();
    this.setupEventListeners();
    this.updateTemplateVisibility();
    this.render();
  }

  public setSignalBuilder(builder: any): void {
    this.signalBuilder = builder;
  }

  private initSpectrum(): void {
    const halfN = Math.floor(this.N / 2);
    this.magnitude = new Array(halfN).fill(0);
    this.phase = new Array(halfN).fill(0);
    this.timeSignal = new Array(this.N).fill(0);
    this.verifyMagnitude = null;
    this.verifyPhase = null;
  }

  private setupEventListeners(): void {
    const nSelect = document.getElementById('se-n') as HTMLSelectElement;
    nSelect.addEventListener('change', () => {
      const newN = parseInt(nSelect.value);
      this.resizeSpectrum(newN);
    });

    const srSelect = document.getElementById('se-sample-rate') as HTMLSelectElement;
    srSelect.addEventListener('change', () => {
      this.sampleRate = parseInt(srSelect.value);
      this.render();
    });

    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        (e.target as HTMLElement).classList.add('active');
        this.drawMode = (e.target as HTMLElement).dataset.mode as DrawMode;
      });
    });

    document.querySelectorAll('.target-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.target-btn').forEach(b => b.classList.remove('active'));
        (e.target as HTMLElement).classList.add('active');
        this.editTarget = (e.target as HTMLElement).dataset.target as EditTarget;
      });
    });

    const brushMagSlider = document.getElementById('se-brush-mag') as HTMLInputElement;
    const brushMagValue = document.getElementById('se-brush-value') as HTMLElement;
    brushMagSlider.addEventListener('input', () => {
      this.brushMag = parseFloat(brushMagSlider.value);
      brushMagValue.textContent = this.brushMag.toFixed(2);
    });

    const brushPhaseSlider = document.getElementById('se-brush-phase') as HTMLInputElement;
    const brushPhaseValue = document.getElementById('se-brush-phase-value') as HTMLElement;
    brushPhaseSlider.addEventListener('input', () => {
      this.brushPhase = parseFloat(brushPhaseSlider.value);
      brushPhaseValue.textContent = this.brushPhase.toFixed(2);
    });

    const templateSelect = document.getElementById('se-template') as HTMLSelectElement;
    templateSelect.addEventListener('change', () => this.updateTemplateVisibility());

    ['se-cutoff', 'se-center', 'se-bandwidth', 'se-comb-spacing'].forEach(id => {
      const el = document.getElementById(id) as HTMLInputElement;
      const valEl = document.getElementById(id + '-value') as HTMLElement;
      if (el && valEl) {
        el.addEventListener('input', () => {
          valEl.textContent = el.value;
        });
      }
    });

    document.getElementById('se-apply-template')!.addEventListener('click', () => this.applyTemplate());
    document.getElementById('se-idft')!.addEventListener('click', () => this.doIDFT());
    document.getElementById('se-verify')!.addEventListener('click', () => this.doVerify());
    document.getElementById('se-clear')!.addEventListener('click', () => this.clearSpectrum());
    document.getElementById('se-play')!.addEventListener('click', () => this.togglePlay());
    document.getElementById('se-import-signal')!.addEventListener('click', () => this.importFromSignalBuilder());

    document.getElementById('se-save-a')!.addEventListener('click', () => {
      this.slotA = {
        magnitude: [...this.magnitude],
        phase: [...this.phase],
        N: this.N,
        sampleRate: this.sampleRate,
      };
      this.updateSlotStatus();
    });

    document.getElementById('se-save-b')!.addEventListener('click', () => {
      this.slotB = {
        magnitude: [...this.magnitude],
        phase: [...this.phase],
        N: this.N,
        sampleRate: this.sampleRate,
      };
      this.updateSlotStatus();
    });

    document.getElementById('se-op-add')!.addEventListener('click', () => this.doOperation('add'));
    document.getElementById('se-op-mul')!.addEventListener('click', () => this.doOperation('mul'));
    document.getElementById('se-op-sub')!.addEventListener('click', () => this.doOperation('sub'));

    this.setupCanvasInteraction(this.magCanvas, 'magnitude');
    this.setupCanvasInteraction(this.phaseCanvas, 'phase');
  }

  private setupCanvasInteraction(canvas: HTMLCanvasElement, target: EditTarget): void {
    canvas.addEventListener('mousedown', (e) => this.onCanvasMouseDown(e, target));
    canvas.addEventListener('mousemove', (e) => this.onCanvasMouseMove(e, target));
    canvas.addEventListener('mouseup', (e) => this.onCanvasMouseUp(e, target));
    canvas.addEventListener('mouseleave', () => this.onCanvasMouseUp(null, target));

    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      this.onCanvasMouseDown(this.touchToMouse(touch, canvas), target);
    });
    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      this.onCanvasMouseMove(this.touchToMouse(touch, canvas), target);
    });
    canvas.addEventListener('touchend', () => this.onCanvasMouseUp(null, target));
  }

  private touchToMouse(touch: Touch, canvas: HTMLCanvasElement): MouseEvent {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      offsetX: (touch.clientX - rect.left) * scaleX,
      offsetY: (touch.clientY - rect.top) * scaleY,
    } as MouseEvent;
  }

  private getBinFromX(x: number, canvasWidth: number): number {
    const plotWidth = canvasWidth - 2 * this.PADDING;
    const halfN = this.magnitude.length;
    const relX = (x - this.PADDING) / plotWidth;
    return Math.max(0, Math.min(halfN - 1, Math.floor(relX * halfN)));
  }

  private getMagnitudeFromY(y: number, canvasHeight: number, yRange: [number, number]): number {
    const plotHeight = canvasHeight - 2 * this.PADDING;
    const yScale = plotHeight / (yRange[1] - yRange[0]);
    const value = yRange[1] - (y - this.PADDING) / yScale;
    return Math.max(yRange[0], Math.min(yRange[1], value));
  }

  private onCanvasMouseDown(e: MouseEvent, target: EditTarget): void {
    if (target !== this.editTarget) return;
    this.isDrawing = true;
    const canvas = target === 'magnitude' ? this.magCanvas : this.phaseCanvas;
    const bin = this.getBinFromX(e.offsetX, canvas.width);
    this.drawStartBin = bin;

    if (this.drawMode === 'point') {
      this.applyBrushAtBin(bin);
      this.render();
    } else if (this.drawMode === 'line') {
      this.lineStartBin = bin;
      const yRange: [number, number] = target === 'magnitude' ? [0, 2] : [-Math.PI, Math.PI];
      this.lineStartValue = this.getMagnitudeFromY(e.offsetY, canvas.height, yRange);
      if (target === 'magnitude') {
        this.lineStartValue = Math.max(0, this.lineStartValue);
      }
    } else if (this.drawMode === 'rect') {
      this.render();
    }
  }

  private onCanvasMouseMove(e: MouseEvent, target: EditTarget): void {
    if (!this.isDrawing || target !== this.editTarget) return;
    const canvas = target === 'magnitude' ? this.magCanvas : this.phaseCanvas;
    const bin = this.getBinFromX(e.offsetX, canvas.width);

    if (this.drawMode === 'point') {
      this.applyBrushAtBin(bin);
      this.render();
    } else if (this.drawMode === 'rect') {
      this.render();
      this.drawRectPreview(target, this.drawStartBin, bin, e.offsetY);
    }
  }

  private onCanvasMouseUp(e: MouseEvent | null, target: EditTarget): void {
    if (!this.isDrawing || target !== this.editTarget) {
      this.isDrawing = false;
      return;
    }

    if (this.drawMode === 'line' && e !== null) {
      const canvas = target === 'magnitude' ? this.magCanvas : this.phaseCanvas;
      const endBin = this.getBinFromX(e.offsetX, canvas.width);
      const yRange: [number, number] = target === 'magnitude' ? [0, 2] : [-Math.PI, Math.PI];
      const endValue = this.getMagnitudeFromY(e.offsetY, canvas.height, yRange);
      this.applyLine(target, this.lineStartBin, endBin, this.lineStartValue, endValue);
    } else if (this.drawMode === 'rect' && e !== null) {
      const canvas = target === 'magnitude' ? this.magCanvas : this.phaseCanvas;
      const endBin = this.getBinFromX(e.offsetX, canvas.width);
      const yRange: [number, number] = target === 'magnitude' ? [0, 2] : [-Math.PI, Math.PI];
      const value = this.getMagnitudeFromY(e.offsetY, canvas.height, yRange);
      this.applyRect(target, this.drawStartBin, endBin, value);
    }

    this.isDrawing = false;
    this.drawStartBin = -1;
    this.lineStartBin = -1;
    this.render();
  }

  private applyBrushAtBin(bin: number): void {
    if (this.editTarget === 'magnitude') {
      this.magnitude[bin] = this.brushMag;
    } else {
      this.phase[bin] = this.brushPhase;
    }
  }

  private applyLine(target: EditTarget, bin1: number, bin2: number, val1: number, val2: number): void {
    const minBin = Math.min(bin1, bin2);
    const maxBin = Math.max(bin1, bin2);
    const data = target === 'magnitude' ? this.magnitude : this.phase;
    const v1 = bin1 <= bin2 ? val1 : val2;
    const v2 = bin1 <= bin2 ? val2 : val1;

    for (let b = minBin; b <= maxBin; b++) {
      const t = maxBin === minBin ? 0 : (b - minBin) / (maxBin - minBin);
      const v = v1 * (1 - t) + v2 * t;
      data[b] = target === 'magnitude' ? Math.max(0, v) : v;
    }
  }

  private applyRect(target: EditTarget, bin1: number, bin2: number, value: number): void {
    const minBin = Math.min(bin1, bin2);
    const maxBin = Math.max(bin1, bin2);
    const data = target === 'magnitude' ? this.magnitude : this.phase;
    const clampedVal = target === 'magnitude' ? Math.max(0, value) : value;

    for (let b = minBin; b <= maxBin; b++) {
      data[b] = clampedVal;
    }
  }

  private drawRectPreview(target: EditTarget, bin1: number, bin2: number, _y: number): void {
    const canvas = target === 'magnitude' ? this.magCanvas : this.phaseCanvas;
    const ctx = target === 'magnitude' ? this.magCtx : this.phaseCtx;
    const minBin = Math.min(bin1, bin2);
    const maxBin = Math.max(bin1, bin2);
    const halfN = this.magnitude.length;
    const plotWidth = canvas.width - 2 * this.PADDING;
    const x1 = this.PADDING + (minBin / halfN) * plotWidth;
    const x2 = this.PADDING + ((maxBin + 1) / halfN) * plotWidth;

    ctx.fillStyle = 'rgba(124, 77, 255, 0.3)';
    ctx.fillRect(x1, this.PADDING, x2 - x1, canvas.height - 2 * this.PADDING);
    ctx.strokeStyle = '#7c4dff';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(x1, this.PADDING, x2 - x1, canvas.height - 2 * this.PADDING);
    ctx.setLineDash([]);
  }

  private resizeSpectrum(newN: number): void {
    const oldHalfN = this.magnitude.length;
    const newHalfN = Math.floor(newN / 2);

    const newMag: number[] = new Array(newHalfN).fill(0);
    const newPhase: number[] = new Array(newHalfN).fill(0);

    for (let i = 0; i < newHalfN; i++) {
      const oldIdx = Math.floor((i / newHalfN) * oldHalfN);
      newMag[i] = this.magnitude[Math.min(oldIdx, oldHalfN - 1)];
      newPhase[i] = this.phase[Math.min(oldIdx, oldHalfN - 1)];
    }

    this.N = newN;
    this.magnitude = newMag;
    this.phase = newPhase;
    this.verifyMagnitude = null;
    this.verifyPhase = null;
    this.render();
  }

  private updateTemplateVisibility(): void {
    const template = (document.getElementById('se-template') as HTMLSelectElement).value;
    const cutoffGroup = document.getElementById('se-cutoff-group') as HTMLElement;
    const centerGroup = document.getElementById('se-center-group') as HTMLElement;
    const bandwidthGroup = document.getElementById('se-bandwidth-group') as HTMLElement;
    const combGroup = document.getElementById('se-comb-spacing-group') as HTMLElement;

    cutoffGroup.style.display = template === 'lowpass' ? 'block' : 'none';
    centerGroup.style.display = template === 'bandpass' ? 'block' : 'none';
    bandwidthGroup.style.display = template === 'bandpass' ? 'block' : 'none';
    combGroup.style.display = template === 'comb' ? 'block' : 'none';
  }

  private applyTemplate(): void {
    const template = (document.getElementById('se-template') as HTMLSelectElement).value;
    const halfN = this.magnitude.length;
    const nyquist = this.sampleRate / 2;
    const freqStep = nyquist / halfN;

    for (let i = 0; i < halfN; i++) {
      this.magnitude[i] = 0;
      this.phase[i] = 0;
    }

    switch (template) {
      case 'lowpass': {
        const cutoff = parseFloat((document.getElementById('se-cutoff') as HTMLInputElement).value);
        for (let i = 0; i < halfN; i++) {
          const freq = i * freqStep;
          if (freq <= cutoff) {
            this.magnitude[i] = 1;
          }
        }
        break;
      }
      case 'bandpass': {
        const center = parseFloat((document.getElementById('se-center') as HTMLInputElement).value);
        const bandwidth = parseFloat((document.getElementById('se-bandwidth') as HTMLInputElement).value);
        const low = center - bandwidth / 2;
        const high = center + bandwidth / 2;
        for (let i = 0; i < halfN; i++) {
          const freq = i * freqStep;
          if (freq >= low && freq <= high) {
            this.magnitude[i] = 1;
          }
        }
        break;
      }
      case 'comb': {
        const spacing = parseFloat((document.getElementById('se-comb-spacing') as HTMLInputElement).value);
        let freq = spacing;
        while (freq < nyquist) {
          const bin = Math.round(freq / freqStep);
          if (bin >= 0 && bin < halfN) {
            this.magnitude[bin] = 1;
          }
          freq += spacing;
        }
        break;
      }
      case 'pink': {
        for (let i = 1; i < halfN; i++) {
          const freq = i * freqStep;
          this.magnitude[i] = Math.min(1, 1 / Math.sqrt(freq));
        }
        this.magnitude[0] = 0;
        const maxMag = Math.max(...this.magnitude);
        if (maxMag > 0) {
          for (let i = 0; i < halfN; i++) {
            this.magnitude[i] /= maxMag;
          }
        }
        break;
      }
    }

    this.verifyMagnitude = null;
    this.verifyPhase = null;
    this.render();
  }

  private clearSpectrum(): void {
    this.initSpectrum();
    this.stopPlayback();
    this.render();
  }

  private buildFullSpectrum(): Complex[] {
    const spectrum: Complex[] = [];
    const halfN = this.magnitude.length;
    const scale = this.N / 2;

    for (let k = 0; k < this.N; k++) {
      if (k === 0) {
        spectrum.push({ real: this.magnitude[0] * scale, imag: 0 });
      } else if (k < halfN) {
        const mag = this.magnitude[k] * scale;
        const ph = this.phase[k];
        spectrum.push({
          real: mag * Math.cos(ph),
          imag: mag * Math.sin(ph),
        });
      } else if (k === halfN && this.N % 2 === 0) {
        spectrum.push({ real: 0, imag: 0 });
      } else {
        const mirrorK = this.N - k;
        const mag = this.magnitude[mirrorK] * scale;
        const ph = -this.phase[mirrorK];
        spectrum.push({
          real: mag * Math.cos(ph),
          imag: mag * Math.sin(ph),
        });
      }
    }

    return spectrum;
  }

  private doIDFT(): void {
    const spectrum = this.buildFullSpectrum();
    this.timeSignal = idft(spectrum);
    this.verifyMagnitude = null;
    this.verifyPhase = null;
    this.render();
  }

  private doVerify(): void {
    if (this.timeSignal.length === 0) {
      alert('请先执行逆变换生成时域信号');
      return;
    }

    const result = dft(this.timeSignal);
    const halfN = this.magnitude.length;
    this.verifyMagnitude = [];
    this.verifyPhase = [];

    for (let k = 0; k < halfN; k++) {
      const mag = Math.sqrt(result[k].real ** 2 + result[k].imag ** 2);
      const ph = Math.atan2(result[k].imag, result[k].real);
      this.verifyMagnitude.push((2 * mag) / this.N);
      this.verifyPhase.push(ph);
    }

    this.render();
  }

  private doOperation(op: 'add' | 'mul' | 'sub'): void {
    if (!this.slotA || !this.slotB) {
      alert('请先保存频谱到槽位A和槽位B');
      return;
    }

    const targetN = Math.max(this.slotA.N, this.slotB.N);
    const targetHalfN = Math.floor(targetN / 2);

    const magA = this.resampleSpectrum(this.slotA.magnitude, targetHalfN);
    const phaseA = this.resampleSpectrum(this.slotA.phase, targetHalfN);
    const magB = this.resampleSpectrum(this.slotB.magnitude, targetHalfN);
    const phaseB = this.resampleSpectrum(this.slotB.phase, targetHalfN);

    const newMag: number[] = [];
    const newPhase: number[] = [];

    for (let i = 0; i < targetHalfN; i++) {
      const reA = magA[i] * Math.cos(phaseA[i]);
      const imA = magA[i] * Math.sin(phaseA[i]);
      const reB = magB[i] * Math.cos(phaseB[i]);
      const imB = magB[i] * Math.sin(phaseB[i]);

      let re: number, im: number;

      switch (op) {
        case 'add':
          re = reA + reB;
          im = imA + imB;
          break;
        case 'mul':
          re = reA * reB - imA * imB;
          im = reA * imB + imA * reB;
          break;
        case 'sub':
          re = reA - reB;
          im = imA - imB;
          break;
      }

      newMag.push(Math.max(0, Math.sqrt(re * re + im * im)));
      newPhase.push(Math.atan2(im, re));
    }

    if (targetN !== this.N) {
      this.N = targetN;
      (document.getElementById('se-n') as HTMLSelectElement).value = String(targetN);
    }
    this.sampleRate = Math.max(this.slotA.sampleRate, this.slotB.sampleRate);
    (document.getElementById('se-sample-rate') as HTMLSelectElement).value = String(this.sampleRate);

    this.magnitude = newMag;
    this.phase = newPhase;
    this.verifyMagnitude = null;
    this.verifyPhase = null;
    this.render();
  }

  private resampleSpectrum(data: number[], targetLen: number): number[] {
    const result: number[] = new Array(targetLen).fill(0);
    const srcLen = data.length;
    for (let i = 0; i < targetLen; i++) {
      const srcIdx = Math.floor((i / targetLen) * srcLen);
      result[i] = data[Math.min(srcIdx, srcLen - 1)];
    }
    return result;
  }

  private updateSlotStatus(): void {
    const status = document.getElementById('se-slot-status') as HTMLElement;
    const aStatus = this.slotA ? `已存 (N=${this.slotA.N})` : '空';
    const bStatus = this.slotB ? `已存 (N=${this.slotB.N})` : '空';
    status.textContent = `槽位A: ${aStatus} | 槽位B: ${bStatus}`;
  }

  private togglePlay(): void {
    if (this.isPlaying) {
      this.stopPlayback();
    } else {
      this.startPlayback();
    }
  }

  private startPlayback(): void {
    if (this.timeSignal.length === 0) {
      alert('请先执行逆变换生成时域信号');
      return;
    }

    try {
      this.audioContext = this.audioContext || new (window.AudioContext || (window as any).webkitAudioContext)();
      const ctx = this.audioContext;

      const signal = normalize(this.timeSignal);
      const buffer = ctx.createBuffer(1, signal.length, this.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < signal.length; i++) {
        data[i] = signal[i];
      }

      this.audioSource = ctx.createBufferSource();
      this.audioSource.buffer = buffer;
      this.audioSource.loop = true;
      this.audioSource.connect(ctx.destination);
      this.audioSource.start();

      this.isPlaying = true;
      const playBtn = document.getElementById('se-play') as HTMLButtonElement;
      playBtn.textContent = '⏹ 停止播放';
    } catch (err) {
      console.error('音频播放失败:', err);
      alert('音频播放失败: ' + (err as Error).message);
    }
  }

  private stopPlayback(): void {
    if (this.audioSource) {
      try {
        this.audioSource.stop();
      } catch (e) {
        // ignore
      }
      this.audioSource = null;
    }
    this.isPlaying = false;
    const playBtn = document.getElementById('se-play') as HTMLButtonElement;
    playBtn.textContent = '🔊 循环播放';
  }

  public importFromSignalBuilder(signal?: number[], sampleRate?: number): void {
    let srcSignal: number[];
    let srcSR: number;

    if (signal && sampleRate) {
      srcSignal = signal;
      srcSR = sampleRate;
    } else if (this.signalBuilder) {
      srcSignal = this.signalBuilder.getSignal(this.sampleRate, this.N);
      srcSR = this.sampleRate;
    } else {
      alert('信号构造器不可用');
      return;
    }

    if (srcSignal.length !== this.N) {
      const resampled: number[] = [];
      const ratio = srcSignal.length / this.N;
      for (let i = 0; i < this.N; i++) {
        const idx = Math.floor(i * ratio);
        resampled.push(srcSignal[Math.min(idx, srcSignal.length - 1)]);
      }
      srcSignal = resampled;
    }

    this.sampleRate = srcSR;
    (document.getElementById('se-sample-rate') as HTMLSelectElement).value = String(srcSR);

    const spectrum = dft(srcSignal);
    const halfN = this.magnitude.length;

    for (let k = 0; k < halfN; k++) {
      const mag = Math.sqrt(spectrum[k].real ** 2 + spectrum[k].imag ** 2);
      const ph = Math.atan2(spectrum[k].imag, spectrum[k].real);
      this.magnitude[k] = (2 * mag) / this.N;
      this.phase[k] = ph;
    }

    this.timeSignal = [...srcSignal];
    this.verifyMagnitude = null;
    this.verifyPhase = null;
    this.render();
  }

  public setSignalFromExternal(signal: number[], sampleRate: number): void {
    this.importFromSignalBuilder(signal, sampleRate);
  }

  private render(): void {
    this.renderMagnitude();
    this.renderPhase();
    this.renderTime();
  }

  private renderMagnitude(): void {
    const w = this.magCanvas.width;
    const h = this.magCanvas.height;
    const halfN = this.magnitude.length;
    const nyquist = this.sampleRate / 2;
    const xRange: [number, number] = [0, nyquist];
    const yRange: [number, number] = [0, 2];

    clearCanvas(this.magCtx, w, h);
    drawGrid(this.magCtx, w, h, xRange, yRange);
    drawAxes(this.magCtx, w, h, xRange, yRange, '频率 (Hz)', '幅度');

    const plotWidth = w - 2 * this.PADDING;
    const plotHeight = h - 2 * this.PADDING;
    const barWidth = (plotWidth / halfN) * 0.8;
    const yScale = plotHeight / (yRange[1] - yRange[0]);

    for (let i = 0; i < halfN; i++) {
      const x = this.PADDING + (i / halfN) * plotWidth + ((plotWidth / halfN) - barWidth) / 2;
      const barHeight = Math.max(1, this.magnitude[i] * yScale);
      const y = h - this.PADDING - barHeight;

      this.magCtx.fillStyle = this.editTarget === 'magnitude' ? '#4fc3f7' : 'rgba(79, 195, 247, 0.5)';
      this.magCtx.fillRect(x, y, barWidth, barHeight);
    }

    if (this.verifyMagnitude) {
      this.magCtx.strokeStyle = '#ffa726';
      this.magCtx.lineWidth = 2;
      this.magCtx.setLineDash([6, 4]);
      this.magCtx.beginPath();
      for (let i = 0; i < halfN; i++) {
        const x = this.PADDING + (i + 0.5) / halfN * plotWidth;
        const y = h - this.PADDING - this.verifyMagnitude[i] * yScale;
        if (i === 0) this.magCtx.moveTo(x, y);
        else this.magCtx.lineTo(x, y);
      }
      this.magCtx.stroke();
      this.magCtx.setLineDash([]);

      let hasDiff = false;
      for (let i = 0; i < halfN; i++) {
        if (Math.abs(this.magnitude[i] - this.verifyMagnitude[i]) > 0.01) {
          hasDiff = true;
          break;
        }
      }
      if (hasDiff) {
        for (let i = 0; i < halfN; i++) {
          const diff = Math.abs(this.magnitude[i] - this.verifyMagnitude[i]);
          if (diff > 0.01) {
            const x = this.PADDING + (i / halfN) * plotWidth + ((plotWidth / halfN) - barWidth) / 2;
            this.magCtx.fillStyle = 'rgba(239, 83, 80, 0.5)';
            this.magCtx.fillRect(x, h - this.PADDING - plotHeight, barWidth, plotHeight);
          }
        }
      }
    }
  }

  private renderPhase(): void {
    const w = this.phaseCanvas.width;
    const h = this.phaseCanvas.height;
    const halfN = this.phase.length;
    const nyquist = this.sampleRate / 2;
    const xRange: [number, number] = [0, nyquist];
    const yRange: [number, number] = [-Math.PI, Math.PI];

    clearCanvas(this.phaseCtx, w, h);
    drawGrid(this.phaseCtx, w, h, xRange, yRange);
    drawAxes(this.phaseCtx, w, h, xRange, yRange, '频率 (Hz)', '相位 (rad)');

    const plotWidth = w - 2 * this.PADDING;
    const plotHeight = h - 2 * this.PADDING;
    const yScale = plotHeight / (yRange[1] - yRange[0]);
    const zeroY = h - this.PADDING - (0 - yRange[0]) * yScale;

    const barWidth = (plotWidth / halfN) * 0.8;
    for (let i = 0; i < halfN; i++) {
      const x = this.PADDING + (i / halfN) * plotWidth + ((plotWidth / halfN) - barWidth) / 2;
      const value = this.phase[i];
      const barHeight = Math.abs(value) * yScale;
      const y = value >= 0 ? zeroY - barHeight : zeroY;

      this.phaseCtx.fillStyle = this.editTarget === 'phase' ? '#7c4dff' : 'rgba(124, 77, 255, 0.5)';
      this.phaseCtx.fillRect(x, Math.min(y, zeroY), barWidth, barHeight || 1);
    }

    if (this.verifyPhase) {
      this.phaseCtx.strokeStyle = '#ffa726';
      this.phaseCtx.lineWidth = 2;
      this.phaseCtx.setLineDash([6, 4]);
      this.phaseCtx.beginPath();
      for (let i = 0; i < halfN; i++) {
        const x = this.PADDING + (i + 0.5) / halfN * plotWidth;
        const y = h - this.PADDING - (this.verifyPhase[i] - yRange[0]) * yScale;
        if (i === 0) this.phaseCtx.moveTo(x, y);
        else this.phaseCtx.lineTo(x, y);
      }
      this.phaseCtx.stroke();
      this.phaseCtx.setLineDash([]);
    }
  }

  private renderTime(): void {
    const w = this.timeCanvas.width;
    const h = this.timeCanvas.height;
    const duration = this.N / this.sampleRate;
    const xRange: [number, number] = [0, duration];

    let yRange: [number, number];
    if (this.timeSignal.length > 0) {
      yRange = autoScaleY(this.timeSignal, 0.15);
    } else {
      yRange = [-1, 1];
    }

    clearCanvas(this.timeCtx, w, h);
    drawGrid(this.timeCtx, w, h, xRange, yRange);
    drawAxes(this.timeCtx, w, h, xRange, yRange, '时间 (s)', '幅值');

    if (this.timeSignal.length > 0) {
      drawLinePlot(this.timeCtx, this.timeSignal, w, h, xRange, yRange, '#66bb6a', 2);
    }

    const legendItems: { label: string; color: string }[] = [];
    if (this.timeSignal.length > 0) legendItems.push({ label: 'IDFT时域信号', color: '#66bb6a' });
    if (this.verifyMagnitude) legendItems.push({ label: '正变换验证(虚线)', color: '#ffa726' });
    if (this.verifyMagnitude) legendItems.push({ label: '差异区域', color: 'rgba(239, 83, 80, 0.5)' });

    const legendEl = document.getElementById('se-verify-legend') as HTMLElement;
    if (legendItems.length > 0) {
      legendEl.style.display = 'flex';
      legendEl.style.gap = '1.5rem';
      legendEl.style.marginTop = '1rem';
      legendEl.style.flexWrap = 'wrap';
      legendEl.innerHTML = legendItems.map(item =>
        `<span class="legend-item"><span class="legend-color" style="background:${item.color};width:20px;height:4px;border-radius:2px;"></span> ${item.label}</span>`
      ).join('');
    } else {
      legendEl.innerHTML = '';
    }
  }
}
