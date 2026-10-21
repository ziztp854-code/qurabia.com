// Local fixture adapters; the audio suites exercise the real media implementation.
import { useEffect, useImperativeHandle, type Ref } from 'react';
export function useRouter() {
  return { push: () => undefined, refresh: () => undefined, replace: () => undefined };
}
export function AudioSession({
  onStateChange,
  onSpeakersChange,
  ref,
}: {
  onStateChange: (state: string) => void;
  onSpeakersChange?: (speakers: string[]) => void;
  ref?: Ref<unknown>;
}) {
  useEffect(() => {
    onStateChange('connected');
  }, [onStateChange]);
  useEffect(() => {
    const update = (event: Event) => onSpeakersChange?.((event as CustomEvent<string[]>).detail);
    window.addEventListener('live-room-speaking', update);
    return () => window.removeEventListener('live-room-speaking', update);
  }, [onSpeakersChange]);
  useImperativeHandle(ref, () => ({
    resumePlayback: async () => undefined,
    muteImmediately: () => undefined,
  }));
  return null;
}
