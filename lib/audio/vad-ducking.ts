export type DuckingListener = (level: number, speaking: boolean) => void;

const SPEECH_THRESHOLD = 0.02;
const SPEECH_HOLD_MS = 80;
const SILENCE_RESTORE_MS = 1200;
const DUCK_LEVEL = 0.25;
const FULL_LEVEL = 1;
const MANUAL_DUCK_MS = 2200;

/**
 * Lightweight VAD using AnalyserNode RMS on a mic MediaStream.
 * Calls onChange with target media gain 0..1 and speaking flag.
 */
export class VadDuckingEngine {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  /** A CLONED mic track fed to the analyser. On iOS Safari, routing the live
   * WebRTC mic track through Web Audio silences it for the peer, so we analyse a
   * clone and leave the original track untouched for the call. */
  private monitorTrack: MediaStreamTrack | null = null;
  private raf = 0;
  private speechSince: number | null = null;
  private silenceSince: number | null = null;
  private ducked = false;
  private remoteSpeaking = false;
  /** Auto VAD on/off — manual Talk still works when auto is off */
  private autoEnabled = true;
  /** Manual Talk lock — VAD loop won't restore until this expires */
  private manualUntil = 0;
  private manualTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<DuckingListener>();
  private level = FULL_LEVEL;

  setEnabled(on: boolean) {
    this.autoEnabled = on;
    if (!on && performance.now() >= this.manualUntil) {
      this.ducked = false;
      this.setLevel(FULL_LEVEL, false);
    }
  }

  setRemoteSpeaking(active: boolean) {
    this.remoteSpeaking = active;
  }

  /**
   * Manual "Talk" — always ducks media for ~2s, even if AUTO duck is off.
   * Returns true if applied.
   */
  forceDuck(ms = MANUAL_DUCK_MS): boolean {
    if (this.manualTimer) {
      clearTimeout(this.manualTimer);
      this.manualTimer = null;
    }
    this.manualUntil = performance.now() + ms;
    this.ducked = true;
    this.animateTo(DUCK_LEVEL, 120, true);

    this.manualTimer = setTimeout(() => {
      this.manualTimer = null;
      this.manualUntil = 0;
      this.ducked = false;
      this.animateTo(FULL_LEVEL, 350, false);
    }, ms);

    return true;
  }

  /** Imperative duck level for UI without mic (still works). */
  getLevel() {
    return this.level;
  }

  subscribe(fn: DuckingListener) {
    this.listeners.add(fn);
    fn(this.level, this.ducked);
    return () => this.listeners.delete(fn);
  }

  async attachMic(stream: MediaStream) {
    this.detach(false);
    // No audio track (e.g. cam-only permission) — nothing to analyze; bail
    // cleanly instead of throwing InvalidStateError in createMediaStreamSource.
    if (stream.getAudioTracks().length === 0) return;
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctx();
    if (this.ctx.state === "suspended") await this.ctx.resume();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;
    // Analyse a CLONE so the real mic track stays clean for WebRTC (iOS Safari
    // otherwise mutes the sent audio → partner gets 0 audio bytes).
    this.monitorTrack = stream.getAudioTracks()[0]!.clone();
    const monitorStream = new MediaStream([this.monitorTrack]);
    this.source = this.ctx.createMediaStreamSource(monitorStream);
    this.source.connect(this.analyser);
    this.loop();
  }

  detach(clearListeners = true) {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this.manualTimer) {
      clearTimeout(this.manualTimer);
      this.manualTimer = null;
    }
    try {
      this.source?.disconnect();
    } catch {
      /* ignore */
    }
    this.monitorTrack?.stop();
    this.monitorTrack = null;
    void this.ctx?.close();
    this.ctx = null;
    this.analyser = null;
    this.source = null;
    if (clearListeners) this.listeners.clear();
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);

    // Manual Talk lock — don't let VAD restore early
    if (performance.now() < this.manualUntil) return;

    if (!this.analyser || !this.autoEnabled) return;

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
