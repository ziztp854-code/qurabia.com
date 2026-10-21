import { createRef, useRef } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeFileSync } from 'node:fs';
import {
  AudioSession,
  type VoiceAudioHandle,
} from '../../apps/web/src/components/voice/audio-session';
import {
  VoiceSessionProvider,
  useVoiceSession,
} from '../../apps/web/src/components/voice/voice-session-provider';
import { useRoomViewport } from '../../apps/web/src/components/voice/use-room-viewport';
import { useVoiceOverlay } from '../../apps/web/src/components/voice/use-voice-overlay';
import { emptyPreferences } from '../../apps/web/src/components/voice/voice-client';
import type { VoiceParticipant, VoiceSnapshot } from '../../apps/web/src/lib/voice/types';

type EventHandler = (...args: unknown[]) => void;
type RoomProbe = {
  connected: boolean;
  state: string;
  events: Map<string, Set<EventHandler>>;
  track: { enabled: boolean; stopped: boolean; stop: () => void };
  emit: (name: string, ...args: unknown[]) => void;
  localParticipant: { setMicrophoneEnabled: (enabled: boolean) => Promise<void> };
};
const probe = vi.hoisted(() => ({
  rooms: [] as RoomProbe[],
  pathname: '/voice/acceptance',
  push: vi.fn(),
  activeLocks: 0,
  lockReleases: 0,
  microphoneEnables: 0,
  disconnects: 0,
  stops: 0,
  deferEnable: false,
  finishEnable: undefined as (() => void) | undefined,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => probe.pathname,
  useRouter: () => ({ push: probe.push }),
}));
vi.mock('next/dynamic', async () => {
  const { lazy, Suspense } = await import('react');
  return {
    default: (loader: () => Promise<React.ComponentType>) => {
      const Component = lazy(async () => ({ default: await loader() }));
      return function LazyRoom(props: object) {
        return (
          <Suspense fallback={null}>
            <Component {...props} />
          </Suspense>
        );
      };
    },
  };
});
vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} />,
}));
vi.mock('livekit-client', () => ({
  ConnectionState: { Connected: 'connected' },
  DisconnectReason: { DUPLICATE_IDENTITY: 2 },
  Track: { Kind: { Audio: 'audio' }, Source: { Microphone: 'microphone' } },
  RoomEvent: {
    DataReceived: 'data',
    TrackSubscribed: 'subscribed',
    TrackUnsubscribed: 'unsubscribed',
    ActiveSpeakersChanged: 'speakers',
    AudioPlaybackStatusChanged: 'playback',
    Reconnecting: 'reconnecting',
    Reconnected: 'reconnected',
    Disconnected: 'disconnected',
    MediaDevicesChanged: 'devices',
    ParticipantPermissionsChanged: 'permissions',
    MediaDevicesError: 'deviceerror',
  },
  Room: class {
    state = 'disconnected';
    connected = false;
    canPlaybackAudio = true;
    remoteParticipants = new Map();
    events = new Map<string, Set<EventHandler>>();
    track = {
      enabled: false,
      stopped: false,
      stop: () => {
        this.track.stopped = true;
        probe.stops++;
      },
    };
    localParticipant = {
      permissions: { canSubscribe: true, canPublish: true },
      setMicrophoneEnabled: async (enabled: boolean) => {
        if (enabled) probe.microphoneEnables++;
        if (enabled && probe.deferEnable) {
          await new Promise<void>((resolve) => {
            probe.finishEnable = resolve;
          });
        }
        this.track.enabled = enabled;
      },
      getTrackPublication: () => ({ track: { mediaStreamTrack: this.track } }),
    };
    constructor() {
      probe.rooms.push(this);
    }
    on(name: string, handler: EventHandler) {
      const listeners = this.events.get(name) || new Set<EventHandler>();
      listeners.add(handler);
      this.events.set(name, listeners);
      return this;
    }
    emit(name: string, ...args: unknown[]) {
      this.events.get(name)?.forEach((handler) => handler(...args));
    }
    removeAllListeners() {
      this.events.clear();
    }
    async connect() {
      this.connected = true;
      this.state = 'connected';
    }
    async disconnect() {
      probe.disconnects++;
      this.connected = false;
      this.state = 'disconnected';
    }
    async startAudio() {}
  },
}));

const participant: VoiceParticipant = {
  id: 'lifecycle-member',
  name: 'عضو التحقق',
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
const metrics: Record<string, unknown> = {
  scope:
    'Actual production AudioSession/VoiceSessionProvider/hooks with a probed fake LiveKit SDK and synthetic HTTP; no SFU, real audio or heap proof.',
  cycles: {},
};
let tokenSignals: AbortSignal[];
let requests: string[];
let fetcher: ReturnType<typeof vi.fn>;
let trackedGlobals: Map<string, Set<EventListenerOrEventListenerObject>>;
let pendingFrames: Map<number, FrameRequestCallback>;
let observers: Set<ResizeObserver>;

function roomState(roomId = 'acceptance'): VoiceSnapshot {
  return {
    room: {
      id: roomId,
      name: 'مجلس التحقق',
      description: '',
      category: 'مجالس',
      cover: '/voice/covers/studio.webp',
      seatCount: 4,
      isPrivate: false,
      allowMicRequests: true,
      chatEnabled: true,
      moderatorsCanManage: true,
      hostId: participant.id,
      hostName: participant.name,
      hostImage: null,
      createdAt: 1,
      active: true,
      lockedSeats: [],
      participantCount: 1,
      listenerCount: 0,
      speakers: [participant],
      passwordRequired: false,
    },
    participants: [participant],
    me: participant,
    cursor: 1,
    messages: [],
  };
}
function response(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as Response;
}
async function tick(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
function listenerCount() {
  return probe.rooms.reduce(
    (sum, room) => sum + [...room.events.values()].reduce((n, listeners) => n + listeners.size, 0),
    0,
  );
}
function activeConnections() {
  return probe.rooms.filter((room) => room.connected).length;
}
function expectClean() {
  expect(activeConnections()).toBe(0);
  expect(listenerCount()).toBe(0);
  expect(probe.activeLocks).toBe(0);
  expect(document.querySelectorAll('[data-voice-audio]')).toHaveLength(0);
  expect(localStorage.getItem('tahaddi-voice-session')).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
}
function installListenerProbe(target: Window | Document, prefix: string, types: string[]) {
  const add = target.addEventListener.bind(target);
  const remove = target.removeEventListener.bind(target);
  vi.spyOn(target, 'addEventListener').mockImplementation(((
    name: string,
    listener: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions | boolean,
  ) => {
    if (types.includes(name)) {
      const key = `${prefix}:${name}`;
      const listeners = trackedGlobals.get(key) || new Set<EventListenerOrEventListenerObject>();
      listeners.add(listener);
      trackedGlobals.set(key, listeners);
    }
    add(name, listener, options);
  }) as typeof target.addEventListener);
  vi.spyOn(target, 'removeEventListener').mockImplementation(((
    name: string,
    listener: EventListenerOrEventListenerObject,
    options?: EventListenerOptions | boolean,
  ) => {
    trackedGlobals.get(`${prefix}:${name}`)?.delete(listener);
    remove(name, listener, options);
  }) as typeof target.removeEventListener);
}

beforeEach(async () => {
  vi.clearAllMocks();
  probe.rooms.length = 0;
  probe.activeLocks = 0;
  probe.lockReleases = 0;
  probe.microphoneEnables = 0;
  probe.disconnects = 0;
  probe.stops = 0;
  probe.deferEnable = false;
  probe.finishEnable = undefined;
  probe.pathname = '/voice/acceptance';
  tokenSignals = [];
  requests = [];
  trackedGlobals = new Map();
  pendingFrames = new Map();
  observers = new Set();
  localStorage.clear();
  vi.stubGlobal('isSecureContext', true);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { enumerateDevices: vi.fn().mockResolvedValue([]) },
  });
  Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: vi.fn(() => true) });
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: async (_name: string, _options: object, work: (lock: object) => Promise<void>) => {
        probe.activeLocks++;
        try {
          await work({ name: 'lifecycle-test' });
        } finally {
          probe.activeLocks--;
          probe.lockReleases++;
        }
      },
    },
  });
  fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    requests.push(url);
    if (url.endsWith('/token')) {
      tokenSignals.push(init!.signal as AbortSignal);
      return response({ token: 'synthetic-test-only', url: 'ws://127.0.0.1:17880' });
    }
    if (url.endsWith('/preferences')) return response(emptyPreferences);
    if (url === '/api/community/me')
      return response({ ok: true, data: { settings: { entranceEnabled: false } } });
    const roomId = /\/rooms\/([^/?]+)/.exec(url)?.[1] || 'acceptance';
    return response(roomState(roomId));
  });
  vi.stubGlobal('fetch', fetcher);
  installListenerProbe(window, 'window', ['pagehide', 'resize']);
  installListenerProbe(document, 'document', ['visibilitychange', 'keydown', 'focusin']);
  // Resolve the production lazy import before fake timers control the workload.
  await import('../../apps/web/src/components/voice/voice-room');
  vi.useFakeTimers();
});
afterEach(async () => {
  cleanup();
  await tick();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
afterAll(() => {
  writeFileSync(process.env.VOICE_LIFECYCLE_EVIDENCE!, JSON.stringify(metrics, null, 2));
});

describe('bounded production voice lifecycle stress (synthetic media boundary)', () => {
  it('returns connections, listeners, tracks and remote audio to baseline through 60 stop/reconnect cycles', async () => {
    const cycles = 60;
    let reconnected = 0;
    for (let index = 0; index < cycles; index++) {
      const ref = createRef<VoiceAudioHandle>();
      const view = render(
        <AudioSession
          ref={ref}
          roomId={`audio-${index}`}
          participant={participant}
          muted={false}
        />,
      );
      await tick();
      let room = probe.rooms.at(-1)!;
      expect(room.connected).toBe(true);
      expect(room.track.enabled).toBe(true);
      expect(activeConnections()).toBe(1);
      const remoteAudio = document.createElement('audio');
      const remote = { kind: 'audio', attach: () => remoteAudio, detach: () => [remoteAudio] };
      act(() => room.emit('subscribed', remote, {}, { identity: `remote-${index}` }));
      expect(document.querySelectorAll('[data-voice-audio]')).toHaveLength(1);
      if (index % 10 === 0) {
        act(() => room.emit('disconnected', 0));
        await tick(1000);
        expect(room.connected).toBe(false);
        expect(room.events.size).toBe(0);
        room = probe.rooms.at(-1)!;
        expect(activeConnections()).toBe(1);
        reconnected++;
      } else {
        // A queued recovery must be canceled by explicit local departure.
        act(() => room.emit('disconnected', 0));
      }
      act(() => ref.current!.stop());
      expect(room.track.enabled).toBe(false);
      expect(room.track.stopped).toBe(true);
      expect(activeConnections()).toBe(0);
      expect(listenerCount()).toBe(0);
      expect(document.querySelectorAll('[data-voice-audio]')).toHaveLength(0);
      const connections = probe.rooms.length;
      act(() => {
        room.emit('disconnected', 0);
        ref.current!.retry();
      });
      view.unmount();
      await tick(60_000);
      expect(probe.rooms).toHaveLength(connections);
      expect(tokenSignals.every((signal) => signal.aborted)).toBe(true);
      expectClean();
      expect([...trackedGlobals.values()].every((listeners) => listeners.size === 0)).toBe(true);
    }
    expect(probe.stops).toBe(probe.rooms.length);
    metrics.audioCycles = {
      cycles,
      successfulReconnects: reconnected,
      createdConnections: probe.rooms.length,
      disconnects: probe.disconnects,
      stoppedTracks: probe.stops,
      postCycleActiveConnections: activeConnections(),
      postCycleSdkListeners: listenerCount(),
      pendingTimers: vi.getTimerCount(),
      remoteAudioElements: document.querySelectorAll('[data-voice-audio]').length,
    };
  });

  it('cancels 30 pending token requests and ignores every late completion after stop', async () => {
    for (let index = 0; index < 30; index++) {
      let complete!: (response: Response) => void;
      fetcher.mockImplementationOnce((_url: string, init: RequestInit) => {
        tokenSignals.push(init.signal as AbortSignal);
        return new Promise<Response>((resolve) => {
          complete = resolve;
        });
      });
      const ref = createRef<VoiceAudioHandle>();
      const view = render(
        <AudioSession
          ref={ref}
          roomId={`pending-${index}`}
          participant={participant}
          muted={false}
        />,
      );
      await tick();
      expect(probe.rooms).toHaveLength(0);
      act(() => ref.current!.stop());
      expect(tokenSignals.at(-1)!.aborted).toBe(true);
      await act(async () => {
        complete(response({ token: 'late', url: 'ws://127.0.0.1:17880' }));
      });
      view.unmount();
      await tick(60_000);
      expect(probe.rooms).toHaveLength(0);
      expect(probe.microphoneEnables).toBe(0);
      expectClean();
    }
    metrics.pendingTokenCycles = {
      cycles: 30,
      aborted: tokenSignals.filter((signal) => signal.aborted).length,
      createdConnections: probe.rooms.length,
      pendingTimers: vi.getTimerCount(),
    };
  });

  it('clears 30 permission-retry timers and prevents a later token or reconnect after leave', async () => {
    fetcher.mockImplementation(async (_url: string, init: RequestInit) => {
      tokenSignals.push(init.signal as AbortSignal);
      return response({ code: 'MEDIA_RETRY', error: 'refreshing' }, 409);
    });
    for (let index = 0; index < 30; index++) {
      const ref = createRef<VoiceAudioHandle>();
      const view = render(
        <AudioSession ref={ref} roomId={`retry-${index}`} participant={participant} />,
      );
      await tick();
      expect(vi.getTimerCount()).toBe(1);
      act(() => ref.current!.stop());
      view.unmount();
      await tick(60_000);
      expect(fetcher).toHaveBeenCalledTimes(index + 1);
      expectClean();
    }
    metrics.permissionRetryCycles = {
      cycles: 30,
      requests: fetcher.mock.calls.length,
      createdConnections: probe.rooms.length,
      pendingTimers: vi.getTimerCount(),
    };
  });

  it('returns the fallback storage lease and renewal interval to baseline across 20 cycles', async () => {
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
    for (let index = 0; index < 20; index++) {
      const ref = createRef<VoiceAudioHandle>();
      const view = render(
        <AudioSession
          ref={ref}
          roomId={`lease-${index}`}
          participant={participant}
          muted={false}
        />,
      );
      await tick(80);
      expect(activeConnections()).toBe(1);
      expect(localStorage.getItem('tahaddi-voice-session')).not.toBeNull();
      await tick(3000);
      act(() => ref.current!.stop());
      view.unmount();
      await tick(60_000);
      expectClean();
    }
    metrics.storageLeaseCycles = {
      cycles: 20,
      stoppedTracks: probe.stops,
      remainingLease: localStorage.getItem('tahaddi-voice-session'),
      pendingTimers: vi.getTimerCount(),
    };
  });

  it('keeps microphone tracks stopped when asynchronous device enable completes after departure', async () => {
    probe.deferEnable = true;
    const ref = createRef<VoiceAudioHandle>();
    const view = render(
      <AudioSession ref={ref} roomId="late-device" participant={participant} muted={false} />,
    );
    await tick();
    expect(probe.microphoneEnables).toBe(1);
    const room = probe.rooms[0];
    act(() => ref.current!.stop());
    expect(room.track.enabled).toBe(false);
    expect(room.track.stopped).toBe(true);
    await act(async () => probe.finishEnable!());
    expect(room.track.enabled).toBe(false);
    view.unmount();
    await tick(60_000);
    expectClean();
    metrics.lateDeviceCompletion = {
      trackEnabled: room.track.enabled,
      stopped: room.track.stopped,
      activeConnections: activeConnections(),
      pendingTimers: vi.getTimerCount(),
    };
  });
});

function Entry({ roomId }: { roomId: string }) {
  const session = useVoiceSession();
  return <button onClick={() => session!.open(roomId, participant)}>بدء دورة</button>;
}
function ProviderFixture({ roomId }: { roomId: string }) {
  return (
    <VoiceSessionProvider>
      <Entry roomId={roomId} />
    </VoiceSessionProvider>
  );
}

it('repeats 20 real provider open/game/leave cycles without retained polling, page listeners or connections', async () => {
  for (let index = 0; index < 20; index++) {
    const roomId = `provider-${index}`;
    probe.pathname = `/voice/${roomId}`;
    const view = render(<ProviderFixture roomId={roomId} />);
    fireEvent.click(screen.getByRole('button', { name: 'بدء دورة' }));
    await tick();
    await tick();
    expect(activeConnections()).toBe(1);
    const room = probe.rooms.at(-1)!;
    expect(room.track.enabled).toBe(true);
    probe.pathname = '/games/chess';
    view.rerender(<ProviderFixture roomId={roomId} />);
    await tick();
    expect(activeConnections()).toBe(1);
    expect(room.track.enabled).toBe(true);
    // Server refresh schedules a debounce; leaving must not retain that timer.
    act(() =>
      room.emit(
        'data',
        new TextEncoder().encode(JSON.stringify({ roomId, cursor: 2 })),
        undefined,
        0,
        'tahaddi-voice-refresh-v1',
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'مغادرة الصوت' }));
    expect(room.track.enabled).toBe(false);
    expect(room.track.stopped).toBe(true);
    expect(activeConnections()).toBe(0);
    await tick();
    view.unmount();
    await tick();
    const completedRequests = requests.length;
    await tick(60_000);
    expect(requests).toHaveLength(completedRequests);
    expectClean();
    expect([...trackedGlobals.values()].every((listeners) => listeners.size === 0)).toBe(true);
  }
  metrics.providerCycles = {
    cycles: 20,
    connections: probe.rooms.length,
    stoppedTracks: probe.stops,
    postCycleSdkListeners: listenerCount(),
    postCycleGlobalListeners: [...trackedGlobals.values()].reduce(
      (sum, listeners) => sum + listeners.size,
      0,
    ),
    pendingTimers: vi.getTimerCount(),
    activeLocks: probe.activeLocks,
  };
});

it('cancels an in-flight heartbeat after departure without retaining media or restarting polling', async () => {
  const view = render(<ProviderFixture roomId="pending-heartbeat" />);
  fireEvent.click(screen.getByRole('button', { name: 'بدء دورة' }));
  await tick();
  await tick();
  expect(activeConnections()).toBe(1);
  const room = probe.rooms[0];
  const original = fetcher.getMockImplementation()!;
  let heartbeatSignal: AbortSignal | undefined;
  fetcher.mockImplementation((url: string, init?: RequestInit) => {
    if (url.endsWith('/events') && !init?.body) {
      requests.push(url);
      heartbeatSignal = init!.signal as AbortSignal;
      return new Promise<Response>(() => {});
    }
    return original(url, init);
  });
  await tick(2000);
  expect(heartbeatSignal).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: 'مغادرة الصوت' }));
  expect(room.track.enabled).toBe(false);
  expect(room.track.stopped).toBe(true);
  expect(activeConnections()).toBe(0);
  expect(heartbeatSignal!.aborted).toBe(true);
  await tick();
  view.unmount();
  await tick();
  const requestCount = requests.length;
  expect(vi.getTimerCount()).toBe(0);
  await tick(60_000);
  expect(requests).toHaveLength(requestCount);
  expectClean();
  metrics.inFlightHeartbeat = {
    mediaStoppedSynchronously: true,
    readAbortedImmediately: true,
    remainingReadDeadlineMs: 0,
    pollingRestarted: requests.length !== requestCount,
    postDeadlineTimers: vi.getTimerCount(),
    postDeadlineConnections: activeConnections(),
  };
});

function HookFixture() {
  const surface = useRef<HTMLDivElement>(null);
  const controls = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useRoomViewport(surface, controls, true);
  useVoiceOverlay(true, panel, () => {});
  return (
    <div ref={surface}>
      <main className="v-main">
        <header>المجلس</header>
        <div ref={controls}>أدوات</div>
        <div ref={panel} tabIndex={-1}>
          <button>إرسال</button>
        </div>
      </main>
    </div>
  );
}
it('cleans viewport observers, RAF and overlay focus/scroll listeners across 30 unmounts', async () => {
  let frameId = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    pendingFrames.set(++frameId, callback);
    return frameId;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => pendingFrames.delete(id));
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor() {
        observers.add(this as unknown as ResizeObserver);
      }
      observe() {}
      disconnect() {
        observers.delete(this as unknown as ResizeObserver);
      }
    },
  );
  const viewport = Object.assign(new EventTarget(), { height: 800, offsetTop: 0 });
  vi.stubGlobal('visualViewport', viewport);
  const addViewport = vi.spyOn(viewport, 'addEventListener');
  const removeViewport = vi.spyOn(viewport, 'removeEventListener');
  for (let index = 0; index < 30; index++) {
    const overflow = document.body.style.overflow;
    const view = render(<HookFixture />);
    expect(document.body.style.overflow).toBe('hidden');
    act(() => {
      viewport.dispatchEvent(new Event('resize'));
      viewport.dispatchEvent(new Event('scroll'));
    });
    expect(pendingFrames.size).toBeGreaterThan(0);
    view.unmount();
    await tick();
    expect(document.body.style.overflow).toBe(overflow);
    expect(pendingFrames.size).toBe(0);
    expect(observers.size).toBe(0);
    expect(addViewport.mock.calls.length).toBe(removeViewport.mock.calls.length);
    expect([...trackedGlobals.values()].every((listeners) => listeners.size === 0)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  }
  metrics.viewportOverlayCycles = {
    cycles: 30,
    pendingFrames: pendingFrames.size,
    observers: observers.size,
    viewportAdds: addViewport.mock.calls.length,
    viewportRemovals: removeViewport.mock.calls.length,
    remainingGlobalListeners: [...trackedGlobals.values()].reduce(
      (sum, listeners) => sum + listeners.size,
      0,
    ),
    pendingTimers: vi.getTimerCount(),
  };
});
