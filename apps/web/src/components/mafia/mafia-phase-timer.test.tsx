import { act, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatMafiaCountdown, MafiaPhaseTimer } from './mafia-phase-timer';

const { refresh, router } = vi.hoisted(() => {
  const refresh = vi.fn();
  return { refresh, router: { refresh } };
});

vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

describe('MafiaPhaseTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-25T12:00:00.000Z'));
    refresh.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('formats the countdown with stable Arabic digits', () => {
    expect(formatMafiaCountdown(65)).toBe('01:05');
  });

  it('keeps the server and initial client markup stable when their clocks differ', () => {
    const timer = (
      <MafiaPhaseTimer
        phase="NIGHT"
        phaseEndsAt="2026-07-25T12:00:45.000Z"
        durationSeconds={45}
        autoMode
        tickEndpoint="/api/mafia/game-1/tick"
      />
    );

    vi.setSystemTime(new Date('2026-07-25T12:00:00.000Z'));
    const serverMarkup = renderToString(timer);
    vi.setSystemTime(new Date('2026-07-25T12:00:01.000Z'));
    const clientMarkup = renderToString(timer);

    expect(clientMarkup).toBe(serverMarkup);
  });

  it('counts down and requests the automatic phase transition at zero', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MafiaPhaseTimer
        phase="NIGHT"
        phaseEndsAt="2026-07-25T12:00:02.000Z"
        durationSeconds={45}
        autoMode
        tickEndpoint="/api/mafia/game-1/tick"
        participantId="player-1"
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByTestId('mafia-countdown')).toHaveTextContent('00:02');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    expect(screen.getByTestId('mafia-countdown')).toHaveTextContent('00:00');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/mafia/game-1/tick',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          participantId: 'player-1',
        }),
      }),
    );
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('retries a failed automatic transition once and stops after success', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MafiaPhaseTimer
        phase="DAY"
        phaseEndsAt="2026-07-25T12:00:00.000Z"
        durationSeconds={60}
        autoMode
        tickEndpoint="/api/mafia/game-1/tick"
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([401, 403, 404])('does not retry a permanent %i response', async (status) => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MafiaPhaseTimer
        phase="DAY"
        phaseEndsAt="2026-07-25T12:00:00.000Z"
        durationSeconds={60}
        autoMode
        tickEndpoint="/api/mafia/game-1/tick"
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('uses bounded exponential backoff for retryable transition failures', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MafiaPhaseTimer
        phase="VOTING"
        phaseEndsAt="2026-07-25T12:00:00.000Z"
        durationSeconds={30}
        autoMode
        tickEndpoint="/api/mafia/game-1/tick"
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_999);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('explains when the host controls phases manually', () => {
    render(
      <MafiaPhaseTimer
        phase="DAY"
        phaseEndsAt={null}
        durationSeconds={null}
        autoMode={false}
        tickEndpoint="/api/mafia/game-1/tick"
      />,
    );

    expect(screen.getByText('الانتقال يدوي')).toBeInTheDocument();
  });
});
