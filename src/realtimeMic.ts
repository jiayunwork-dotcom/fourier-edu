import {
  clearCanvas,
  drawGrid,
  drawAxes,
  drawLinePlot,
} from './canvasUtils';

export class RealtimeMic {
  private timeCanvas: HTMLCanvasElement;
  private timeCtx: CanvasRenderingContext2D;
  private freqCanvas: HTMLCanvasElement;
  private freqCtx: CanvasRenderingContext2D;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaStream: MediaStream | null = null;
  private animationId: number | null = null;
  private fftSize: number = 1024;
  private smoothingTimeConstant: number = 0.8;
  private isRunning: boolean = false;
  private frameCount: number = 0;
  private lastFpsUpdate: number = 0;
  private currentFps: number = 0;
  private freqData: Uint8Array | null = null;
  private timeData: Float32Array | null = null;
  private smoothedFreqData: number[] = [];

  constructor() {
    this.timeCanvas = document.getElementById('mic-time-domain') as HTMLCanvasElement;
    this.timeCtx = this.timeCanvas.getContext('2d')!;
    this.freqCanvas = document.getElementById('mic-frequency-domain') as HTMLCanvasElement;
    this.freqCtx = this.freqCanvas.getContext('2d')!;

    this.setupEventListeners();
    this.renderIdle();
  }

  private setupEventListeners(): void {
    document.getElementById('start-mic')!.addEventListener('click', () => this.start());
    document.getElementById('stop-mic')!.addEventListener('click', () => this.stop());

    document.getElementById('mic-fft-size')!.addEventListener('change', (e) => {
      this.fftSize = parseInt((e.target as HTMLSelectElement).value);
      if (this.analyser) {
        this.analyser.fftSize = this.fftSize;
        this.initializeBuffers();
      }
    });

    document.getElementById('mic-smoothing')!.addEventListener('input', (e) => {
      this.smoothingTimeConstant = parseFloat((e.target as HTMLInputElement).value);
      document.getElementById('mic-smoothing-value')!.textContent = this.smoothingTimeConstant.toFixed(2);
      if (this.analyser) {
        this.analyser.smoothingTimeConstant = this.smoothingTimeConstant;
      }
    });
  }

  private initializeBuffers(): void {
    if (!this.analyser) return;
    this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
    this.timeData = new Float32Array(this.analyser.fftSize);
    this.smoothedFreqData = new Array(this.analyser.frequencyBinCount).fill(0);
  }

  public async start(): Promise<void> {
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);

      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = this.fftSize;
      this.analyser.smoothingTimeConstant = this.smoothingTimeConstant;

      source.connect(this.analyser);
      this.initializeBuffers();

      this.isRunning = true;
      this.updateUIState(true);
      this.animate();
    } catch (error) {
      console.error('无法获取麦克风权限:', error);
      const statusEl = document.getElementById('mic-status-text')!;
      statusEl.textContent = '❌ 无法获取麦克风权限，请检查浏览器设置';
      statusEl.style.color = '#ef5350';
    }
  }

  public stop(): void {
    this.isRunning = false;

    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.analyser = null;
    this.updateUIState(false);
    this.renderIdle();
  }

  private updateUIState(running: boolean): void {
    const startBtn = document.getElementById('start-mic') as HTMLButtonElement;
    const stopBtn = document.getElementById('stop-mic') as HTMLButtonElement;
    const statusEl = document.getElementById('mic-status-text')!;

    startBtn.disabled = running;
    stopBtn.disabled = !running;

    if (running) {
      statusEl.textContent = '🔴 正在采集音频...';
      statusEl.classList.add('recording');
    } else {
      statusEl.textContent = '点击上方按钮开始采集音频';
      statusEl.classList.remove('recording');
      statusEl.style.color = '';
    }
  }

  private animate(): void {
    if (!this.isRunning) return;

    this.animationId = requestAnimationFrame(() => this.animate());

    if (!this.analyser || !this.freqData || !this.timeData) return;

    this.analyser.getByteFrequencyData(this.freqData as Uint8Array<ArrayBuffer>);
    this.analyser.getFloatTimeDomainData(this.timeData as Float32Array<ArrayBuffer>);

    for (let i = 0; i < this.smoothedFreqData.length; i++) {
      this.smoothedFreqData[i] =
        this.smoothingTimeConstant * this.smoothedFreqData[i] +
        (1 - this.smoothingTimeConstant) * (this.freqData[i] / 255);
    }

    this.renderTimeDomain();
    this.renderFrequencyDomain();
    this.updateFPS();
  }

  private updateFPS(): void {
    this.frameCount++;
    const now = performance.now();

    if (now - this.lastFpsUpdate >= 1000) {
      this.currentFps = this.frameCount;
      this.frameCount = 0;
      this.lastFpsUpdate = now;
      document.getElementById('mic-fps')!.textContent = this.currentFps.toString();
    }
  }

  private renderIdle(): void {
    const width = this.timeCanvas.width;
    const height = this.timeCanvas.height;
    const padding = 50;

    const timeXRange: [number, number] = [0, 1024];
    const timeYRange: [number, number] = [-1, 1];

    clearCanvas(this.timeCtx, width, height);
    drawGrid(this.timeCtx, width, height, timeXRange, timeYRange);
    drawAxes(this.timeCtx, width, height, timeXRange, timeYRange, '样本点', '幅值', padding);

    this.timeCtx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    this.timeCtx.font = '14px -apple-system, BlinkMacSystemFont, sans-serif';
    this.timeCtx.textAlign = 'center';
    this.timeCtx.fillText('等待音频输入...', width / 2, height / 2);

    const freqWidth = this.freqCanvas.width;
    const freqHeight = this.freqCanvas.height;
    const freqXRange: [number, number] = [0, 22050];
    const freqYRange: [number, number] = [0, 1];

    clearCanvas(this.freqCtx, freqWidth, freqHeight);
    drawGrid(this.freqCtx, freqWidth, freqHeight, freqXRange, freqYRange);
    drawAxes(this.freqCtx, freqWidth, freqHeight, freqXRange, freqYRange, '频率 (Hz)', '幅度', padding);

    this.freqCtx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    this.freqCtx.textAlign = 'center';
    this.freqCtx.fillText('等待音频输入...', freqWidth / 2, freqHeight / 2);
  }

  private renderTimeDomain(): void {
    if (!this.timeData) return;

    const width = this.timeCanvas.width;
    const height = this.timeCanvas.height;
    const padding = 50;

    const xRange: [number, number] = [0, this.timeData.length];
    const yRange: [number, number] = [-1, 1];

    const signal = Array.from(this.timeData);

    clearCanvas(this.timeCtx, width, height);
    drawGrid(this.timeCtx, width, height, xRange, yRange);
    drawAxes(this.timeCtx, width, height, xRange, yRange, '样本点', '幅值', padding);

    drawLinePlot(
      this.timeCtx,
      signal,
      width,
      height,
      xRange,
      yRange,
      '#4fc3f7',
      2,
      padding
    );
  }

  private renderFrequencyDomain(): void {
    if (!this.analyser || !this.smoothedFreqData) return;

    const width = this.freqCanvas.width;
    const height = this.freqCanvas.height;
    const padding = 50;

    const sampleRate = this.audioContext?.sampleRate || 44100;
    const maxFreq = sampleRate / 2;
    const xRange: [number, number] = [0, maxFreq];
    const yRange: [number, number] = [0, 1];

    clearCanvas(this.freqCtx, width, height);
    drawGrid(this.freqCtx, width, height, xRange, yRange);
    drawAxes(this.freqCtx, width, height, xRange, yRange, '频率 (Hz)', '幅度', padding);

    const plotWidth = width - 2 * padding;
    const plotHeight = height - 2 * padding;
    const barWidth = plotWidth / this.smoothedFreqData.length;

    for (let i = 0; i < this.smoothedFreqData.length; i++) {
      const value = this.smoothedFreqData[i];
      const barHeight = value * plotHeight;

      const hue = 200 - value * 200;
      const color = `hsl(${hue}, 80%, 60%)`;

      this.freqCtx.fillStyle = color;
      this.freqCtx.fillRect(
        padding + i * barWidth,
        height - padding - barHeight,
        Math.max(1, barWidth - 1),
        barHeight
      );
    }
  }

  public destroy(): void {
    this.stop();
  }
}
