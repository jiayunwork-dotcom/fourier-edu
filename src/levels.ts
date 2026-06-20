import {
  generateWaveform,
  generateTimeSeries,
  computeSpectrum,
  generateWindow,
  powerToDB,
  fourierSeriesCoefficients,
  reconstructFromSeries,
  findPeaks,
} from './mathUtils';
import {
  clearCanvas,
  drawGrid,
  drawAxes,
  drawLinePlot,
  drawStemPlotWithX,
  drawLinePlotWithX,
  autoScaleY,
  autoScaleYWithZero,
} from './canvasUtils';

export interface Level {
  id: number;
  title: string;
  description: string;
  objectives: string[];
  hint: string;
  task: (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number
  ) => { success: boolean; message: string };
  checkAnswer: () => { success: boolean; message: string };
}

export class LevelsSystem {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private currentLevel: number = 0;
  private completedLevels: Set<number> = new Set();
  private levels: Level[] = [];
  // private userAnswers: Map<number, any> = new Map();

  constructor() {
    this.canvas = document.getElementById('level-canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;

    this.initLevels();
    this.setupEventListeners();
    this.renderLevelList();
  }

  private initLevels(): void {
    this.levels = [
      {
        id: 1,
        title: '观察正弦波频谱',
        description: '正弦波是最基本的周期信号。观察一个振幅为1、频率为50Hz的正弦波及其频谱。',
        objectives: ['观察时域正弦波的波形', '观察频域只有单根谱线', '理解谱线位置对应信号频率'],
        hint: '频谱中只有一根谱线，位置在50Hz处，这就是正弦波的频率。',
        task: (ctx, width, height) => {
          const signal: number[] = [];
          const sampleRate = 1000;
          const numSamples = 500;
          const dt = 1 / sampleRate;

          for (let i = 0; i < numSamples; i++) {
            signal.push(generateWaveform('sine', 1, 50, 0, i * dt));
          }

          const spectrum = computeSpectrum(signal, sampleRate, 2);

          const timeRange: [number, number] = [0, 0.04];
          const yRange = autoScaleY(signal.slice(0, 40), 0.2);

          clearCanvas(ctx, width, height);

          const halfHeight = height / 2;
          ctx.save();
          drawGrid(ctx, width, halfHeight, timeRange, yRange);
          drawAxes(ctx, width, halfHeight, timeRange, yRange, '时间 (s)', '幅值', 50);
          drawLinePlot(ctx, signal.slice(0, 40), width, halfHeight, timeRange, yRange, '#4fc3f7', 2, 50);

          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.font = 'bold 12px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('时域波形', width / 2, 15);

          ctx.translate(0, halfHeight + 10);
          const maxFreq = sampleRate / 2;
          const freqXRange: [number, number] = [0, maxFreq];
          const magYRange = autoScaleYWithZero(spectrum.magnitude, 0.2);

          drawGrid(ctx, width, halfHeight - 10, freqXRange, magYRange);
          drawAxes(ctx, width, halfHeight - 10, freqXRange, magYRange, '频率 (Hz)', '幅值', 50);

          const displayFreqs: number[] = [];
          const displayMags: number[] = [];
          for (let i = 0; i < spectrum.frequencies.length; i++) {
            if (spectrum.frequencies[i] <= maxFreq && spectrum.frequencies[i] <= 200) {
              displayFreqs.push(spectrum.frequencies[i]);
              displayMags.push(spectrum.magnitude[i]);
            }
          }

          drawStemPlotWithX(ctx, displayFreqs, displayMags, width, halfHeight - 10,
            [0, 200], magYRange, '#7c4dff', 2, 4, 50);

          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.fillText('频域频谱（注意50Hz处的单根谱线）', width / 2, 15);
          ctx.restore();

          return { success: true, message: '' };
        },
        checkAnswer: () => {
          return { success: true, message: '太棒了！你观察到正弦波的频谱只有单根谱线，这就是傅里叶变换的基本思想——任何信号都可以分解为正弦波的叠加。' };
        },
      },
      {
        id: 2,
        title: '两个正弦波的叠加',
        description: '将两个不同频率的正弦波叠加，观察合成信号的时域波形和频域频谱。',
        objectives: ['观察两个频率分量在时域的叠加效果', '识别频谱中的两根谱线', '理解频域中各分量相互独立'],
        hint: '频谱中应该有两根谱线，分别对应两个正弦波的频率。',
        task: (ctx, width, height) => {
          const sampleRate = 1000;
          const numSamples = 500;
          const components = [
            { type: 'sine' as const, amplitude: 1, frequency: 50, phase: 0 },
            { type: 'sine' as const, amplitude: 0.5, frequency: 120, phase: 0 },
          ];
          const signal = generateTimeSeries(components, sampleRate, numSamples);
          const spectrum = computeSpectrum(signal, sampleRate, 2);

          const timeRange: [number, number] = [0, 0.04];
          const yRange = autoScaleY(signal.slice(0, 40), 0.2);

          clearCanvas(ctx, width, height);
          const halfHeight = height / 2;

          ctx.save();
          drawGrid(ctx, width, halfHeight, timeRange, yRange);
          drawAxes(ctx, width, halfHeight, timeRange, yRange, '时间 (s)', '幅值', 50);
          drawLinePlot(ctx, signal.slice(0, 40), width, halfHeight, timeRange, yRange, '#4fc3f7', 2, 50);

          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.font = 'bold 12px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('合成信号（50Hz + 120Hz）', width / 2, 15);

          ctx.translate(0, halfHeight + 10);
          const freqXRange: [number, number] = [0, 200];
          const magYRange = autoScaleYWithZero(spectrum.magnitude, 0.2);

          drawGrid(ctx, width, halfHeight - 10, freqXRange, magYRange);
          drawAxes(ctx, width, halfHeight - 10, freqXRange, magYRange, '频率 (Hz)', '幅值', 50);

          const displayFreqs: number[] = [];
          const displayMags: number[] = [];
          for (let i = 0; i < spectrum.frequencies.length; i++) {
            if (spectrum.frequencies[i] <= 200) {
              displayFreqs.push(spectrum.frequencies[i]);
              displayMags.push(spectrum.magnitude[i]);
            }
          }

          drawStemPlotWithX(ctx, displayFreqs, displayMags, width, halfHeight - 10,
            freqXRange, magYRange, '#7c4dff', 2, 4, 50);

          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.fillText('频谱（两根谱线分别在50Hz和120Hz）', width / 2, 15);
          ctx.restore();

          return { success: true, message: '' };
        },
        checkAnswer: () => {
          return { success: true, message: '正确！频域中每个频率分量独立显示，这就是傅里叶分析的强大之处——可以清楚地看到信号由哪些频率成分组成。' };
        },
      },
      {
        id: 3,
        title: '方波的奇次谐波特征',
        description: '方波可以展开为傅里叶级数。观察方波的频谱，注意它只包含奇次谐波分量。',
        objectives: ['观察方波的时域波形', '识别频谱中的奇次谐波', '理解谐波幅度按1/n衰减'],
        hint: '方波的傅里叶级数只包含1、3、5、7...次谐波，幅度分别为4/π、4/(3π)、4/(5π)...',
        task: (ctx, width, height) => {
          const sampleRate = 1000;
          const numSamples = 1000;
          const signal: number[] = [];
          const dt = 1 / sampleRate;

          for (let i = 0; i < numSamples; i++) {
            signal.push(generateWaveform('square', 1, 50, 0, i * dt));
          }

          const spectrum = computeSpectrum(signal, sampleRate, 4);

          const timeRange: [number, number] = [0, 0.06];
          const yRange: [number, number] = [-1.5, 1.5];

          clearCanvas(ctx, width, height);
          const halfHeight = height / 2;

          ctx.save();
          drawGrid(ctx, width, halfHeight, timeRange, yRange);
          drawAxes(ctx, width, halfHeight, timeRange, yRange, '时间 (s)', '幅值', 50);
          drawLinePlot(ctx, signal.slice(0, 60), width, halfHeight, timeRange, yRange, '#4fc3f7', 2, 50);

          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.font = 'bold 12px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('方波时域波形', width / 2, 15);

          ctx.translate(0, halfHeight + 10);
          const freqXRange: [number, number] = [0, 400];
          const magYRange: [number, number] = [0, 1.5];

          drawGrid(ctx, width, halfHeight - 10, freqXRange, magYRange);
          drawAxes(ctx, width, halfHeight - 10, freqXRange, magYRange, '频率 (Hz)', '幅值', 50);

          const displayFreqs: number[] = [];
          const displayMags: number[] = [];
          for (let i = 0; i < spectrum.frequencies.length; i++) {
            if (spectrum.frequencies[i] <= 400) {
              displayFreqs.push(spectrum.frequencies[i]);
              displayMags.push(spectrum.magnitude[i]);
            }
          }

          drawStemPlotWithX(ctx, displayFreqs, displayMags, width, halfHeight - 10,
            freqXRange, magYRange, '#7c4dff', 2, 4, 50);

          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.fillText('频谱（只有奇次谐波：50, 150, 250, 350...Hz）', width / 2, 15);
          ctx.restore();

          return { success: true, message: '' };
        },
        checkAnswer: () => {
          return { success: true, message: '完美！方波只包含奇次谐波，这是因为方波是奇函数且具有半波对称性。谐波幅度按1/n衰减，所以高频分量幅度越来越小。' };
        },
      },
      {
        id: 4,
        title: '三角波的谐波特征',
        description: '三角波也可以展开为傅里叶级数。比较三角波与方波的谐波衰减速度。',
        objectives: ['观察三角波的时域波形', '识别三角波的谐波成分', '比较三角波与方波的谐波衰减'],
        hint: '三角波的谐波幅度按1/n²衰减，比方波的1/n衰减更快，所以高频分量更少。',
        task: (ctx, width, height) => {
          const sampleRate = 1000;
          const numSamples = 1000;
          const signal: number[] = [];
          const dt = 1 / sampleRate;

          for (let i = 0; i < numSamples; i++) {
            signal.push(generateWaveform('triangle', 1, 50, 0, i * dt));
          }

          const spectrum = computeSpectrum(signal, sampleRate, 4);

          const timeRange: [number, number] = [0, 0.06];
          const yRange: [number, number] = [-1.5, 1.5];

          clearCanvas(ctx, width, height);
          const halfHeight = height / 2;

          ctx.save();
          drawGrid(ctx, width, halfHeight, timeRange, yRange);
          drawAxes(ctx, width, halfHeight, timeRange, yRange, '时间 (s)', '幅值', 50);
          drawLinePlot(ctx, signal.slice(0, 60), width, halfHeight, timeRange, yRange, '#4fc3f7', 2, 50);

          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.font = 'bold 12px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('三角波时域波形', width / 2, 15);

          ctx.translate(0, halfHeight + 10);
          const freqXRange: [number, number] = [0, 400];
          const magYRange: [number, number] = [0, 1.5];

          drawGrid(ctx, width, halfHeight - 10, freqXRange, magYRange);
          drawAxes(ctx, width, halfHeight - 10, freqXRange, magYRange, '频率 (Hz)', '幅值', 50);

          const displayFreqs: number[] = [];
          const displayMags: number[] = [];
          for (let i = 0; i < spectrum.frequencies.length; i++) {
            if (spectrum.frequencies[i] <= 400) {
              displayFreqs.push(spectrum.frequencies[i]);
              displayMags.push(spectrum.magnitude[i]);
            }
          }

          drawStemPlotWithX(ctx, displayFreqs, displayMags, width, halfHeight - 10,
            freqXRange, magYRange, '#ffa726', 2, 4, 50);

          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.fillText('频谱（谐波按1/n²快速衰减）', width / 2, 15);
          ctx.restore();

          return { success: true, message: '' };
        },
        checkAnswer: () => {
          return { success: true, message: '太棒了！三角波的谐波幅度按1/n²衰减，比方波衰减快得多。这是因为三角波更光滑，没有突变，所以高频分量更少。信号越光滑，高频分量衰减越快。' };
        },
      },
      {
        id: 5,
        title: '傅里叶级数动画演示',
        description: '观察方波的傅里叶级数展开过程。随着谐波次数增加，近似波形如何逼近方波？',
        objectives: ['观察级数逐项叠加的过程', '理解高次谐波如何改善逼近', '观察Gibbs现象（过冲）'],
        hint: '在方波的跳变处，无论叠加多少谐波，都会有约9%的过冲，这就是Gibbs现象。',
        task: (ctx, width, height) => {
          const sampleRate = 1000;
          const numSamples = 500;
          const fundamentalFreq = 10;
          const numHarmonics = 25;

          const { amplitudes, phases } = fourierSeriesCoefficients('square', numHarmonics);

          const original: number[] = [];
          const approx1: number[] = [];
          const approx3: number[] = [];
          const approx10: number[] = [];
          const approx25: number[] = [];

          const dt = 1 / sampleRate;
          for (let i = 0; i < numSamples; i++) {
            const t = i * dt;
            original.push(generateWaveform('square', 1, fundamentalFreq, 0, t));
            approx1.push(reconstructFromSeries(amplitudes, phases, fundamentalFreq, t, 1));
            approx3.push(reconstructFromSeries(amplitudes, phases, fundamentalFreq, t, 3));
            approx10.push(reconstructFromSeries(amplitudes, phases, fundamentalFreq, t, 10));
            approx25.push(reconstructFromSeries(amplitudes, phases, fundamentalFreq, t, 25));
          }

          const timeRange: [number, number] = [0, 0.2];
          const yRange: [number, number] = [-1.5, 1.5];

          clearCanvas(ctx, width, height);
          drawGrid(ctx, width, height, timeRange, yRange);
          drawAxes(ctx, width, height, timeRange, yRange, '时间 (s)', '幅值', 50);

          drawLinePlot(ctx, original, width, height, timeRange, yRange, 'rgba(255,255,255,0.2)', 2, 50);
          drawLinePlot(ctx, approx1, width, height, timeRange, yRange, '#ef5350', 2, 50);
          drawLinePlot(ctx, approx3, width, height, timeRange, yRange, '#ffa726', 2, 50);
          drawLinePlot(ctx, approx10, width, height, timeRange, yRange, '#66bb6a', 2, 50);
          drawLinePlot(ctx, approx25, width, height, timeRange, yRange, '#4fc3f7', 2.5, 50);

          const legendY = 25;
          ctx.font = '11px sans-serif';
          ctx.textAlign = 'left';

          ctx.fillStyle = 'rgba(255,255,255,0.5)';
          ctx.fillRect(60, legendY - 8, 20, 4);
          ctx.fillText('原始方波', 85, legendY);

          ctx.fillStyle = '#ef5350';
          ctx.fillRect(170, legendY - 8, 20, 4);
          ctx.fillText('1次谐波', 195, legendY);

          ctx.fillStyle = '#ffa726';
          ctx.fillRect(270, legendY - 8, 20, 4);
          ctx.fillText('3次谐波', 295, legendY);

          ctx.fillStyle = '#66bb6a';
          ctx.fillRect(370, legendY - 8, 20, 4);
          ctx.fillText('10次谐波', 395, legendY);

          ctx.fillStyle = '#4fc3f7';
          ctx.fillRect(490, legendY - 8, 20, 4);
          ctx.fillText('25次谐波', 515, legendY);

          ctx.fillStyle = '#ef5350';
          ctx.font = 'bold 12px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('⚠ 注意跳变处的Gibbs过冲现象', width / 2, height - 10);

          return { success: true, message: '' };
        },
        checkAnswer: () => {
          return { success: true, message: '完美！你观察到了Gibbs现象——在不连续点附近，无论叠加多少谐波，都会有约9%的过冲。这是因为用有限的连续正弦波来逼近不连续函数的固有特性。增加谐波次数只能使过冲的宽度变窄，但高度保持不变。' };
        },
      },
      {
        id: 6,
        title: '相位谱的意义',
        description: '幅度谱显示各频率分量的大小，相位谱显示各频率分量的相位。观察相位对波形的影响。',
        objectives: ['理解相位谱的含义', '观察相位改变对波形的影响', '理解为什么 reconstruction 需要相位信息'],
        hint: '如果只保留幅度谱而丢失相位谱，重建的波形会完全失真。',
        task: (ctx, width, height) => {
          const sampleRate = 1000;
          const numSamples = 500;
          const components = [
            { type: 'sine' as const, amplitude: 1, frequency: 50, phase: 0 },
            { type: 'sine' as const, amplitude: 0.5, frequency: 150, phase: 90 },
            { type: 'sine' as const, amplitude: 0.3, frequency: 250, phase: 180 },
          ];

          const original = generateTimeSeries(components, sampleRate, numSamples);

          const components2 = components.map(c => ({ ...c, phase: 0 }));
          const zeroPhase = generateTimeSeries(components2, sampleRate, numSamples);

          const components3 = components.map(c => ({ ...c, phase: Math.random() * 360 }));
          const randomPhase = generateTimeSeries(components3, sampleRate, numSamples);

          // const spectrum = computeSpectrum(original, sampleRate, 2);

          clearCanvas(ctx, width, height);
          const thirdHeight = height / 3;

          const timeRange: [number, number] = [0, 0.04];
          const yRange = autoScaleY([...original, ...zeroPhase, ...randomPhase], 0.2);

          ctx.save();
          drawGrid(ctx, width, thirdHeight, timeRange, yRange);
          drawAxes(ctx, width, thirdHeight, timeRange, yRange, '', '幅值', 50);
          drawLinePlot(ctx, original.slice(0, 40), width, thirdHeight, timeRange, yRange, '#4fc3f7', 2, 50);
          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.font = 'bold 11px sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText('原始相位', 55, 15);

          ctx.translate(0, thirdHeight + 5);
          drawGrid(ctx, width, thirdHeight, timeRange, yRange);
          drawAxes(ctx, width, thirdHeight, timeRange, yRange, '', '幅值', 50);
          drawLinePlot(ctx, zeroPhase.slice(0, 40), width, thirdHeight, timeRange, yRange, '#ffa726', 2, 50);
          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.fillText('零相位（所有分量同相）', 55, 15);

          ctx.translate(0, thirdHeight + 5);
          drawGrid(ctx, width, thirdHeight, timeRange, yRange);
          drawAxes(ctx, width, thirdHeight, timeRange, yRange, '时间 (s)', '幅值', 50);
          drawLinePlot(ctx, randomPhase.slice(0, 40), width, thirdHeight, timeRange, yRange, '#ef5350', 2, 50);
          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.fillText('随机相位（幅度相同，相位不同）', 55, 15);

          ctx.restore();

          return { success: true, message: '' };
        },
        checkAnswer: () => {
          return { success: true, message: '正确！幅度谱决定信号包含哪些频率成分，而相位谱决定这些成分如何叠加。没有正确的相位信息，就无法准确重建原始波形。这就是为什么傅里叶变换同时输出幅度和相位的原因。' };
        },
      },
      {
        id: 7,
        title: '频谱泄漏与窗函数',
        description: '当信号频率不是DFT频率分辨率的整数倍时，会发生频谱泄漏。使用窗函数可以减少泄漏。',
        objectives: ['观察频谱泄漏现象', '理解窗函数的作用', '比较不同窗函数的效果'],
        hint: '矩形窗的频谱泄漏最严重，Hanning和Hamming窗可以显著减少泄漏，但主瓣会变宽。',
        task: (ctx, width, height) => {
          const sampleRate = 1000;
          const numSamples = 64;
          const signalFreq = 53.2;

          const signal: number[] = [];
          const dt = 1 / sampleRate;
          for (let i = 0; i < numSamples; i++) {
            signal.push(generateWaveform('sine', 1, signalFreq, 0, i * dt));
          }

          const rectWindow = generateWindow('rect', numSamples);
          const hannWindow = generateWindow('hanning', numSamples);
          const hammWindow = generateWindow('hamming', numSamples);

          const specRect = computeSpectrum(signal, sampleRate, 4, rectWindow);
          const specHann = computeSpectrum(signal, sampleRate, 4, hannWindow);
          const specHamm = computeSpectrum(signal, sampleRate, 4, hammWindow);

          clearCanvas(ctx, width, height);
          const halfHeight = height / 2;

          const freqXRange: [number, number] = [0, 200];
          const maxMag = Math.max(...specRect.magnitude, ...specHann.magnitude, ...specHamm.magnitude);
          const magYRange: [number, number] = [0, maxMag * 1.2];

          ctx.save();
          drawGrid(ctx, width, halfHeight, freqXRange, magYRange);
          drawAxes(ctx, width, halfHeight, freqXRange, magYRange, '频率 (Hz)', '幅值', 50);

          let displayFreqs: number[] = [];
          let displayMags: number[] = [];

          displayFreqs = [];
          displayMags = [];
          for (let i = 0; i < specRect.frequencies.length; i++) {
            if (specRect.frequencies[i] <= 200) {
              displayFreqs.push(specRect.frequencies[i]);
              displayMags.push(specRect.magnitude[i]);
            }
          }
          drawLinePlotWithX(ctx, displayFreqs, displayMags, width, halfHeight, freqXRange, magYRange, '#ef5350', 2, 50);

          displayFreqs = [];
          displayMags = [];
          for (let i = 0; i < specHann.frequencies.length; i++) {
            if (specHann.frequencies[i] <= 200) {
              displayFreqs.push(specHann.frequencies[i]);
              displayMags.push(specHann.magnitude[i]);
            }
          }
          drawLinePlotWithX(ctx, displayFreqs, displayMags, width, halfHeight, freqXRange, magYRange, '#66bb6a', 2, 50);

          displayFreqs = [];
          displayMags = [];
          for (let i = 0; i < specHamm.frequencies.length; i++) {
            if (specHamm.frequencies[i] <= 200) {
              displayFreqs.push(specHamm.frequencies[i]);
              displayMags.push(specHamm.magnitude[i]);
            }
          }
          drawLinePlotWithX(ctx, displayFreqs, displayMags, width, halfHeight, freqXRange, magYRange, '#4fc3f7', 2, 50);

          const legendY = 25;
          ctx.font = '11px sans-serif';
          ctx.textAlign = 'left';
          ctx.fillStyle = '#ef5350';
          ctx.fillRect(55, legendY - 8, 20, 4);
          ctx.fillText('矩形窗（泄漏严重）', 80, legendY);
          ctx.fillStyle = '#66bb6a';
          ctx.fillRect(210, legendY - 8, 20, 4);
          ctx.fillText('Hanning窗', 235, legendY);
          ctx.fillStyle = '#4fc3f7';
          ctx.fillRect(330, legendY - 8, 20, 4);
          ctx.fillText('Hamming窗', 355, legendY);

          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.font = 'bold 12px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(`信号频率: ${signalFreq}Hz，非整数倍频率分辨率，产生频谱泄漏`, width / 2, halfHeight - 10);

          ctx.translate(0, halfHeight + 10);
          const windowXRange: [number, number] = [0, numSamples];
          const windowYRange: [number, number] = [0, 1.2];

          drawGrid(ctx, width, halfHeight - 10, windowXRange, windowYRange);
          drawAxes(ctx, width, halfHeight - 10, windowXRange, windowYRange, '样本点 n', 'w(n)', 50);

          const xData = Array.from({ length: numSamples }, (_, i) => i);
          drawLinePlotWithX(ctx, xData, rectWindow, width, halfHeight - 10, windowXRange, windowYRange, '#ef5350', 2, 50);
          drawLinePlotWithX(ctx, xData, hannWindow, width, halfHeight - 10, windowXRange, windowYRange, '#66bb6a', 2, 50);
          drawLinePlotWithX(ctx, xData, hammWindow, width, halfHeight - 10, windowXRange, windowYRange, '#4fc3f7', 2, 50);

          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.fillText('时域窗函数形状', width / 2, 15);

          ctx.restore();

          return { success: true, message: '' };
        },
        checkAnswer: () => {
          return { success: true, message: '太棒了！你观察到了频谱泄漏现象。当信号频率与DFT频率 bin 不对齐时，能量会扩散到相邻的 bin 中。窗函数通过平滑信号的边缘来减少这种泄漏，但代价是主瓣变宽（频率分辨率降低）。这是频域分析中一个重要的权衡。' };
        },
      },
      {
        id: 8,
        title: '零填充与频率插值',
        description: '对信号进行零填充（补零）可以得到更密的频谱采样点，观察零填充对频谱的影响。',
        objectives: ['理解零填充的作用', '观察零填充如何实现频谱插值', '理解零填充不提高频率分辨率'],
        hint: '零填充只是对频谱进行插值，使曲线更光滑，但不能区分两个靠得很近的频率分量。',
        task: (ctx, width, height) => {
          const sampleRate = 1000;
          const numSamples = 64;
          const signalFreq = 53.2;

          const signal: number[] = [];
          const dt = 1 / sampleRate;
          for (let i = 0; i < numSamples; i++) {
            signal.push(generateWaveform('sine', 1, signalFreq, 0, i * dt));
          }

          const spec1x = computeSpectrum(signal, sampleRate, 1);
          const spec2x = computeSpectrum(signal, sampleRate, 2);
          const spec4x = computeSpectrum(signal, sampleRate, 4);
          const spec8x = computeSpectrum(signal, sampleRate, 8);

          clearCanvas(ctx, width, height);
          const halfHeight = height / 2;

          const freqXRange: [number, number] = [30, 80];
          const magYRange: [number, number] = [0, 1.2];

          ctx.save();
          drawGrid(ctx, width, halfHeight, freqXRange, magYRange);
          drawAxes(ctx, width, halfHeight, freqXRange, magYRange, '频率 (Hz)', '幅值', 50);

          let displayFreqs: number[] = [];
          let displayMags: number[] = [];

          displayFreqs = [];
          displayMags = [];
          for (let i = 0; i < spec1x.frequencies.length; i++) {
            if (spec1x.frequencies[i] >= 30 && spec1x.frequencies[i] <= 80) {
              displayFreqs.push(spec1x.frequencies[i]);
              displayMags.push(spec1x.magnitude[i]);
            }
          }
          drawStemPlotWithX(ctx, displayFreqs, displayMags, width, halfHeight, freqXRange, magYRange, '#ef5350', 2, 5, 50);

          displayFreqs = [];
          displayMags = [];
          for (let i = 0; i < spec2x.frequencies.length; i++) {
            if (spec2x.frequencies[i] >= 30 && spec2x.frequencies[i] <= 80) {
              displayFreqs.push(spec2x.frequencies[i]);
              displayMags.push(spec2x.magnitude[i]);
            }
          }
          drawStemPlotWithX(ctx, displayFreqs, displayMags, width, halfHeight, freqXRange, magYRange, '#ffa726', 2, 4, 50);

          displayFreqs = [];
          displayMags = [];
          for (let i = 0; i < spec4x.frequencies.length; i++) {
            if (spec4x.frequencies[i] >= 30 && spec4x.frequencies[i] <= 80) {
              displayFreqs.push(spec4x.frequencies[i]);
              displayMags.push(spec4x.magnitude[i]);
            }
          }
          drawStemPlotWithX(ctx, displayFreqs, displayMags, width, halfHeight, freqXRange, magYRange, '#66bb6a', 2, 3, 50);

          displayFreqs = [];
          displayMags = [];
          for (let i = 0; i < spec8x.frequencies.length; i++) {
            if (spec8x.frequencies[i] >= 30 && spec8x.frequencies[i] <= 80) {
              displayFreqs.push(spec8x.frequencies[i]);
              displayMags.push(spec8x.magnitude[i]);
            }
          }
          drawLinePlotWithX(ctx, displayFreqs, displayMags, width, halfHeight, freqXRange, magYRange, '#4fc3f7', 2, 50);

          const legendY = 25;
          ctx.font = '11px sans-serif';
          ctx.textAlign = 'left';
          ctx.fillStyle = '#ef5350';
          ctx.fillRect(55, legendY - 8, 20, 4);
          ctx.fillText('1x (无补零)', 80, legendY);
          ctx.fillStyle = '#ffa726';
          ctx.fillRect(170, legendY - 8, 20, 4);
          ctx.fillText('2x 补零', 195, legendY);
          ctx.fillStyle = '#66bb6a';
          ctx.fillRect(270, legendY - 8, 20, 4);
          ctx.fillText('4x 补零', 295, legendY);
          ctx.fillStyle = '#4fc3f7';
          ctx.fillRect(370, legendY - 8, 20, 4);
          ctx.fillText('8x 补零', 395, legendY);

          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.font = 'bold 12px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('零填充使频谱采样更密集，但主瓣宽度不变', width / 2, halfHeight - 10);

          ctx.translate(0, halfHeight + 10);
          const timeXRange: [number, number] = [0, numSamples * 8];
          const timeYRange: [number, number] = [-1.5, 1.5];

          drawGrid(ctx, width, halfHeight - 10, timeXRange, timeYRange);
          drawAxes(ctx, width, halfHeight - 10, timeXRange, timeYRange, '样本点 n', 'x(n)', 50);

          const paddedSignal = [...signal];
          while (paddedSignal.length < numSamples * 8) {
            paddedSignal.push(0);
          }

          drawLinePlot(ctx, paddedSignal, width, halfHeight - 10, timeXRange, timeYRange, '#7c4dff', 2, 50);

          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.fillText('零填充信号（末尾补零）', width / 2, 15);

          ctx.restore();

          return { success: true, message: '' };
        },
        checkAnswer: () => {
          return { success: true, message: '正确！零填充在时域给信号补零，在频域相当于对频谱进行插值，得到更密集的采样点。但重要的是要理解：零填充不提高频率分辨率！频率分辨率由实际信号长度决定，零填充只是让频谱曲线看起来更光滑而已。' };
        },
      },
      {
        id: 9,
        title: '采样率与频率范围',
        description: 'DFT的频率范围由采样率决定，最高可分析频率为采样率的一半（Nyquist频率）。',
        objectives: ['理解Nyquist采样定理', '观察采样率如何影响频率范围', '理解混叠现象'],
        hint: '采样率必须至少是信号最高频率的2倍，否则会发生混叠。',
        task: (ctx, width, height) => {
          const signalFreq = 80;

          const sampleRates = [200, 500, 1000];
          const signals: number[][] = [];
          const spectra: any[] = [];

          for (const sr of sampleRates) {
            const numSamples = Math.floor(sr * 0.05);
            const signal: number[] = [];
            const dt = 1 / sr;
            for (let i = 0; i < numSamples; i++) {
              signal.push(generateWaveform('sine', 1, signalFreq, 0, i * dt));
            }
            signals.push(signal);
            spectra.push(computeSpectrum(signal, sr, 2));
          }

          clearCanvas(ctx, width, height);
          const plotHeight = height / 3;

          ctx.save();
          for (let i = 0; i < 3; i++) {
            const sr = sampleRates[i];
            const nyquist = sr / 2;

            const freqXRange: [number, number] = [0, nyquist];
            const magYRange = autoScaleYWithZero(spectra[i].magnitude, 0.2);

            drawGrid(ctx, width, plotHeight - 10, freqXRange, magYRange);
            drawAxes(ctx, width, plotHeight - 10, freqXRange, magYRange,
              i === 2 ? '频率 (Hz)' : '', '幅值', 50);

            const displayFreqs: number[] = [];
            const displayMags: number[] = [];
            for (let j = 0; j < spectra[i].frequencies.length; j++) {
              if (spectra[i].frequencies[j] <= nyquist) {
                displayFreqs.push(spectra[i].frequencies[j]);
                displayMags.push(spectra[i].magnitude[j]);
              }
            }

            const color = i === 0 ? '#ef5350' : i === 1 ? '#ffa726' : '#66bb6a';
            drawStemPlotWithX(ctx, displayFreqs, displayMags, width, plotHeight - 10,
              freqXRange, magYRange, color, 2, 4, 50);

            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.font = 'bold 12px sans-serif';
            ctx.textAlign = 'left';
            const aliased = sr < 2 * signalFreq;
            const status = aliased ? '❌ 混叠！' : '✓ 正常';
            ctx.fillText(`采样率: ${sr}Hz, Nyquist: ${nyquist}Hz ${status}`, 55, 20);

            if (aliased) {
              ctx.fillStyle = '#ef5350';
              ctx.fillText(`信号频率 ${signalFreq}Hz > Nyquist ${nyquist}Hz`, 55, 40);
            }

            if (i < 2) {
              ctx.translate(0, plotHeight + 5);
            }
          }
          ctx.restore();

          return { success: true, message: '' };
        },
        checkAnswer: () => {
          return { success: true, message: '完美！你验证了Nyquist采样定理。采样率200Hz时，Nyquist频率是100Hz，80Hz的信号可以正常采样。但如果信号频率是120Hz，200Hz的采样率就会发生混叠。记住：采样率必须至少是信号最高频率的2倍！' };
        },
      },
      {
        id: 10,
        title: '窗函数对比实验',
        description: '比较矩形窗、Hanning窗、Hamming窗、Blackman窗的性能差异。',
        objectives: ['理解主瓣宽度与旁瓣衰减的权衡', '比较各窗函数的频域响应', '学会根据应用选择合适的窗函数'],
        hint: '矩形窗主瓣最窄但旁瓣最高；Blackman窗旁瓣最低但主瓣最宽。',
        task: (ctx, width, height) => {
          const numSamples = 128;
          const sampleRate = 1000;

          const windows = [
            { name: '矩形窗', type: 'rect', color: '#ef5350' },
            { name: 'Hanning', type: 'hanning', color: '#4fc3f7' },
            { name: 'Hamming', type: 'hamming', color: '#66bb6a' },
            { name: 'Blackman', type: 'blackman', color: '#ffa726' },
          ];

          const impulse: number[] = new Array(numSamples).fill(0);
          impulse[numSamples / 2] = 1;

          clearCanvas(ctx, width, height);
          const halfHeight = height / 2;

          ctx.save();
          const timeXRange: [number, number] = [0, numSamples];
          const timeYRange: [number, number] = [0, 1.2];

          drawGrid(ctx, width, halfHeight, timeXRange, timeYRange);
          drawAxes(ctx, width, halfHeight, timeXRange, timeYRange, '样本点 n', 'w(n)', 50);

          const xData = Array.from({ length: numSamples }, (_, i) => i);

          for (const w of windows) {
            const window = generateWindow(w.type, numSamples);
            drawLinePlotWithX(ctx, xData, window, width, halfHeight, timeXRange, timeYRange, w.color, 2, 50);
          }

          const legendY = 25;
          ctx.font = '11px sans-serif';
          ctx.textAlign = 'left';
          let lx = 55;
          for (const w of windows) {
            ctx.fillStyle = w.color;
            ctx.fillRect(lx, legendY - 8, 20, 4);
            ctx.fillText(w.name, lx + 25, legendY);
            lx += 120;
          }

          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.font = 'bold 12px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('时域窗函数', width / 2, halfHeight - 10);

          ctx.translate(0, halfHeight + 10);

          const freqXRange: [number, number] = [0, 200];
          const freqYRange: [number, number] = [-100, 10];

          drawGrid(ctx, width, halfHeight - 10, freqXRange, freqYRange);
          drawAxes(ctx, width, halfHeight - 10, freqXRange, freqYRange, '频率 (Hz)', '幅度 (dB)', 50);

          for (const w of windows) {
            const window = generateWindow(w.type, numSamples);
            const windowed = impulse.map((v, i) => v * window[i]);
            const spectrum = computeSpectrum(windowed, sampleRate, 4);
            const powerDB = powerToDB(spectrum.power);

            const displayFreqs: number[] = [];
            const displayPower: number[] = [];
            for (let i = 0; i < spectrum.frequencies.length; i++) {
              if (spectrum.frequencies[i] <= 200) {
                displayFreqs.push(spectrum.frequencies[i]);
                displayPower.push(Math.max(-100, powerDB[i]));
              }
            }

            drawLinePlotWithX(ctx, displayFreqs, displayPower, width, halfHeight - 10,
              freqXRange, freqYRange, w.color, 2, 50);
          }

          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.fillText('频域响应（注意旁瓣高度差异）', width / 2, 15);

          ctx.restore();

          return { success: true, message: '' };
        },
        checkAnswer: () => {
          return { success: true, message: '太棒了！你看到了窗函数设计中的核心权衡：矩形窗主瓣最窄（频率分辨率最好）但旁瓣最高（泄漏最严重）；Blackman窗旁瓣衰减最大（泄漏最小）但主瓣最宽（频率分辨率最差）。选择哪种窗函数取决于你的应用需求——是要精确的频率测量还是要检测弱信号？' };
        },
      },
      {
        id: 11,
        title: '低通滤波',
        description: '设计一个低通滤波器，只保留信号中的低频成分。',
        objectives: ['理解低通滤波的原理', '观察滤波前后的频谱变化', '观察滤波前后的时域波形变化'],
        hint: '低通滤波器让低频通过，衰减高频。',
        task: (ctx, width, height) => {
          const sampleRate = 1000;
          const numSamples = 500;
          const components = [
            { type: 'sine' as const, amplitude: 1, frequency: 30, phase: 0 },
            { type: 'sine' as const, amplitude: 0.5, frequency: 100, phase: 0 },
            { type: 'sine' as const, amplitude: 0.3, frequency: 200, phase: 0 },
          ];

          const original = generateTimeSeries(components, sampleRate, numSamples);
          const filtered = generateTimeSeries([components[0]], sampleRate, numSamples);

          const specOrig = computeSpectrum(original, sampleRate, 2);
          const specFilt = computeSpectrum(filtered, sampleRate, 2);

          clearCanvas(ctx, width, height);
          const halfHeight = height / 2;

          const freqXRange: [number, number] = [0, 300];
          const magYRange = autoScaleYWithZero([...specOrig.magnitude, ...specFilt.magnitude], 0.2);

          ctx.save();
          drawGrid(ctx, width, halfHeight, freqXRange, magYRange);
          drawAxes(ctx, width, halfHeight, freqXRange, magYRange, '频率 (Hz)', '幅值', 50);

          let displayFreqs: number[] = [];
          let displayMags: number[] = [];

          for (let i = 0; i < specOrig.frequencies.length; i++) {
            if (specOrig.frequencies[i] <= 300) {
              displayFreqs.push(specOrig.frequencies[i]);
              displayMags.push(specOrig.magnitude[i]);
            }
          }
          drawStemPlotWithX(ctx, displayFreqs, displayMags, width, halfHeight, freqXRange, magYRange,
            'rgba(79, 195, 247, 0.5)', 2, 4, 50);

          displayFreqs = [];
          displayMags = [];
          for (let i = 0; i < specFilt.frequencies.length; i++) {
            if (specFilt.frequencies[i] <= 300) {
              displayFreqs.push(specFilt.frequencies[i]);
              displayMags.push(specFilt.magnitude[i]);
            }
          }
          drawStemPlotWithX(ctx, displayFreqs, displayMags, width, halfHeight, freqXRange, magYRange,
            '#7c4dff', 2, 5, 50);

          const cutoff = 50;
          const plotWidth = width - 100;
          const cutoffX = 50 + (cutoff / 300) * plotWidth;
          ctx.strokeStyle = '#ef5350';
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          ctx.moveTo(cutoffX, 50);
          ctx.lineTo(cutoffX, halfHeight - 50);
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.fillStyle = '#ef5350';
          ctx.font = '11px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('截止频率 50Hz', cutoffX, 40);

          const legendY = 25;
          ctx.font = '11px sans-serif';
          ctx.textAlign = 'left';
          ctx.fillStyle = 'rgba(79, 195, 247, 0.7)';
          ctx.fillRect(55, legendY - 8, 20, 4);
          ctx.fillText('原始信号', 80, legendY);
          ctx.fillStyle = '#7c4dff';
          ctx.fillRect(160, legendY - 8, 20, 4);
          ctx.fillText('滤波后（只有30Hz）', 185, legendY);

          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.font = 'bold 12px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('频域：高通和带通成分被移除', width / 2, halfHeight - 10);

          ctx.translate(0, halfHeight + 10);

          const timeRange: [number, number] = [0, 0.08];
          const yRange = autoScaleY([...original.slice(0, 80), ...filtered.slice(0, 80)], 0.2);

          drawGrid(ctx, width, halfHeight - 10, timeRange, yRange);
          drawAxes(ctx, width, halfHeight - 10, timeRange, yRange, '时间 (s)', '幅值', 50);

          drawLinePlot(ctx, original.slice(0, 80), width, halfHeight - 10, timeRange, yRange,
            'rgba(79, 195, 247, 0.5)', 2, 50);
          drawLinePlot(ctx, filtered.slice(0, 80), width, halfHeight - 10, timeRange, yRange,
            '#7c4dff', 2.5, 50);

          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.fillText('时域：波形变得更光滑（高频细节丢失）', width / 2, 15);

          ctx.restore();

          return { success: true, message: '' };
        },
        checkAnswer: () => {
          return { success: true, message: '完美！低通滤波在频域移除了高频成分（100Hz和200Hz），只保留了低频（30Hz）。在时域，滤波后的波形变得更光滑，因为高频的快速变化被移除了。这就是频域滤波的本质——修改频谱，然后逆变换回时域。' };
        },
      },
      {
        id: 12,
        title: '带通滤波',
        description: '设计一个带通滤波器，只保留指定频率范围内的信号成分。',
        objectives: ['理解带通滤波的原理', '学会提取指定频段的信号', '观察滤波效果'],
        hint: '带通滤波器只保留指定频率范围内的成分，衰减范围外的成分。',
        task: (ctx, width, height) => {
          const sampleRate = 1000;
          const numSamples = 500;
          const components = [
            { type: 'sine' as const, amplitude: 0.5, frequency: 20, phase: 0 },
            { type: 'sine' as const, amplitude: 1, frequency: 80, phase: 0 },
            { type: 'sine' as const, amplitude: 0.5, frequency: 150, phase: 0 },
            { type: 'sine' as const, amplitude: 0.3, frequency: 250, phase: 0 },
          ];

          const original = generateTimeSeries(components, sampleRate, numSamples);
          const filtered = generateTimeSeries([components[1]], sampleRate, numSamples);

          const specOrig = computeSpectrum(original, sampleRate, 2);
          const specFilt = computeSpectrum(filtered, sampleRate, 2);

          clearCanvas(ctx, width, height);
          const halfHeight = height / 2;

          const freqXRange: [number, number] = [0, 300];
          const magYRange = autoScaleYWithZero([...specOrig.magnitude, ...specFilt.magnitude], 0.2);

          ctx.save();
          drawGrid(ctx, width, halfHeight, freqXRange, magYRange);
          drawAxes(ctx, width, halfHeight, freqXRange, magYRange, '频率 (Hz)', '幅值', 50);

          let displayFreqs: number[] = [];
          let displayMags: number[] = [];

          for (let i = 0; i < specOrig.frequencies.length; i++) {
            if (specOrig.frequencies[i] <= 300) {
              displayFreqs.push(specOrig.frequencies[i]);
              displayMags.push(specOrig.magnitude[i]);
            }
          }
          drawStemPlotWithX(ctx, displayFreqs, displayMags, width, halfHeight, freqXRange, magYRange,
            'rgba(79, 195, 247, 0.5)', 2, 4, 50);

          displayFreqs = [];
          displayMags = [];
          for (let i = 0; i < specFilt.frequencies.length; i++) {
            if (specFilt.frequencies[i] <= 300) {
              displayFreqs.push(specFilt.frequencies[i]);
              displayMags.push(specFilt.magnitude[i]);
            }
          }
          drawStemPlotWithX(ctx, displayFreqs, displayMags, width, halfHeight, freqXRange, magYRange,
            '#ffa726', 2, 5, 50);

          const lowCut = 50;
          const highCut = 120;
          const plotWidth = width - 100;
          const lowX = 50 + (lowCut / 300) * plotWidth;
          const highX = 50 + (highCut / 300) * plotWidth;

          ctx.fillStyle = 'rgba(255, 167, 38, 0.1)';
          ctx.fillRect(lowX, 50, highX - lowX, halfHeight - 100);

          ctx.strokeStyle = '#ffa726';
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          ctx.moveTo(lowX, 50);
          ctx.lineTo(lowX, halfHeight - 50);
          ctx.moveTo(highX, 50);
          ctx.lineTo(highX, halfHeight - 50);
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.fillStyle = '#ffa726';
          ctx.font = '11px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('50-120Hz 通带', (lowX + highX) / 2, 40);

          const legendY = 25;
          ctx.font = '11px sans-serif';
          ctx.textAlign = 'left';
          ctx.fillStyle = 'rgba(79, 195, 247, 0.7)';
          ctx.fillRect(55, legendY - 8, 20, 4);
          ctx.fillText('原始信号', 80, legendY);
          ctx.fillStyle = '#ffa726';
          ctx.fillRect(160, legendY - 8, 20, 4);
          ctx.fillText('带通滤波后（50-120Hz）', 185, legendY);

          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.font = 'bold 12px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('只保留80Hz分量，其他被滤除', width / 2, halfHeight - 10);

          ctx.translate(0, halfHeight + 10);

          const timeRange: [number, number] = [0, 0.08];
          const yRange = autoScaleY([...original.slice(0, 80), ...filtered.slice(0, 80)], 0.2);

          drawGrid(ctx, width, halfHeight - 10, timeRange, yRange);
          drawAxes(ctx, width, halfHeight - 10, timeRange, yRange, '时间 (s)', '幅值', 50);

          drawLinePlot(ctx, original.slice(0, 80), width, halfHeight - 10, timeRange, yRange,
            'rgba(79, 195, 247, 0.5)', 2, 50);
          drawLinePlot(ctx, filtered.slice(0, 80), width, halfHeight - 10, timeRange, yRange,
            '#ffa726', 2.5, 50);

          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.fillText('提取出纯净的80Hz正弦波', width / 2, 15);

          ctx.restore();

          return { success: true, message: '' };
        },
        checkAnswer: () => {
          return { success: true, message: '太棒了！带通滤波可以提取特定频段的信号。这在实际应用中非常有用，比如在通信系统中提取特定信道的信号，或者在音频处理中去除噪声。你已经掌握了频域滤波的核心思想！' };
        },
      },
      {
        id: 13,
        title: '功率谱密度',
        description: '功率谱密度（PSD）描述信号功率随频率的分布。理解功率谱的对数刻度（dB）。',
        objectives: ['理解功率谱的含义', '学会使用dB刻度', '观察不同信号的功率谱特征'],
        hint: 'dB刻度可以同时显示大信号和小信号，方便观察动态范围大的频谱。',
        task: (ctx, width, height) => {
          const sampleRate = 1000;
          const numSamples = 1000;

          const components1 = [
            { type: 'sine' as const, amplitude: 1, frequency: 50, phase: 0 },
            { type: 'sine' as const, amplitude: 0.1, frequency: 150, phase: 0 },
          ];
          const signal1 = generateTimeSeries(components1, sampleRate, numSamples);

          const components2 = [
            { type: 'sine' as const, amplitude: 1, frequency: 50, phase: 0 },
            { type: 'sine' as const, amplitude: 0.01, frequency: 150, phase: 0 },
          ];
          const signal2 = generateTimeSeries(components2, sampleRate, numSamples);

          const spec1 = computeSpectrum(signal1, sampleRate, 2);
          const spec2 = computeSpectrum(signal2, sampleRate, 2);

          // const power1DB = powerToDB(spec1.power);
          const power2DB = powerToDB(spec2.power);

          clearCanvas(ctx, width, height);
          const halfHeight = height / 2;

          const freqXRange: [number, number] = [0, 300];
          const magYRange: [number, number] = [0, 1.2];

          ctx.save();
          drawGrid(ctx, width, halfHeight, freqXRange, magYRange);
          drawAxes(ctx, width, halfHeight, freqXRange, magYRange, '频率 (Hz)', '幅值', 50);

          let displayFreqs: number[] = [];
          let displayMags: number[] = [];

          for (let i = 0; i < spec1.frequencies.length; i++) {
            if (spec1.frequencies[i] <= 300) {
              displayFreqs.push(spec1.frequencies[i]);
              displayMags.push(spec1.magnitude[i]);
            }
          }
          drawStemPlotWithX(ctx, displayFreqs, displayMags, width, halfHeight, freqXRange, magYRange,
            '#4fc3f7', 2, 4, 50);

          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.font = 'bold 12px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('线性刻度：150Hz分量（0.1）是50Hz（1）的1/10，勉强可见', width / 2, 15);

          ctx.translate(0, halfHeight + 10);

          const dbYRange: [number, number] = [-80, 10];

          drawGrid(ctx, width, halfHeight - 10, freqXRange, dbYRange);
          drawAxes(ctx, width, halfHeight - 10, freqXRange, dbYRange, '频率 (Hz)', '功率 (dB)', 50);

          displayFreqs = [];
          let displayDB: number[] = [];
          for (let i = 0; i < spec2.frequencies.length; i++) {
            if (spec2.frequencies[i] <= 300) {
              displayFreqs.push(spec2.frequencies[i]);
              displayDB.push(Math.max(-80, power2DB[i]));
            }
          }
          drawStemPlotWithX(ctx, displayFreqs, displayDB, width, halfHeight - 10, freqXRange, dbYRange,
            '#7c4dff', 2, 4, 50);

          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.font = 'bold 12px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('dB刻度：150Hz分量（0.01）比50Hz（1）低40dB，清晰可见', width / 2, 15);

          const legendY = halfHeight - 25;
          ctx.font = '11px sans-serif';
          ctx.textAlign = 'left';
          ctx.fillStyle = '#4fc3f7';
          ctx.fillRect(55, legendY - 8, 20, 4);
          ctx.fillText('线性刻度（幅度）', 80, legendY);
          ctx.fillStyle = '#7c4dff';
          ctx.fillRect(200, legendY - 8, 20, 4);
          ctx.fillText('对数刻度（dB）', 225, legendY);

          ctx.restore();

          return { success: true, message: '' };
        },
        checkAnswer: () => {
          return { success: true, message: '太棒了！你理解了dB刻度的重要性。在线性刻度上，150Hz分量（幅度0.01）几乎看不见；但在dB刻度上，它清晰地显示为比50Hz分量低40dB（100倍功率）。dB刻度让我们能够同时观察大信号和小信号，这在实际频谱分析中至关重要！' };
        },
      },
      {
        id: 14,
        title: '综合练习：识别信号成分',
        description: '给定一个复杂信号的频谱，识别其中包含的频率成分及其幅度。这是傅里叶分析的实际应用。',
        objectives: ['学会从频谱中识别信号成分', '理解幅度与谱线高度的关系', '综合运用所学知识'],
        hint: '观察频谱中的各个峰值，它们的位置对应频率，高度对应幅度。',
        task: (ctx, width, height) => {
          const sampleRate = 1000;
          const numSamples = 1000;
          const components = [
            { type: 'sine' as const, amplitude: 1.0, frequency: 40, phase: 0 },
            { type: 'sine' as const, amplitude: 0.6, frequency: 100, phase: 45 },
            { type: 'sine' as const, amplitude: 0.3, frequency: 180, phase: 90 },
          ];

          const signal = generateTimeSeries(components, sampleRate, numSamples);
          const spectrum = computeSpectrum(signal, sampleRate, 4);

          clearCanvas(ctx, width, height);
          const halfHeight = height / 2;

          const timeRange: [number, number] = [0, 0.05];
          const yRange = autoScaleY(signal.slice(0, 50), 0.2);

          ctx.save();
          drawGrid(ctx, width, halfHeight, timeRange, yRange);
          drawAxes(ctx, width, halfHeight, timeRange, yRange, '时间 (s)', '幅值', 50);
          drawLinePlot(ctx, signal.slice(0, 50), width, halfHeight, timeRange, yRange, '#4fc3f7', 2, 50);

          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.font = 'bold 12px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('时域：复杂的合成信号', width / 2, 15);

          ctx.translate(0, halfHeight + 10);
          const freqXRange: [number, number] = [0, 250];
          const magYRange = autoScaleYWithZero(spectrum.magnitude, 0.2);

          drawGrid(ctx, width, halfHeight - 10, freqXRange, magYRange);
          drawAxes(ctx, width, halfHeight - 10, freqXRange, magYRange, '频率 (Hz)', '幅值', 50);

          const displayFreqs: number[] = [];
          const displayMags: number[] = [];
          for (let i = 0; i < spectrum.frequencies.length; i++) {
            if (spectrum.frequencies[i] <= 250) {
              displayFreqs.push(spectrum.frequencies[i]);
              displayMags.push(spectrum.magnitude[i]);
            }
          }

          drawStemPlotWithX(ctx, displayFreqs, displayMags, width, halfHeight - 10,
            freqXRange, magYRange, '#7c4dff', 2, 4, 50);

          const peaks = findPeaks(displayMags, 0.1);
          for (const peakIdx of peaks) {
            const freq = displayFreqs[peakIdx];
            const mag = displayMags[peakIdx];
            const plotWidth = width - 100;
            const x = 50 + (freq / 250) * plotWidth;
            const plotHeight = halfHeight - 10 - 100;
            const y = halfHeight - 10 - 50 - (mag / magYRange[1]) * plotHeight;

            ctx.fillStyle = '#ef5350';
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`${freq.toFixed(0)}Hz`, x, y - 8);
          }

          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.fillText('频域：三个清晰的频率分量（点击验证答案）', width / 2, 15);

          ctx.restore();

          return { success: true, message: '' };
        },
        checkAnswer: () => {
          return { success: true, message: '完美！你识别出了三个频率分量：40Hz（幅度1.0）、100Hz（幅度0.6）和180Hz（幅度0.3）。这就是傅里叶分析的强大之处——无论时域波形多么复杂，频域都能清晰地展示其组成成分。你已经掌握了傅里叶变换的核心思想！' };
        },
      },
      {
        id: 15,
        title: '毕业挑战：设计一个音频均衡器',
        description: '恭喜你来到最后一关！运用所学知识，设计一个简单的音频均衡器，对信号进行频域滤波处理。',
        objectives: ['综合运用所有傅里叶分析知识', '理解频域滤波的实际应用', '完成从时域→频域→滤波→时域的完整流程'],
        hint: '完整流程：对信号做FFT→在频域修改各频率分量的幅度→做IFFT回到时域。',
        task: (ctx, width, height) => {
          const sampleRate = 1000;
          const numSamples = 512;

          const components = [
            { type: 'sine' as const, amplitude: 0.5, frequency: 60, phase: 0 },
            { type: 'sine' as const, amplitude: 1.0, frequency: 120, phase: 30 },
            { type: 'sine' as const, amplitude: 0.7, frequency: 200, phase: 60 },
            { type: 'sine' as const, amplitude: 0.4, frequency: 300, phase: 90 },
            { type: 'sine' as const, amplitude: 0.3, frequency: 400, phase: 120 },
          ];

          const original = generateTimeSeries(components, sampleRate, numSamples);

          const gains = [0.2, 1.5, 1.0, 0.5, 0.1];
          const filteredComponents = components.map((c, i) => ({
            ...c,
            amplitude: c.amplitude * gains[i],
          }));
          const equalized = generateTimeSeries(filteredComponents, sampleRate, numSamples);

          const specOrig = computeSpectrum(original, sampleRate, 2);
          const specEq = computeSpectrum(equalized, sampleRate, 2);

          clearCanvas(ctx, width, height);
          const thirdHeight = height / 3;

          const freqXRange: [number, number] = [0, 500];
          const magYRange = autoScaleYWithZero([...specOrig.magnitude, ...specEq.magnitude], 0.2);

          ctx.save();
          drawGrid(ctx, width, thirdHeight, freqXRange, magYRange);
          drawAxes(ctx, width, thirdHeight, freqXRange, magYRange, '', '幅值', 50);

          let displayFreqs: number[] = [];
          let displayMags: number[] = [];

          for (let i = 0; i < specOrig.frequencies.length; i++) {
            if (specOrig.frequencies[i] <= 500) {
              displayFreqs.push(specOrig.frequencies[i]);
              displayMags.push(specOrig.magnitude[i]);
            }
          }
          drawStemPlotWithX(ctx, displayFreqs, displayMags, width, thirdHeight, freqXRange, magYRange,
            'rgba(79, 195, 247, 0.6)', 2, 4, 50);

          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.font = 'bold 12px sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText('原始频谱', 55, 15);

          ctx.translate(0, thirdHeight + 5);
          drawGrid(ctx, width, thirdHeight, freqXRange, [0, 2]);
          drawAxes(ctx, width, thirdHeight, freqXRange, [0, 2], '', '增益', 50);

          const eqFreqs = [60, 120, 200, 300, 400];
          const xData = Array.from({ length: 501 }, (_, i) => i);
          const gainCurve = xData.map((f) => {
            let gain = 1;
            for (let i = 0; i < eqFreqs.length; i++) {
              const center = eqFreqs[i];
              const width = 40;
              const g = gains[i];
              const envelope = Math.exp(-((f - center) ** 2) / (2 * width * width));
              gain = gain * (1 + (g - 1) * envelope);
            }
            return gain;
          });
          drawLinePlotWithX(ctx, xData, gainCurve, width, thirdHeight, freqXRange, [0, 2], '#ffa726', 2, 50);

          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.fillText('均衡器增益曲线（提升120Hz，衰减高低频）', 55, 15);

          ctx.translate(0, thirdHeight + 5);
          drawGrid(ctx, width, thirdHeight, freqXRange, magYRange);
          drawAxes(ctx, width, thirdHeight, freqXRange, magYRange, '频率 (Hz)', '幅值', 50);

          displayFreqs = [];
          displayMags = [];
          for (let i = 0; i < specEq.frequencies.length; i++) {
            if (specEq.frequencies[i] <= 500) {
              displayFreqs.push(specEq.frequencies[i]);
              displayMags.push(specEq.magnitude[i]);
            }
          }
          drawStemPlotWithX(ctx, displayFreqs, displayMags, width, thirdHeight, freqXRange, magYRange,
            '#7c4dff', 2, 5, 50);

          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.fillText('均衡后频谱', 55, 15);

          const legendY = thirdHeight - 20;
          ctx.font = '11px sans-serif';
          ctx.textAlign = 'left';
          ctx.fillStyle = 'rgba(79, 195, 247, 0.7)';
          ctx.fillRect(55, legendY - 8, 20, 4);
          ctx.fillText('原始', 80, legendY);
          ctx.fillStyle = '#ffa726';
          ctx.fillRect(130, legendY - 8, 20, 4);
          ctx.fillText('增益曲线', 155, legendY);
          ctx.fillStyle = '#7c4dff';
          ctx.fillRect(240, legendY - 8, 20, 4);
          ctx.fillText('均衡后', 265, legendY);

          ctx.restore();

          return { success: true, message: '' };
        },
        checkAnswer: () => {
          return { success: true, message: '🎉 恭喜你完成了所有15个关卡！你已经掌握了傅里叶变换与频谱分析的核心概念。\n\n你学会了：\n• 正弦波的频谱特征\n• 傅里叶级数展开与Gibbs现象\n• 幅度谱和相位谱的意义\n• 频谱泄漏与窗函数的作用\n• 零填充与频率插值\n• Nyquist采样定理与混叠\n• 频域滤波（低通、高通、带通）\n• 功率谱与dB刻度\n• 实时音频频谱分析\n\n现在你可以自由探索工具的各个模块，进行更深入的实验和学习！' };
        },
      },
    ];
  }

  private setupEventListeners(): void {
    const checkBtn = document.getElementById('level-check');
    const hintBtn = document.getElementById('level-hint');
    const nextBtn = document.getElementById('level-next');

    if (checkBtn) {
      checkBtn.addEventListener('click', () => this.checkAnswer());
    }
    if (hintBtn) {
      hintBtn.addEventListener('click', () => this.showHint());
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', () => this.nextLevel());
    }
  }

  private renderLevelList(): void {
    const listContainer = document.getElementById('levels-list');
    if (!listContainer) return;

    listContainer.innerHTML = '';

    this.levels.forEach((level, index) => {
      const btn = document.createElement('button');
      btn.className = 'level-btn';
      const isCompleted = this.completedLevels.has(level.id);
      const isUnlocked = index === 0 || this.completedLevels.has(this.levels[index - 1].id);

      if (isCompleted) btn.classList.add('completed');
      if (isUnlocked) btn.classList.add('unlocked');
      if (this.currentLevel === index) btn.classList.add('active');

      btn.innerHTML = `
        <span class="level-number">${level.id}</span>
        <span class="level-title">${level.title}</span>
        ${isCompleted ? '<span class="level-check">✓</span>' : ''}
      `;

      if (isUnlocked) {
        btn.addEventListener('click', () => this.loadLevel(index));
      } else {
        btn.disabled = true;
        btn.title = '完成前一关后解锁';
      }

      listContainer.appendChild(btn);
    });
  }

  private loadLevel(index: number): void {
    if (index < 0 || index >= this.levels.length) return;

    this.currentLevel = index;
    const level = this.levels[index];

    const titleEl = document.getElementById('level-title');
    const descEl = document.getElementById('level-description');
    const objEl = document.getElementById('level-objectives');
    const feedbackEl = document.getElementById('level-feedback');
    const checkBtn = document.getElementById('level-check');
    const nextBtn = document.getElementById('level-next');

    if (titleEl) titleEl.textContent = `第${level.id}关：${level.title}`;
    if (descEl) descEl.innerHTML = `<p>${level.description}</p>`;
    if (objEl) {
      objEl.innerHTML = `
        <h3>学习目标：</h3>
        <ul>${level.objectives.map((o) => `<li>${o}</li>`).join('')}</ul>
      `;
    }
    if (feedbackEl) feedbackEl.innerHTML = '';
    if (checkBtn) (checkBtn as HTMLButtonElement).disabled = false;
    if (nextBtn) (nextBtn as HTMLButtonElement).disabled = true;

    this.renderLevelList();

    const width = this.canvas.width;
    const height = this.canvas.height;
    level.task(this.ctx, width, height);
  }

  private checkAnswer(): void {
    const level = this.levels[this.currentLevel];
    const result = level.checkAnswer();
    const feedbackEl = document.getElementById('level-feedback');
    const nextBtn = document.getElementById('level-next');

    if (feedbackEl) {
      feedbackEl.innerHTML = `
        <div class="feedback ${result.success ? 'success' : 'error'}">
          <p>${result.success ? '✅ 正确！' : '❌ 再想想...'}</p>
          <p>${result.message}</p>
        </div>
      `;
    }

    if (result.success) {
      this.completedLevels.add(level.id);
      if (nextBtn) {
        (nextBtn as HTMLButtonElement).disabled = this.currentLevel >= this.levels.length - 1;
      }
      this.renderLevelList();
    }
  }

  private showHint(): void {
    const level = this.levels[this.currentLevel];
    const feedbackEl = document.getElementById('level-feedback');

    if (feedbackEl) {
      feedbackEl.innerHTML = `
        <div class="feedback hint">
          <p>💡 提示：</p>
          <p>${level.hint}</p>
        </div>
      `;
    }
  }

  private nextLevel(): void {
    if (this.currentLevel < this.levels.length - 1) {
      this.loadLevel(this.currentLevel + 1);
    }
  }

  public getCurrentSignal?(): number[] {
    return [];
  }
}
