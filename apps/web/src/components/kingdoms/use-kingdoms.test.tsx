import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorld, projectWorld } from '@/lib/kingdoms/engine';
import type { WorldView } from './shared';
import { useKingdoms, type WorldSummary } from './use-kingdoms';

vi.mock('socket.io-client', () => ({
  io: () => ({ on: vi.fn(), emit: vi.fn(), disconnect: vi.fn() }),
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
