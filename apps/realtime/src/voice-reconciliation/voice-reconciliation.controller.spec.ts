import type { Response } from 'express';
import { VoiceReconciliationController } from './voice-reconciliation.controller.js';
import type { VoiceReconciliationWorker } from './voice-reconciliation.worker.js';

describe('voice reconciliation readiness endpoint', () => {
  it.each([
    [
      {
        ready: false,
        state: 'backlog_pending',
        connectivity: 'connected',
      },
      503,
    ],
    [{ ready: true, state: 'ready' }, 200],
    [{ ready: false, state: 'retrying' }, 503],
    [{ ready: false, state: 'misconfigured' }, 503],
  ])('exposes only the worker state with no caching', (state, status) => {
    const worker = {
      getReadiness: () => state,
    } as unknown as VoiceReconciliationWorker;
    const setHeader = jest.fn();
    const setStatus = jest.fn();
    const response = {
      setHeader,
      status: setStatus,
    } as unknown as Response;
    const controller = new VoiceReconciliationController(worker);
    expect(controller.readiness(response)).toEqual(state);
    expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(setStatus).toHaveBeenCalledWith(status);
  });
});
