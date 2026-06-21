import { SignalBuilder } from './signalBuilder';
import { FourierSeries } from './fourierSeries';
import { SpectrumAnalysis } from './spectrumAnalysis';
import { WindowComparison } from './windowComparison';
import { SamplingTheorem } from './samplingTheorem';
import { FrequencyFilter } from './frequencyFilter';
import { RealtimeMic } from './realtimeMic';
import { LevelsSystem } from './levels';
import { SpectrumEditor } from './spectrumEditor';
import { STFTSpectrogram } from './stftSpectrogram';

class App {
  private signalBuilder: SignalBuilder | null = null;
  private spectrumAnalysis: SpectrumAnalysis | null = null;
  private frequencyFilter: FrequencyFilter | null = null;
  private spectrumEditor: SpectrumEditor | null = null;
  private stftSpectrogram: STFTSpectrogram | null = null;

  private initializedTabs: Set<string> = new Set();

  constructor() {
    this.setupTabNavigation();
    this.initTab('signal');
  }

  private setupTabNavigation(): void {
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const target = e.target as HTMLButtonElement;
        const tabName = target.dataset.tab;
        if (tabName) {
          this.switchTab(tabName);
        }
      });
    });
  }

  private switchTab(tabName: string): void {
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.classList.remove('active');
    });
    document.querySelectorAll('.tab-content').forEach((content) => {
      content.classList.remove('active');
    });

    const activeBtn = document.querySelector(`[data-tab="${tabName}"]`);
    const activeContent = document.getElementById(`${tabName}-tab`);

    if (activeBtn) activeBtn.classList.add('active');
    if (activeContent) activeContent.classList.add('active');

    this.initTab(tabName);
  }

  private initTab(tabName: string): void {
    if (this.initializedTabs.has(tabName)) return;

    switch (tabName) {
      case 'signal':
        this.signalBuilder = new SignalBuilder();
        this.signalBuilder.setOnChangeCallback(() => this.onSignalChange());
        break;
      case 'series':
        new FourierSeries();
        break;
      case 'dft':
        this.spectrumAnalysis = new SpectrumAnalysis();
        if (this.signalBuilder) {
          const signal = this.signalBuilder.getSignal();
          this.spectrumAnalysis.setSignal(signal);
        }
        break;
      case 'window':
        new WindowComparison();
        break;
      case 'sampling':
        new SamplingTheorem();
        break;
      case 'filter':
        this.frequencyFilter = new FrequencyFilter();
        if (this.signalBuilder) {
          const signal = this.signalBuilder.getSignal();
          this.frequencyFilter.setSignal(signal);
        }
        break;
      case 'mic':
        new RealtimeMic();
        break;
      case 'levels':
        new LevelsSystem();
        break;
      case 'spectrum-editor':
        this.spectrumEditor = new SpectrumEditor();
        if (this.signalBuilder) {
          this.spectrumEditor.setSignalBuilder(this.signalBuilder);
        }
        break;
      case 'stft':
        this.stftSpectrogram = new STFTSpectrogram();
        if (this.signalBuilder) {
          this.stftSpectrogram.setSignalBuilder(this.signalBuilder);
        }
        break;
    }

    this.initializedTabs.add(tabName);
  }

  private onSignalChange(): void {
    if (this.signalBuilder) {
      const signal = this.signalBuilder.getSignal();
      if (this.spectrumAnalysis && this.initializedTabs.has('dft')) {
        this.spectrumAnalysis.setSignal(signal);
      }
      if (this.frequencyFilter && this.initializedTabs.has('filter')) {
        this.frequencyFilter.setSignal(signal);
      }
      if (this.stftSpectrogram && this.initializedTabs.has('stft')) {
        if (this.stftSpectrogram['signalBuilder']) {
          this.stftSpectrogram.setSignalBuilder(this.signalBuilder);
        }
      }
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new App();
});
