import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGame } from './use-game';
import { createInitialState } from '@/lib/alfazaa/domain';

describe('Alfazaa persistence boundary', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });
  it('saves guest progress locally and restores it without an account request', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch');
    const view = renderHook(() => useGame(true));
    await waitFor(() => expect(view.result.current.state).not.toBeNull());
    const state = view.result.current.state!;
    expect(localStorage.getItem('alfazaa-demo-v1')).not.toBeNull();
    view.unmount();
    const next = renderHook(() => useGame(true));
    await waitFor(() => expect(next.result.current.state?.nextId).toBe(state.nextId));
    expect(fetcher).not.toHaveBeenCalled();
    next.unmount();
  });
  it('never silently substitutes local progress when the account service fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: 'الحفظ غير متاح' }), { status: 503 }),
    );
    const view = renderHook(() => useGame(false));
    await waitFor(() => expect(view.result.current.error).toBe('الحفظ غير متاح'));
    expect(view.result.current.state).toBeNull();
    expect(localStorage.getItem('alfazaa-demo-v1')).toBeNull();
  });
  it('sends revision and a unique receipt with account commands', async () => {
    const state = createInitialState(Date.now());
    const fetcher = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ success: true, data: { state, revision: state.revision } })),
      );
    const view = renderHook(() => useGame(false));
    await waitFor(() => expect(view.result.current.state).not.toBeNull());
    await act(async () => {
      await view.result.current.send({ type: 'collect' });
    });
    const [, init] = fetcher.mock.calls.find(([, options]) => options?.method === 'POST')!;
    expect(JSON.parse(init!.body as string)).toMatchObject({
      expectedRevision: state.revision,
      command: { type: 'collect' },
      idempotencyKey: expect.any(String),
    });
    expect(localStorage.getItem('alfazaa-demo-v1')).toBeNull();
  });
  it('retries the identical account receipt after a lost response', async () => {
    const state = createInitialState(Date.now());
    const response = () =>
      new Response(JSON.stringify({ success: true, data: { state, revision: state.revision } }));
    const fetcher = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response())
      .mockRejectedValueOnce(new TypeError('network'))
      .mockResolvedValueOnce(response());
    const view = renderHook(() => useGame(false));
    await waitFor(() => expect(view.result.current.state).not.toBeNull());
    await act(async () => {
      await view.result.current.send({ type: 'collect' });
    });
    await act(async () => {
      await view.result.current.retry();
    });
    expect(fetcher.mock.calls[2][1]?.body).toBe(fetcher.mock.calls[1][1]?.body);
  });
  it('serializes refresh with commands so an old read cannot replace a committed revision', async () => {
    const state = createInitialState(Date.now());
    const response = (value: typeof state) =>
      new Response(
        JSON.stringify({ success: true, data: { state: value, revision: value.revision } }),
      );
    let finishRead!: (value: Response) => void;
    const fetcher = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response(state))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishRead = resolve;
          }),
      )
      .mockResolvedValueOnce(response({ ...state, revision: 1 }));
    const view = renderHook(() => useGame(false));
    await waitFor(() => expect(view.result.current.state).not.toBeNull());
    let refresh!: Promise<void>;
    act(() => {
      refresh = view.result.current.reload();
    });
    await act(async () => {
      await view.result.current.send({ type: 'collect' });
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    await act(async () => {
      finishRead(response(state));
      await refresh;
    });
    await act(async () => {
      await view.result.current.send({ type: 'collect' });
    });
    expect(view.result.current.state?.revision).toBe(1);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
