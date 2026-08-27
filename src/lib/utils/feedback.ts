/**
 * Shutter sound and haptics. The sound is synthesised with WebAudio rather than
 * shipped as a file: it is a few hundred bytes of code instead of a download,
 * and it can be retuned without touching an asset pipeline.
 */

let ctx: AudioContext | null = null;
let unlocked = false;

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) {
    try {
      ctx = new Ctor();
    } catch {
      return null;
    }
  }
  return ctx;
}

/**
 * Browsers only allow audio to start inside a user gesture. Call this from the
 * click that opens the booth so later shutter clicks are not silently dropped.
 */
export function unlockAudio(): void {
  if (unlocked) return;
  const ac = audio();
  if (!ac) return;
  void ac.resume().catch(() => undefined);
  unlocked = true;
}

function noiseBurst(ac: AudioContext, when: number, duration: number, gain: number): void {
  const frames = Math.max(1, Math.floor(ac.sampleRate * duration));
  const buffer = ac.createBuffer(1, frames, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    // Exponential decay gives the dry "clack" of a mechanical shutter.
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / frames, 3);
  }
  const src = ac.createBufferSource();
  src.buffer = buffer;

  const filter = ac.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 2600;
  filter.Q.value = 0.9;

  const amp = ac.createGain();
  amp.gain.value = gain;

  src.connect(filter).connect(amp).connect(ac.destination);
  src.start(when);
  src.stop(when + duration);
}

function tone(
  ac: AudioContext,
  when: number,
  frequency: number,
  duration: number,
  gain: number,
  type: OscillatorType = 'sine',
): void {
  const osc = ac.createOscillator();
  const amp = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, when);
  amp.gain.setValueAtTime(0.0001, when);
  amp.gain.exponentialRampToValueAtTime(gain, when + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  osc.connect(amp).connect(ac.destination);
  osc.start(when);
  osc.stop(when + duration + 0.02);
}

export function playShutter(enabled: boolean): void {
  if (!enabled) return;
  const ac = audio();
  if (!ac) return;
  if (ac.state === 'suspended') void ac.resume().catch(() => undefined);
  const t = ac.currentTime;
  noiseBurst(ac, t, 0.05, 0.35);
  noiseBurst(ac, t + 0.055, 0.09, 0.22);
  tone(ac, t, 180, 0.06, 0.12, 'triangle');
}

export function playTick(enabled: boolean, pitch = 880): void {
  if (!enabled) return;
  const ac = audio();
  if (!ac) return;
  if (ac.state === 'suspended') void ac.resume().catch(() => undefined);
  tone(ac, ac.currentTime, pitch, 0.09, 0.06, 'sine');
}

export function playChime(enabled: boolean): void {
  if (!enabled) return;
  const ac = audio();
  if (!ac) return;
  if (ac.state === 'suspended') void ac.resume().catch(() => undefined);
  const t = ac.currentTime;
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
    tone(ac, t + i * 0.075, f, 0.32, 0.07, 'sine');
  });
}

export function playPop(enabled: boolean): void {
  if (!enabled) return;
  const ac = audio();
  if (!ac) return;
  if (ac.state === 'suspended') void ac.resume().catch(() => undefined);
  const t = ac.currentTime;
  const osc = ac.createOscillator();
  const amp = ac.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(420, t);
  osc.frequency.exponentialRampToValueAtTime(900, t + 0.07);
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(0.05, t + 0.01);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  osc.connect(amp).connect(ac.destination);
  osc.start(t);
  osc.stop(t + 0.15);
}

export type HapticPattern = 'tick' | 'capture' | 'success' | 'error';

const PATTERNS: Record<HapticPattern, number | number[]> = {
  tick: 8,
  capture: [0, 26],
  success: [0, 18, 60, 18, 60, 32],
  error: [0, 40, 80, 40],
};

export function haptic(enabled: boolean, pattern: HapticPattern = 'tick'): void {
  if (!enabled) return;
  if (typeof navigator === 'undefined' || !navigator.vibrate) return;
  try {
    navigator.vibrate(PATTERNS[pattern]);
  } catch {
    // Some browsers expose vibrate but throw when the page is not focused.
  }
}

export function closeAudio(): void {
  if (!ctx) return;
  void ctx.close().catch(() => undefined);
  ctx = null;
  unlocked = false;
}
