// Actual room UI; synthetic HTTP + AudioSession adapter; no microphone capture.
import { Profiler } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/cairo';
import '../../tokens.css';
import '../../src/app/globals.css';
import '../../src/app/voice/voice.css';
import { VoiceRoomView } from '../../src/components/voice/voice-room';

type ProfilerCommit = {
  id: string;
  phase: string;
  actualDuration: number;
  baseDuration: number;
  startTime: number;
  commitTime: number;
};
export type TypingMetrics = {
  active: boolean;
  renders: Record<string, number>;
  probeTotals: Record<string, number>;
  commits: ProfilerCommit[];
  latencies: number[];
  longTasks: number[];
  speakerEvents: number;
};
declare global {
  interface Window {
    __typingMetrics: TypingMetrics;
    __typingRender: (name: string) => void;
  }
}
const metrics: TypingMetrics = {
  active: false,
  renders: {},
  probeTotals: {},
  commits: [],
  latencies: [],
  longTasks: [],
  speakerEvents: 0,
};
window.__typingMetrics = metrics;
window.__typingRender = (name: string) => {
  metrics.probeTotals[name] = (metrics.probeTotals[name] || 0) + 1;
  if (metrics.active) metrics.renders[name] = (metrics.renders[name] || 0) + 1;
};
const observer = new PerformanceObserver((list) => {
  if (metrics.active) for (const entry of list.getEntries()) metrics.longTasks.push(entry.duration);
});
observer.observe({ type: 'longtask', buffered: false });
const observeInput = (event: Event) => {
  if (
    !(event.target instanceof HTMLTextAreaElement) ||
    event.target.id !== 'voice-message' ||
    !metrics.active
  )
    return;
  const started = performance.now();
  requestAnimationFrame(() => metrics.latencies.push(performance.now() - started));
};
document.addEventListener('input', observeInput, true);
const root = createRoot(document.getElementById('root')!);
window.addEventListener('live-room-fixture-unmount', () => {
  root.unmount();
  observer.disconnect();
  document.removeEventListener('input', observeInput, true);
});
root.render(
  <Profiler
    id="room"
    onRender={(id, phase, actualDuration, baseDuration, startTime, commitTime) => {
      if (metrics.active)
        metrics.commits.push({ id, phase, actualDuration, baseDuration, startTime, commitTime });
    }}
  >
    <VoiceRoomView
      roomId="responsive-fixture"
      user={{ id: 'host', name: 'عبدالعزيز بن سلطان', image: null }}
    />
  </Profiler>,
);
