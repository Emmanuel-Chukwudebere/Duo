export type DuckingListener = (level: number, speaking: boolean) => void;

const SPEECH_THRESHOLD = 0.02;
const SPEECH_HOLD_MS = 80;
const SILENCE_RESTORE_MS = 1200;
const DUCK_LEVEL = 0.25;
const FULL_LEVEL = 1;

/**
 * Lightweight VAD using AnalyserNode RMS on a mic MediaStream.
 * Calls onChange with target media gain 0..1 and speaking flag.
 */
export class VadDuckingEngine {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private raf = 0;
  private speechSince: number | null = null;
  private silenceSince: number | null = null;
  private ducked = false;
  private remoteSpeaking = false;
  private enabled = true;
  private listeners = new Set<DuckingListener>();
  private level = FULL_LEVEL;

  setEnabled(on: boolean) {
    this.enabled = on;
    if (!on) {
      this.ducked = false;
      this.setLevel(FULL_LEVEL, false);
    }
  }

  setRemoteSpeaking(active: boolean) {
    this.remoteSpeaking = active;
  }

  forceDuck() {
    if (!this.enabled) return;
    this.ducked = true;
    this.setLevel(DUCK_LEVEL, true);
    window.setTimeout(() => {
      this.ducked = false;
      this.setLevel(FULL_LEVEL, false);
    }, 1850);
  }

  subscribe(fn: DuckingListener) {
    this.listeners.add(fn);
    fn(this.level, this.ducked);
    return () => this.listeners.delete(fn);
  }

  async attachMic(stream: MediaStream) {
    this.detach();
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctx();
    if (this.ctx.state === "suspended") await this.ctx.resume();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.source = this.ctx.createMediaStreamSource(stream);
    this.source.connect(this.analyser);
    this.loop();
  }

  detach() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    try {
      this.source?.disconnect();
    } catch {
      /* ignore */
    }
    void this.ctx?.close();
    this.ctx = null;
    this.analyser = null;
    this.source = null;
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    if (!this.analyser || !this.enabled) return;

    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i]! - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / data.length);
    const now = performance.now();
    const localSpeech = rms > SPEECH_THRESHOLD;
    const speech = localSpeech || this.remoteSpeaking;

    if (speech) {
      this.silenceSince = null;
      if (this.speechSince == null) this.speechSince = now;
      if (!this.ducked && now - this.speechSince >= SPEECH_HOLD_MS) {
        this.ducked = true;
        this.animateTo(DUCK_LEVEL, 120, true);
      }
    } else {
      this.speechSince = null;
      if (this.silenceSince == null) this.silenceSince = now;
      if (this.ducked && now - this.silenceSince >= SILENCE_RESTORE_MS) {
        this.ducked = false;
        this.animateTo(FULL_LEVEL, 350, false);
      }
    }
  };

  private animateTo(target: number, ms: number, speaking: boolean) {
    const start = this.level;
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      const eased = 1 - Math.pow(1 - p, 2);
      this.setLevel(start + (target - start) * eased, speaking);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  private setLevel(level: number, speaking: boolean) {
    this.level = level;
    for (const fn of this.listeners) fn(level, speaking);
  }
}
