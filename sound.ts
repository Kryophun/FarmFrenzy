export const TUSSLE_SOUND_DURATION = 0.5;

export function createTussleSamples(sampleRate: number, random: () => number = Math.random): Float32Array {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new RangeError("The sound sample rate must be positive and finite.");
  }
  const samples = new Float32Array(Math.ceil(sampleRate * TUSSLE_SOUND_DURATION));
  let noise = 0;
  for (let index = 0; index < samples.length; index++) {
    const time = index / sampleRate;
    noise = noise * 0.72 + (random() * 2 - 1) * 0.28;
    const rustle = noise * (0.3 + 0.7 * Math.sin(2 * Math.PI * 17 * time) ** 2) * 0.5;
    let bounce = 0;
    for (let beat = 0; beat < 4; beat++) {
      const elapsed = time - (0.015 + beat * 0.105);
      if (elapsed >= 0 && elapsed < 0.105) {
        const thumpPhase = 2 * Math.PI * (120 * elapsed + 65 * (1 - Math.exp(-45 * elapsed)) / 45);
        const squeakPhase = 2 * Math.PI * (420 * elapsed + 760 * (1 - Math.exp(-20 * elapsed)) / 20);
        bounce += Math.sin(thumpPhase) * Math.exp(-32 * elapsed) * 0.14
          + Math.sin(squeakPhase) * Math.sin(Math.PI * elapsed / 0.105) * 0.12;
      }
    }
    const envelope = Math.min(1, time / 0.012) * Math.min(1, (TUSSLE_SOUND_DURATION - time) / 0.07);
    samples[index] = Math.max(-0.65, Math.min(0.65, (rustle + bounce) * envelope * 0.65));
  }
  samples[0] = 0;
  samples[samples.length - 1] = 0;
  return samples;
}

function createAudioContext(): AudioContext {
  if (typeof AudioContext !== "function") {
    throw new Error("This browser does not support game sound.");
  }
  return new AudioContext();
}

export class TussleSound {
  private enabled = true;
  private context: AudioContext | null = null;
  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;

  constructor(private readonly createContext: () => AudioContext = createAudioContext) {}

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.stop();
    }
  }

  async unlock(): Promise<void> {
    if (!this.enabled) {
      return;
    }
    const context = this.context ?? this.createContext();
    this.context = context;
    if (context.state === "closed") {
      throw new Error("Audio has closed. Refresh the page to enable sound again.");
    }
    if (context.state !== "running") {
      await context.resume();
    }
    if (context.state !== "running") {
      throw new Error("Audio is blocked. Turn Sound off and on to try again.");
    }
  }

  play(): void {
    if (!this.enabled) {
      return;
    }
    const context = this.context;
    if (context?.state !== "running") {
      throw new Error("Audio is not ready. Turn Sound off and on to enable it.");
    }
    this.stop();
    if (this.buffer === null) {
      const samples = createTussleSamples(context.sampleRate);
      this.buffer = context.createBuffer(1, samples.length, context.sampleRate);
      this.buffer.getChannelData(0).set(samples);
    }
    const source = context.createBufferSource();
    source.buffer = this.buffer;
    source.connect(context.destination);
    source.onended = (): void => {
      source.disconnect();
      if (this.source === source) {
        this.source = null;
      }
    };
    try {
      source.start();
    } catch (error) {
      source.onended = null;
      source.disconnect();
      throw error;
    }
    this.source = source;
  }

  stop(): void {
    const source = this.source;
    if (source !== null) {
      this.source = null;
      source.onended = null;
      source.stop();
      source.disconnect();
    }
  }
}
