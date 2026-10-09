import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorld, projectWorld } from '@/lib/kingdoms/engine';
import type { WorldView } from './shared';
import { useKingdoms, type WorldSummary } from './use-kingdoms';

const socket = vi.hoisted(() => ({ handlers: new Map<string, () => void>(), emit: vi.fn(), disconnect: vi.fn() }));
vi.mock('socket.io-client', () => ({
  io: () => ({ on: (name: string, handler: () => void) => socket.handlers.set(name, handler), emit: socket.emit, disconnect: socket.disconnect }),
}));

const now = 1800000000000;
const worlds: WorldSummary[] = [{
  id: 'world-1', name: 'عالم الاختبار', revision: 1, status: 'OPEN',
  createdAt: new Date(now).toISOString(),
}];
const base = projectWorld(createWorld(now), 'player-1', now);
function snapshot(revision: number, serverNow: number): WorldView {
  return { ...base, revision, serverNow, worldId: 'world-1', worldName: 'عالم الاختبار', paused: false };
}
function response(data: unknown) {
  return new Response(JSON.stringify({ success: true, data }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
function deferredResponse() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) =>
    response(url.endsWith('/worlds') ? worlds : snapshot(1, now)),
  ));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Kingdoms snapshot freshness', () => {
  it('refetches on reconnect, online and returning to a visible tab and removes listeners', async () => {
    const { result, unmount } = renderHook(() => useKingdoms());
    await waitFor(() => expect(result.current.view?.revision).toBe(1));
    vi.mocked(fetch).mockResolvedValue(response(snapshot(2, now + 1000)));
    await act(async () => socket.handlers.get('connect')?.());
    expect(result.current.view?.revision).toBe(2);
    expect(socket.emit).toHaveBeenCalledWith('kingdoms:watch', { worldId: 'world-1' });
    vi.mocked(fetch).mockResolvedValue(response(snapshot(3, now + 2000)));
    await act(async () => window.dispatchEvent(new Event('online')));
    expect(result.current.view?.revision).toBe(3);
    vi.mocked(fetch).mockResolvedValue(response(snapshot(4, now + 3000)));
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    expect(result.current.view?.revision).toBe(4);
    unmount();
    const calls = vi.mocked(fetch).mock.calls.length;
    window.dispatchEvent(new Event('online'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(vi.mocked(fetch).mock.calls).toHaveLength(calls);
  });

  it('keeps the newest revision when concurrent refreshes return older state with a later clock', async () => {
    const { result } = renderHook(() => useKingdoms());
    await waitFor(() => expect(result.current.view?.revision).toBe(1));
    const older = deferredResponse();
    const newer = deferredResponse();
    vi.mocked(fetch).mockImplementationOnce(() => older.promise).mockImplementationOnce(() => newer.promise);
    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => {
      first = result.current.refresh();
      second = result.current.refresh();
    });
    await act(async () => {
      newer.resolve(response(snapshot(8, now + 20)));
      await second;
    });
    await act(async () => {
      older.resolve(response(snapshot(7, now + 30)));
      await first;
    });
    expect(result.current.view?.revision).toBe(8);
  });

  it('keeps refreshed state when the initial world request returns an older revision last', async () => {
    const initial = deferredResponse();
    vi.mocked(fetch)
      .mockResolvedValueOnce(response(worlds))
      .mockImplementationOnce(() => initial.promise)
      .mockResolvedValueOnce(response(snapshot(8, now + 20)));
    const { result } = renderHook(() => useKingdoms());
    await waitFor(() => expect(result.current.worldId).toBe('world-1'));
    await act(() => result.current.refresh());
    await act(async () => {
      initial.resolve(response(snapshot(7, now + 30)));
      await initial.promise;
    });
    expect(result.current.view?.revision).toBe(8);
  });

  it.each([
    { revision: 9, time: now + 10, expectedRevision: 9, expectedTime: now + 10 },
    { revision: 8, time: now + 10, expectedRevision: 8, expectedTime: now + 20 },
    { revision: 8, time: now + 30, expectedRevision: 8, expectedTime: now + 30 },
  ])('compares revision $revision before timestamp freshness', async ({ revision, time, expectedRevision, expectedTime }) => {
    const { result } = renderHook(() => useKingdoms());
    await waitFor(() => expect(result.current.view?.revision).toBe(1));
    vi.mocked(fetch).mockResolvedValueOnce(response(snapshot(8, now + 20)));
    await act(() => result.current.refresh());
    vi.mocked(fetch).mockResolvedValueOnce(response(snapshot(revision, time)));
    await act(() => result.current.refresh());
    expect(result.current.view).toMatchObject({ revision: expectedRevision, serverNow: expectedTime });
  });

  it('keeps a command result when polls in the same world deliver older revisions', async () => {
    const { result } = renderHook(() => useKingdoms());
    await waitFor(() => expect(result.current.view?.revision).toBe(1));
    const poll = deferredResponse();
    vi.mocked(fetch)
      .mockImplementationOnce(() => poll.promise)
      .mockResolvedValueOnce(response(snapshot(8, now + 20)));
    let refresh!: Promise<void>;
    act(() => { refresh = result.current.refresh(); });
    await act(() => result.current.send({ type: 'found', name: 'مملكتي' }));
    await act(async () => {
      poll.resolve(response(snapshot(7, now + 30)));
      await refresh;
    });
    vi.mocked(fetch).mockResolvedValueOnce(response(snapshot(7, now + 40)));
    await act(() => result.current.refresh());
    expect(result.current.view).toMatchObject({ revision: 8, serverNow: now + 20 });
  });

  it('keeps current state when a command receipt returns an older revision', async () => {
    const { result } = renderHook(() => useKingdoms());
    await waitFor(() => expect(result.current.view?.revision).toBe(1));
    vi.mocked(fetch).mockResolvedValueOnce(response(snapshot(8, now + 20)));
    await act(() => result.current.refresh());
    vi.mocked(fetch).mockResolvedValueOnce(response(snapshot(7, now + 30)));
    await act(() => result.current.send({ type: 'found', name: 'مملكتي' }));
    expect(result.current.view).toMatchObject({ revision: 8, serverNow: now + 20 });
  });
});

describe('production world selection compatibility', () => {
  it.each(['PAUSED', 'ENDED'])('never requests a requested %s world before validating the directory', async (status) => {
    vi.mocked(fetch).mockResolvedValueOnce(response([{ ...worlds[0], id: 'closed-world', status }, ...worlds]));
    const { result } = renderHook(() => useKingdoms('closed-world'));
    await waitFor(() => expect(result.current.view?.worldId).toBe('world-1'));
    expect(result.current.worlds).toEqual(worlds);
    expect(vi.mocked(fetch).mock.calls.map(([url]) => String(url))).toEqual([
      '/api/kingdoms/worlds', '/api/kingdoms?worldId=world-1',
    ]);
  });
});

describe('accepted command map synchronization', () => {
  it('announces accepted state only after the server responds and prevents a concurrent duplicate', async () => {
    const accepted = vi.fn();
    window.addEventListener('mamluk:command-accepted', accepted);
    try {
      const { result } = renderHook(() => useKingdoms());
      await waitFor(() => expect(result.current.view?.revision).toBe(1));
      const receipt = deferredResponse();
      vi.mocked(fetch).mockImplementationOnce(() => receipt.promise);
      let send!: Promise<void>;
      act(() => { send = result.current.send({ type: 'found', name: 'مملكتي' }); });
      await act(() => result.current.send({ type: 'found', name: 'مملكتي' }));
      expect(vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
      expect(accepted).not.toHaveBeenCalled();
      await act(async () => {
        receipt.resolve(response(snapshot(8, now + 20)));
        await send;
      });
      expect(accepted).toHaveBeenCalledOnce();
      expect((accepted.mock.calls[0][0] as CustomEvent).detail).toEqual({ worldId: 'world-1', revision: 8 });
    } finally {
      window.removeEventListener('mamluk:command-accepted', accepted);
    }
  });

  it('never announces a rejected command or replaces state with an optimistic result', async () => {
    const accepted = vi.fn();
    window.addEventListener('mamluk:command-accepted', accepted);
    try {
      const { result } = renderHook(() => useKingdoms());
      await waitFor(() => expect(result.current.view?.revision).toBe(1));
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ success: false, error: 'قوات غير كافية' }), { status: 409 }));
      await act(() => result.current.send({ type: 'found', name: 'مملكتي' }));
      expect(result.current.error).toBe('قوات غير كافية');
      expect(result.current.view?.revision).toBe(1);
      expect(accepted).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('mamluk:command-accepted', accepted);
    }
  });

  it('ignores a delayed receipt after switching worlds while allowing the new world to load', async () => {
    const accepted = vi.fn();
    window.addEventListener('mamluk:command-accepted', accepted);
    try {
      const { result } = renderHook(() => useKingdoms());
      await waitFor(() => expect(result.current.view?.revision).toBe(1));
      const receipt = deferredResponse();
      vi.mocked(fetch)
        .mockImplementationOnce(() => receipt.promise)
        .mockResolvedValue(response({ ...snapshot(2, now + 10), worldId: 'world-2' }));
      let send!: Promise<void>;
      act(() => { send = result.current.send({ type: 'found', name: 'مملكتي' }); });
      act(() => result.current.setWorldId('world-2'));
      await waitFor(() => expect(result.current.view?.worldId).toBe('world-2'));
      await act(async () => {
        receipt.resolve(response(snapshot(99, now + 20)));
        await send;
      });
      expect(result.current.view).toMatchObject({ worldId: 'world-2', revision: 2 });
      expect(result.current.notice).toBe('');
      expect(accepted).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('mamluk:command-accepted', accepted);
    }
  });
});


describe('revision heartbeat request bounds', () => {
  it('ignores duplicate, old, foreign and malformed invalidations', async () => {
    const { result } = renderHook(() => useKingdoms());
    await waitFor(() => expect(result.current.view?.revision).toBe(1));
    const revision = socket.handlers.get('kingdoms:revision') as unknown as (event: unknown) => void;
    const baseline = vi.mocked(fetch).mock.calls.length;
    act(() => {
      for (let i = 0; i < 60; i++) revision({ worldId: 'world-1', revision: 1 });
      revision({ worldId: 'world-1', revision: 0 });
      revision({ worldId: 'world-2', revision: 99 });
      revision({ worldId: 'world-1', revision: Number.MAX_SAFE_INTEGER + 1 });
      revision({ worldId: 'world-1' });
    });
    expect(vi.mocked(fetch).mock.calls).toHaveLength(baseline);
    const first = deferredResponse();
    vi.mocked(fetch).mockImplementationOnce(() => first.promise).mockResolvedValue(response(snapshot(8, now + 20)));
    act(() => {
      revision({ worldId: 'world-1', revision: 2 });
      for (let i = 3; i <= 8; i++) revision({ worldId: 'world-1', revision: i });
    });
    expect(vi.mocked(fetch).mock.calls).toHaveLength(baseline + 1);
    await act(async () => {
      first.resolve(response(snapshot(2, now + 10)));
      await first.promise;
    });
    await waitFor(() => expect(result.current.view?.revision).toBe(8));
    expect(vi.mocked(fetch).mock.calls).toHaveLength(baseline + 2);
  });
});


it('retries an unresolved remote revision after its first GET was skipped during a local command', async () => {
  const { result } = renderHook(() => useKingdoms());
  await waitFor(() => expect(result.current.view?.revision).toBe(1));
  const revision = socket.handlers.get('kingdoms:revision') as unknown as (event: unknown) => void;
  const receipt = deferredResponse();
  vi.mocked(fetch).mockImplementationOnce(() => receipt.promise).mockResolvedValue(response(snapshot(9, now + 30)));
  let sending!: Promise<void>;
  act(() => { sending = result.current.send({ type: 'found', name: 'Local village' }); });
  await act(async () => revision({ worldId: 'world-1', revision: 9 }));
  await act(async () => { receipt.resolve(response(snapshot(8, now + 20))); await sending; });
  expect(result.current.view?.revision).toBe(8);
  await act(async () => revision({ worldId: 'world-1', revision: 9 }));
  await waitFor(() => expect(result.current.view?.revision).toBe(9));
});

it('retries a failed revision GET on the next heartbeat without starting a tight loop', async () => {
  const { result } = renderHook(() => useKingdoms());
  await waitFor(() => expect(result.current.view?.revision).toBe(1));
  const revision = socket.handlers.get('kingdoms:revision') as unknown as (event: unknown) => void;
  const baseline = vi.mocked(fetch).mock.calls.length;
  vi.mocked(fetch).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(response(snapshot(9, now + 30)));
  await act(async () => revision({ worldId: 'world-1', revision: 9 }));
  expect(vi.mocked(fetch).mock.calls).toHaveLength(baseline + 1);
  expect(result.current.view?.revision).toBe(1);
  await act(async () => revision({ worldId: 'world-1', revision: 9 }));
  await waitFor(() => expect(result.current.view?.revision).toBe(9));
  expect(vi.mocked(fetch).mock.calls).toHaveLength(baseline + 2);
});
