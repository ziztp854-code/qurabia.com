'use client';

let context: AudioContext | null = null;
let muted = false;
let restored = false;

const MUTED_KEY = 'tahaddi-sw-muted';

type AudioContextCtor = typeof AudioContext;

function ensureContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!context) {
    const win = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
    const Ctor = win.AudioContext ?? win.webkitAudioContext;
    if (!Ctor) return null;
    context = new Ctor();
  }
  if (context.state === 'suspended') void context.resume();
  return context;
}

function tone(
  freq: number,
  start: number,
  duration: number,
  gain: number,
  type: OscillatorType,
): void {
  const ctx = ensureContext();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  amp.gain.setValueAtTime(0, ctx.currentTime + start);
  amp.gain.linearRampToValueAtTime(gain, ctx.currentTime + start + 0.015);
  amp.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + duration);
  osc.connect(amp).connect(ctx.destination);
  osc.start(ctx.currentTime + start);
  osc.stop(ctx.currentTime + start + duration + 0.05);
}

export function isSoundMuted(): boolean {
  if (!restored && typeof window !== 'undefined') {
    restored = true;
    muted = window.localStorage.getItem(MUTED_KEY) === '1';
  }
  return muted;
}

export function setSoundMuted(value: boolean): void {
  muted = value;
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(MUTED_KEY, value ? '1' : '0');
  }
}

export const sfx = {
  correct(): void {
    if (isSoundMuted()) return;
    tone(660, 0, 0.12, 0.05, 'sine');
    tone(880, 0.09, 0.16, 0.05, 'sine');
  },
  wrong(): void {
    if (isSoundMuted()) return;
    tone(180, 0, 0.22, 0.07, 'sawtooth');
  },
  tick(): void {
    if (isSoundMuted()) return;
    tone(1050, 0, 0.05, 0.025, 'square');
  },
  win(): void {
    if (isSoundMuted()) return;
    [523, 659, 784, 1047].forEach((freq, index) => {
      tone(freq, index * 0.13, 0.26, 0.06, 'triangle');
    });
  },
};
