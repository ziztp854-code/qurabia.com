import { createRef, StrictMode, type Ref } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  VoiceRoomView,
  type VoiceRoomHandle,
} from '../../apps/web/src/components/voice/voice-room';
import type { VoiceParticipant, VoiceSnapshot } from '../../apps/web/src/lib/voice/types';
import { emptyPreferences } from '../../apps/web/src/components/voice/voice-client';

const probe = vi.hoisted(() => ({
  stop: vi.fn(),
  push: vi.fn(),
  refresh: undefined as (() => void) | undefined,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: probe.push }) }));
vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} />,
}));
vi.mock('../../apps/web/src/components/voice/audio-session', async () => {
  const { useImperativeHandle } = await import('react');
  return {
    AudioSession: ({
      ref,
      onRoomChanged,
    }: {
      ref: Ref<{ stop: () => void }>;
      onRoomChanged: () => void;
    }) => {
      probe.refresh = onRoomChanged;
      useImperativeHandle(ref, () => ({ stop: probe.stop }));
      return null;
    },
  };
});

const member: VoiceParticipant = {
  id: 'heartbeat-member',
  name: 'عضو اختبار التنظيف',
  image: null,
  role: 'host',
  seatIndex: 0,
  muted: false,
  moderatorMuted: false,
  handRaised: false,
  requestedSeat: null,
  joinedAt: 1,
  lastSeenAt: 1,
};
function snapshot(roomId: string, cursor = 1): VoiceSnapshot {
  return {
    room: {
      id: roomId,
      name: `غرفة ${roomId}`,
      description: '',
      category: 'مجالس',
      cover: '/voice/covers/studio.webp',
      seatCount: 4,
      isPrivate: false,
      allowMicRequests: true,
      chatEnabled: true,
      moderatorsCanManage: true,
      hostId: member.id,
      hostName: member.name,
      hostImage: null,
      createdAt: 1,
      active: true,
      lockedSeats: [],
      participantCount: 1,
      listenerCount: 0,
      speakers: [member],
      passwordRequired: false,
    },
    participants: [member],
    me: member,
    cursor,
    messages: [],
  };
}
function response(value: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => value } as Response;
}
type Read = { signal: AbortSignal; resolve: (value: Response) => void; roomId: string };
let reads: Read[];
let fetcher: ReturnType<typeof vi.fn>;
let leaveMode: 'pending' | 'reject' | 'success';
let leaveSignal: AbortSignal | undefined;
let leaves: number;
let fallbackMode: boolean;
let fallback: Read | undefined;
let refreshPending: boolean;
let refreshRead: Read | undefined;
async function tick(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
function room(ref: Ref<VoiceRoomHandle>, roomId = 'one') {
  return <VoiceRoomView roomId={roomId} user={member} ref={ref} />;
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  reads = [];
  leaves = 0;
  leaveMode = 'pending';
  leaveSignal = undefined;
  fallbackMode = false;
  fallback = undefined;
  refreshPending = false;
  refreshRead = undefined;
  probe.refresh = undefined;
  Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: vi.fn(() => true) });
  fetcher = vi.fn((url: string, init?: RequestInit) => {
    if (url.endsWith('/preferences')) return Promise.resolve(response(emptyPreferences));
    if (url === '/api/community/me')
      return Promise.resolve(
        response({ ok: true, data: { settings: { entranceEnabled: false } } }),
      );
    const roomId = /\/rooms\/([^/?]+)/.exec(url)?.[1] || 'one';
    if (url.endsWith('/leave')) {
      leaves++;
      leaveSignal = init?.signal as AbortSignal;
      if (leaveMode === 'reject')
        return Promise.resolve(response({ error: 'رفض مغادرة اختباري' }, 503));
      if (leaveMode === 'success') return Promise.resolve(response({ ok: true }));
      return new Promise<Response>(() => {});
    }
    if (url.endsWith('/events') && !init?.body) {
      if (fallbackMode) return Promise.resolve(response({ error: 'صلاحية منتهية اختباريًا' }, 403));
      return new Promise<Response>((resolve) => {
        reads.push({ signal: init?.signal as AbortSignal, resolve, roomId });
      });
    }
    if (fallbackMode && reads.length) {
      return new Promise<Response>((resolve) => {
        fallback = { signal: init?.signal as AbortSignal, resolve, roomId };
      });
    }
    if (refreshPending) {
      return new Promise<Response>((resolve) => {
        refreshRead = { signal: init?.signal as AbortSignal, resolve, roomId };
      });
    }
    return Promise.resolve(response(snapshot(roomId)));
  });
  vi.stubGlobal('fetch', fetcher);
});
afterEach(async () => {
  cleanup();
  await tick();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('heartbeat ownership and departure cleanup', () => {
  it('aborts the pending read synchronously while preserving the independent 45-second leave deadline', async () => {
    const ref = createRef<VoiceRoomHandle>();
    const view = render(room(ref));
    await tick();
    await tick(2000);
    expect(reads).toHaveLength(1);
    let departure!: Promise<unknown>;
    act(() => {
      departure = ref.current!.leave().catch((error: unknown) => error);
    });
    expect(probe.stop).toHaveBeenCalledOnce();
    expect(reads[0].signal.aborted).toBe(true);
    expect(leaveSignal?.aborted).toBe(false);
    await tick(10_000);
    expect(reads).toHaveLength(1);
    expect(screen.queryByText('انتهت مهلة الطلب. حاول مرة أخرى.')).toBeNull();
    await tick(34_999);
    expect(leaveSignal?.aborted).toBe(false);
    await tick(1);
    expect(leaveSignal?.aborted).toBe(true);
    expect(await departure).toMatchObject({ code: 'REQUEST_TIMEOUT' });
    view.unmount();
    await tick();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps the explicit retry available after a rejected leave without polling or abort-error banners', async () => {
    leaveMode = 'reject';
    const ref = createRef<VoiceRoomHandle>();
    const view = render(room(ref));
    await tick();
    await tick(2000);
    await act(async () => {
      await expect(ref.current!.leave()).rejects.toThrow('رفض مغادرة اختباري');
    });
    expect(reads[0].signal.aborted).toBe(true);
    expect(screen.getByText('رفض مغادرة اختباري')).toBeInTheDocument();
    await tick(60_000);
    expect(reads).toHaveLength(1);
    expect(screen.queryByText(/operation was aborted/i)).toBeNull();
    leaveMode = 'success';
    await act(async () => ref.current!.leave());
    expect(leaves).toBe(2);
    view.unmount();
    await tick();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('aborts the current read on unmount and releases its deadline without waiting ten seconds', async () => {
    const ref = createRef<VoiceRoomHandle>();
    const view = render(room(ref));
    await tick();
    await tick(2000);
    view.unmount();
    expect(reads[0].signal.aborted).toBe(true);
    await tick();
    expect(vi.getTimerCount()).toBe(0);
    const requests = fetcher.mock.calls.length;
    await tick(60_000);
    expect(fetcher).toHaveBeenCalledTimes(requests);
  });

  it('cancels the old room owner and ignores a late response while the new room continues polling', async () => {
    const ref = createRef<VoiceRoomHandle>();
    const view = render(room(ref));
    await tick();
    await tick(2000);
    const old = reads[0];
    view.rerender(room(ref, 'two'));
    expect(old.signal.aborted).toBe(true);
    await tick();
    expect(screen.getByRole('heading', { name: 'غرفة two' })).toBeInTheDocument();
    await act(async () => old.resolve(response(snapshot('obsolete', 99))));
    expect(screen.queryByRole('heading', { name: 'غرفة obsolete' })).toBeNull();
    await tick(2000);
    expect(reads.at(-1)?.roomId).toBe('two');
    expect(reads.at(-1)?.signal.aborted).toBe(false);
    view.unmount();
    expect(reads.every((read) => read.signal.aborted)).toBe(true);
    await tick();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps a live heartbeat owner after StrictMode replay and cancels it once on final teardown', async () => {
    const ref = createRef<VoiceRoomHandle>();
    const view = render(<StrictMode>{room(ref)}</StrictMode>);
    await tick();
    await tick(2000);
    expect(reads).toHaveLength(1);
    expect(reads[0].signal.aborted).toBe(false);
    await act(async () => reads[0].resolve(response(snapshot('one', 2))));
    await tick(2500);
    expect(reads).toHaveLength(2);
    expect(reads[1].signal.aborted).toBe(false);
    view.unmount();
    expect(reads[1].signal.aborted).toBe(true);
    await tick();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels the heartbeat fallback read when membership denial tears down its owner', async () => {
    const ref = createRef<VoiceRoomHandle>();
    const view = render(room(ref));
    await tick();
    await tick(2000);
    await act(async () => reads[0].resolve(response(snapshot('one', 2))));
    fallbackMode = true;
    await tick(2500);
    expect(fallback).toBeDefined();
    expect(fallback!.signal.aborted).toBe(true);
    expect(screen.getByText('صلاحية منتهية اختباريًا')).toBeInTheDocument();
    view.unmount();
    await tick();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels the related in-flight media-triggered room refresh on departure', async () => {
    const ref = createRef<VoiceRoomHandle>();
    const view = render(room(ref));
    await tick();
    refreshPending = true;
    act(() => probe.refresh!());
    await tick(750);
    expect(refreshRead).toBeDefined();
    leaveMode = 'success';
    await act(async () => ref.current!.leave());
    expect(refreshRead!.signal.aborted).toBe(true);
    view.unmount();
    await tick();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('isolates pending refresh cleanup from a new room refresh scheduled before old abort rejection settles', async () => {
    const ref = createRef<VoiceRoomHandle>();
    const view = render(room(ref));
    await tick();
    refreshPending = true;
    act(() => probe.refresh!());
    await tick(750);
    const old = refreshRead!;
    expect(old.roomId).toBe('one');
    refreshPending = false;
    view.rerender(room(ref, 'two'));
    expect(old.signal.aborted).toBe(true);
    // Schedule the new owner's refresh before the old request's rejection/finally microtasks.
    act(() => probe.refresh!());
    refreshPending = true;
    await tick();
    await tick(750);
    const current = refreshRead!;
    expect(current).not.toBe(old);
    expect(current.roomId).toBe('two');
    expect(current.signal.aborted).toBe(false);
    await act(async () => old.resolve(response(snapshot('obsolete', 99))));
    expect(screen.queryByRole('heading', { name: 'غرفة obsolete' })).toBeNull();
    expect(current.signal.aborted).toBe(false);
    view.unmount();
    expect(current.signal.aborted).toBe(true);
    await tick();
    expect(vi.getTimerCount()).toBe(0);
  });
});
