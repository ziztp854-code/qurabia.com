'use client';

import { Volume2, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';

const SOUND_MUTED_KEY = 'tahaddi-sound-muted';

export type GameSoundCue =
  | 'round-start'
  | 'select'
  | 'correct'
  | 'wrong'
  | 'time-up'
  | 'result';

/** Short synthesized cues — no audio assets, no autoplay. */
const CUES: Record<GameSoundCue, { freq: number[]; duration: number; type: OscillatorType }> = {
  'round-start': { freq: [440, 660], duration: 0.16, type: 'sine' },
  select: { freq: [520], duration: 0.08, type: 'sine' },
  correct: { freq: [523, 784], duration: 0.14, type: 'triangle' },
  wrong: { freq: [220, 165], duration: 0.16, type: 'square' },
  'time-up': { freq: [330, 262], duration: 0.2, type: 'sine' },
  result: { freq: [523, 659, 784], duration: 0.14, type: 'triangle' },
};

function readMuted(): boolean {
  try {
    return localStorage.getItem(SOUND_MUTED_KEY) === '1';
  } catch {
    return false;
  }
}

const mutedListeners = new Set<() => void>();

function subscribeMuted(listener: () => void) {
  mutedListeners.add(listener);
  return () => {
    mutedListeners.delete(listener);
  };
}

function writeMuted(next: boolean) {
  try {
    localStorage.setItem(SOUND_MUTED_KEY, next ? '1' : '0');
  } catch {
    // ignore storage errors
  }
  mutedListeners.forEach((listener) => listener());
}

/**
 * Optional game sound cues. The AudioContext is created lazily on the
 * first `play` call (always triggered by a user interaction), so no
 * sound plays before the user interacts. Mute state persists locally.
 */
export function useGameSound() {
  const muted = useSyncExternalStore(subscribeMuted, readMuted, () => false);
  const ctxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    return () => {
      ctxRef.current?.close().catch(() => undefined);
      ctxRef.current = null;
    };
  }, []);

  const toggleMuted = useCallback(() => {
    writeMuted(!readMuted());
  }, []);

  const play = useCallback((cue: GameSoundCue) => {
    if (typeof window === 'undefined' || readMuted()) return;
    try {
      const Ctor = window.AudioContext;
      if (!Ctor) return;
      const ctx = (ctxRef.current ??= new Ctor());
      if (ctx.state === 'suspended') void ctx.resume();
      const { freq, duration, type } = CUES[cue];
      const now = ctx.currentTime;
      freq.forEach((f, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.value = f;
        const start = now + i * duration;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.08, start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start);
        osc.stop(start + duration + 0.02);
      });
    } catch {
      // Audio is best-effort; never break gameplay because of it.
    }
  }, []);

  return { muted, toggleMuted, play };
}

/** Mute/unmute toggle button; pairs with useGameSound. */
export function GameSoundToggle({
  muted,
  onToggle,
}: {
  muted: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="game-sound-toggle"
      aria-pressed={muted}
      aria-label={muted ? 'تشغيل الصوت' : 'كتم الصوت'}
      title={muted ? 'تشغيل الصوت' : 'كتم الصوت'}
      onClick={onToggle}
    >
      {muted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
    </button>
  );
}
