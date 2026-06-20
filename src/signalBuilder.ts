import { WaveformComponent, generateTimeSeries } from './mathUtils';
import {
  clearCanvas,
  drawGrid,
  drawAxes,
  drawLinePlot,
  autoScaleY,
} from './canvasUtils';

const MAX_WAVEFORMS = 8;
const SAMPLE_RATE = 1000;
const NUM_SAMPLES = 1000;
const TIME_RANGE: [number, number] = [0, 0.1];

export class SignalBuilder {
  private waveforms: WaveformComponent[] = [];
  private drawnSignal: number[] | null = null;
  private isDrawingMode = false;
  private isDrawing = false;
  private drawCanvas: HTMLCanvasElement;
  private drawCtx: CanvasRenderingContext2D;
  private timeCanvas: HTMLCanvasElement;
  private timeCtx: CanvasRenderingContext2D;
  private waveformListEl: HTMLElement;
  private onChangeCallback: (() => void) | null = null;

  constructor() {
    this.drawCanvas = document.getElementById('draw-canvas') as HTMLCanvasElement;
    this.drawCtx = this.drawCanvas.getContext('2d')!;
    this.timeCanvas = document.getElementById('time-domain-canvas') as HTMLCanvasElement;
    this.timeCtx = this.timeCanvas.getContext('2d')!;
    this.waveformListEl = document.getElementById('waveform-list') as HTMLElement;

    this.setupEventListeners();
    this.addDefaultWaveform();
    this.render();
  }

  private setupEventListeners(): void {
    document.getElementById('add-waveform')!.addEventListener('click', () => this.addWaveform());
    document.getElementById('clear-waveforms')!.addEventListener('click', () => this.clearWaveforms());
    document.getElementById('toggle-draw')!.addEventListener('click', () => this.toggleDrawMode());
    document.getElementById('clear-drawing')!.addEventListener('click', () => this.clearDrawing());

    this.drawCanvas.addEventListener('mousedown', (e) => this.startDrawing(e));
    this.drawCanvas.addEventListener('mousemove', (e) => this.draw(e));
    this.drawCanvas.addEventListener('mouseup', () => this.stopDrawing());
    this.drawCanvas.addEventListener('mouseleave', () => this.stopDrawing());

    this.drawCanvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      this.startDrawing(this.touchToMouse(touch));
    });
    this.drawCanvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      this.draw(this.touchToMouse(touch));
    });
    this.drawCanvas.addEventListener('touchend', () => this.stopDrawing());
  }

  private touchToMouse(touch: Touch): MouseEvent {
    const rect = this.drawCanvas.getBoundingClientRect();
    return {
      offsetX: touch.clientX - rect.left,
      offsetY: touch.clientY - rect.top,
    } as MouseEvent;
  }

  private startDrawing(e: MouseEvent): void {
    if (!this.isDrawingMode) return;
    this.isDrawing = true;
    this.drawnSignal = new Array(this.drawCanvas.width).fill(0);
    this.clearDrawCanvas();
    this.draw(e);
  }

  private draw(e: MouseEvent): void {
    if (!this.isDrawing || !this.drawnSignal) return;

    const x = Math.max(0, Math.min(this.drawCanvas.width - 1, e.offsetX));
    const y = e.offsetY;

    const centerY = this.drawCanvas.height / 2;
    const normalizedY = (centerY - y) / (this.drawCanvas.height / 2);

    this.drawnSignal[Math.floor(x)] = normalizedY * 5;

    this.drawCtx.fillStyle = '#4fc3f7';
    this.drawCtx.beginPath();
    this.drawCtx.arc(x, y, 3, 0, Math.PI * 2);
    this.drawCtx.fill();

    this.render();
  }

  private stopDrawing(): void {
    if (this.isDrawing && this.drawnSignal) {
      this.interpolateDrawnSignal();
    }
    this.isDrawing = false;
  }

  private interpolateDrawnSignal(): void {
    if (!this.drawnSignal) return;

    for (let i = 0; i < this.drawnSignal.length; i++) {
      if (this.drawnSignal[i] === 0 && i > 0 && i < this.drawnSignal.length - 1) {
        let prev = i - 1;
        let next = i + 1;
        while (prev > 0 && this.drawnSignal[prev] === 0) prev--;
        while (next < this.drawnSignal.length - 1 && this.drawnSignal[next] === 0) next++;

        if (this.drawnSignal[prev] !== 0 && this.drawnSignal[next] !== 0) {
          const t = (i - prev) / (next - prev);
          this.drawnSignal[i] = this.drawnSignal[prev] * (1 - t) + this.drawnSignal[next] * t;
        }
      }
    }
  }

  private clearDrawCanvas(): void {
    this.drawCtx.fillStyle = '#0d1117';
    this.drawCtx.fillRect(0, 0, this.drawCanvas.width, this.drawCanvas.height);

    this.drawCtx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    this.drawCtx.lineWidth = 1;
    this.drawCtx.beginPath();
    this.drawCtx.moveTo(0, this.drawCanvas.height / 2);
    this.drawCtx.lineTo(this.drawCanvas.width, this.drawCanvas.height / 2);
    this.drawCtx.stroke();
  }

  private addDefaultWaveform(): void {
    this.waveforms.push({
      type: 'sine',
      amplitude: 1.0,
      frequency: 50,
      phase: 0,
    });
    this.updateWaveformList();
  }

  public addWaveform(): void {
    if (this.waveforms.length >= MAX_WAVEFORMS) {
      alert(`最多只能叠加 ${MAX_WAVEFORMS} 个波形分量`);
      return;
    }

    this.waveforms.push({
      type: 'sine',
      amplitude: 1.0,
      frequency: 50 * (this.waveforms.length + 1),
      phase: 0,
    });
    this.updateWaveformList();
    this.render();
  }

  public clearWaveforms(): void {
    this.waveforms = [];
    this.drawnSignal = null;
    this.clearDrawCanvas();
    this.updateWaveformList();
    this.render();
  }

  public toggleDrawMode(): void {
    this.isDrawingMode = !this.isDrawingMode;
    const container = document.getElementById('draw-container')!;
    const btn = document.getElementById('toggle-draw')!;

    if (this.isDrawingMode) {
      container.style.display = 'block';
      btn.textContent = '关闭手绘';
      btn.classList.remove('btn-secondary');
      btn.classList.add('btn-primary');
      this.clearDrawCanvas();
    } else {
      container.style.display = 'none';
      btn.textContent = '手绘模式';
      btn.classList.add('btn-secondary');
      btn.classList.remove('btn-primary');
    }
  }

  public clearDrawing(): void {
    this.drawnSignal = null;
    this.clearDrawCanvas();
    this.render();
  }

  private updateWaveformList(): void {
    this.waveformListEl.innerHTML = '';

    this.waveforms.forEach((waveform, index) => {
      const item = document.createElement('div');
      item.className = 'waveform-item';
      item.innerHTML = `
        <div class="waveform-item-header">
          <select class="waveform-type">
            <option value="sine" ${waveform.type === 'sine' ? 'selected' : ''}>正弦波</option>
            <option value="cosine" ${waveform.type === 'cosine' ? 'selected' : ''}>余弦波</option>
            <option value="square" ${waveform.type === 'square' ? 'selected' : ''}>方波</option>
            <option value="triangle" ${waveform.type === 'triangle' ? 'selected' : ''}>三角波</option>
            <option value="sawtooth" ${waveform.type === 'sawtooth' ? 'selected' : ''}>锯齿波</option>
          </select>
          <button class="remove-waveform" data-index="${index}">×</button>
        </div>
        <div class="waveform-params">
          <div class="param-row">
            <label>振幅</label>
            <input type="range" class="param-amplitude" min="0.1" max="5.0" step="0.1" value="${waveform.amplitude}">
            <span class="param-value">${waveform.amplitude.toFixed(1)}</span>
          </div>
          <div class="param-row">
            <label>频率</label>
            <input type="range" class="param-frequency" min="1" max="200" step="1" value="${waveform.frequency}">
            <span class="param-value">${waveform.frequency}Hz</span>
          </div>
          <div class="param-row">
            <label>相位</label>
            <input type="range" class="param-phase" min="0" max="360" step="1" value="${waveform.phase}">
            <span class="param-value">${waveform.phase}°</span>
          </div>
        </div>
      `;

      this.waveformListEl.appendChild(item);

      item.querySelector('.waveform-type')!.addEventListener('change', (e) => {
        this.waveforms[index].type = (e.target as HTMLSelectElement).value as any;
        this.render();
      });

      item.querySelector('.param-amplitude')!.addEventListener('input', (e) => {
        const val = parseFloat((e.target as HTMLInputElement).value);
        this.waveforms[index].amplitude = val;
        item.querySelector('.param-amplitude + .param-value')!.textContent = val.toFixed(1);
        this.render();
      });

      item.querySelector('.param-frequency')!.addEventListener('input', (e) => {
        const val = parseInt((e.target as HTMLInputElement).value);
        this.waveforms[index].frequency = val;
        item.querySelector('.param-frequency + .param-value')!.textContent = val + 'Hz';
        this.render();
      });

      item.querySelector('.param-phase')!.addEventListener('input', (e) => {
        const val = parseInt((e.target as HTMLInputElement).value);
        this.waveforms[index].phase = val;
        item.querySelector('.param-phase + .param-value')!.textContent = val + '°';
        this.render();
      });

      item.querySelector('.remove-waveform')!.addEventListener('click', () => {
        this.removeWaveform(index);
      });
    });
  }

  private removeWaveform(index: number): void {
    this.waveforms.splice(index, 1);
    this.updateWaveformList();
    this.render();
  }

  public getSignal(sampleRate: number = SAMPLE_RATE, numSamples: number = NUM_SAMPLES): number[] {
    if (this.drawnSignal && this.isDrawingMode) {
      const resampled: number[] = [];
      const ratio = this.drawnSignal.length / numSamples;
      for (let i = 0; i < numSamples; i++) {
        const idx = Math.floor(i * ratio);
        resampled.push(this.drawnSignal[Math.min(idx, this.drawnSignal.length - 1)]);
      }
      return resampled;
    }
    return generateTimeSeries(this.waveforms, sampleRate, numSamples);
  }

  public getWaveforms(): WaveformComponent[] {
    return [...this.waveforms];
  }

  public setOnChangeCallback(callback: () => void): void {
    this.onChangeCallback = callback;
  }

  public render(): void {
    const signal = this.getSignal(SAMPLE_RATE, NUM_SAMPLES);
    const yRange = autoScaleY(signal, 0.15);

    clearCanvas(this.timeCtx, this.timeCanvas.width, this.timeCanvas.height);
    drawGrid(
      this.timeCtx,
      this.timeCanvas.width,
      this.timeCanvas.height,
      TIME_RANGE,
      yRange
    );
    drawAxes(
      this.timeCtx,
      this.timeCanvas.width,
      this.timeCanvas.height,
      TIME_RANGE,
      yRange,
      '时间 (s)',
      '幅值'
    );
    drawLinePlot(
      this.timeCtx,
      signal,
      this.timeCanvas.width,
      this.timeCanvas.height,
      TIME_RANGE,
      yRange,
      '#4fc3f7',
      2
    );

    if (this.onChangeCallback) {
      this.onChangeCallback();
    }
  }
}
