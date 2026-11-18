import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PresenceBeacon } from './presence-beacon';

const fetchHeartbeat = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-18T00:00:00Z'));
  vi.stubGlobal('fetch', fetchHeartbeat.mockReset().mockResolvedValue(new Response()));
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('shares the heartbeat interval across remounts and visibility changes', async () => {
  for (let visit = 0; visit < 21; visit++) {
    const page = render(<PresenceBeacon />);
    document.dispatchEvent(new Event('visibilitychange'));
    page.unmount();
  }

  expect(fetchHeartbeat).toHaveBeenCalledTimes(1);

  vi.resetModules();
  const { PresenceBeacon: ReloadedBeacon } = await import('./presence-beacon');
  render(<ReloadedBeacon />);
  expect(fetchHeartbeat).toHaveBeenCalledTimes(1);

  await vi.advanceTimersByTimeAsync(40_000);
  expect(fetchHeartbeat).toHaveBeenCalledTimes(2);
  expect(fetchHeartbeat.mock.calls[0]?.[1].body).toBe(fetchHeartbeat.mock.calls[1]?.[1].body);
});
