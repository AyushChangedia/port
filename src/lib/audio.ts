/**
 * Interface sound.
 *
 * Off by default and silent until the visitor asks for it. Every sound is
 * synthesised — no audio files to download, nothing to autoplay. The site is
 * complete without it; sound is punctuation, not content.
 */

type Voice = 'tick' | 'open' | 'close' | 'signal';

const STORAGE_KEY = 'ac.sound';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = false;
const listeners = new Set<(on: boolean) => void>();

export function soundEnabled(): boolean {
  return enabled;
}

export function loadSoundPreference(): boolean {
  try {
    enabled = localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    enabled = false;
  }
  return enabled;
}

export function onSoundChange(fn: (on: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function ensureContext(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.055; // quiet by design
    master.connect(ctx.destination);
  } catch {
    ctx = null;
  }
  return ctx;
}

export function setSound(on: boolean): void {
  enabled = on;
  try {
    localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
  } catch {
    /* storage unavailable — the toggle still works for this session */
  }
  if (on) {
    const c = ensureContext();
    void c?.resume();
    play('open');
  }
  listeners.forEach((fn) => fn(on));
}

export function toggleSound(): boolean {
  setSound(!enabled);
  return enabled;
}

const VOICES: Record<Voice, { freq: number; decay: number; type: OscillatorType }> = {
  tick: { freq: 2100, decay: 0.035, type: 'triangle' },
  open: { freq: 340, decay: 0.22, type: 'sine' },
  close: { freq: 190, decay: 0.24, type: 'sine' },
  signal: { freq: 880, decay: 0.1, type: 'square' },
};

export function play(voice: Voice): void {
  if (!enabled) return;
  const c = ensureContext();
  if (!c || !master || c.state === 'suspended') {
    void c?.resume();
    if (!c || !master) return;
  }
  const { freq, decay, type } = VOICES[voice];
  const now = c.currentTime;

  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (voice === 'open') osc.frequency.exponentialRampToValueAtTime(freq * 1.7, now + decay);
  if (voice === 'close') osc.frequency.exponentialRampToValueAtTime(freq * 0.55, now + decay);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(1, now + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + decay);

  osc.connect(gain);
  gain.connect(master);
  osc.start(now);
  osc.stop(now + decay + 0.02);
  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };
}
