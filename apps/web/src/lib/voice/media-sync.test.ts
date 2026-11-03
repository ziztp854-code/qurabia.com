import { describe, expect, it, vi } from 'vitest';
import type { VoiceSnapshot } from './types';

const boundary = vi.hoisted(() => ({ process: vi.fn(), reconcile: vi.fn() }));
vi.mock('./media-sync-queue', () => ({ processVoiceMediaJob: boundary.process }));
vi.mock('./livekit', () => ({ reconcileVoiceMedia: boundary.reconcile }));
import { synchronizeVoiceMedia } from './media-sync';

describe('voice synchronization response', () => {
  it('does not clear an older snapshot after a job completes and a newer generation can be queued', async () => {
    boundary.process.mockResolvedValueOnce('completed');
    const snapshot = { mediaSyncPending: true } as VoiceSnapshot;
    expect(await synchronizeVoiceMedia('room', snapshot)).toMatchObject({ mediaSyncPending: true });
  });
});
