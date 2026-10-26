import { createRef } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioSession, type VoiceAudioHandle } from './audio-session';
import type { VoiceParticipant } from '@/lib/voice/types';
const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  mic: vi.fn(),
  startAudio: vi.fn(),
  canPlaybackAudio: true,
  permissions: { canSubscribe: true, canPublish: true },
  lock: vi.fn(),
  track: { enabled: true, stop: vi.fn() },
  events: new Map<string, (...args: unknown[]) => void>(),
}));
vi.mock('livekit-client', () => ({
  ConnectionState: { Connected: 'connected' },
  DisconnectReason: { DUPLICATE_IDENTITY: 2, PARTICIPANT_REMOVED: 4 },
  Track: { Kind: { Audio: 'audio' }, Source: { Microphone: 'microphone' } },
  TrackEvent: {
    AudioPlaybackStarted: 'audioPlaybackStarted',
    AudioPlaybackFailed: 'audioPlaybackFailed',
  },
  RoomEvent: {
    DataReceived: 'data',
    ParticipantPermissionsChanged: 'permissions',
    TrackSubscribed: 'subscribed',
    TrackUnsubscribed: 'unsubscribed',
    ActiveSpeakersChanged: 'speakers',
    AudioPlaybackStatusChanged: 'playback',
    Reconnecting: 'reconnecting',
    Reconnected: 'reconnected',
    Disconnected: 'disconnected',
    MediaDevicesChanged: 'devices',
    MediaDevicesError: 'deviceerror',
  },
  Room: class {
    state = 'connected';
    remoteParticipants = new Map();
    get canPlaybackAudio() {
      return mocks.canPlaybackAudio;
    }
    localParticipant = {
      get permissions() {
        return mocks.permissions;
      },
      setMicrophoneEnabled: mocks.mic,
      getTrackPublication: () => ({ track: { mediaStreamTrack: mocks.track } }),
    };
    connect = mocks.connect;
    disconnect = mocks.disconnect;
    startAudio = mocks.startAudio;
    on(event: string, cb: (...args: unknown[]) => void) {
      mocks.events.set(event, cb);
      return this;
    }
    removeAllListeners() {
      mocks.events.clear();
      mocks.canPlaybackAudio = true;
    }
  },
}));
const participant: VoiceParticipant = {
  id: 'test-user',
  name: 'عضو',
  image: null,
  role: 'speaker',
  seatIndex: 0,
  muted: false,
  moderatorMuted: false,
  handRaised: false,
  requestedSeat: null,
  joinedAt: 1,
  lastSeenAt: 1,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.events.clear();
  mocks.canPlaybackAudio = true;
  mocks.permissions = { canSubscribe: true, canPublish: true };
  mocks.track.enabled = true;
  vi.stubGlobal('isSecureContext', true);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { enumerateDevices: vi.fn().mockResolvedValue([]) },
  });
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: mocks.lock.mockImplementation((_name, _options, work) => work({ name: 'test' })),
    },
  });
  mocks.connect.mockResolvedValue(undefined);
  mocks.disconnect.mockResolvedValue(undefined);
  mocks.mic.mockResolvedValue(undefined);
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'ephemeral', url: 'ws://127.0.0.1:7880' }),
    }),
  );
});

it('stops capture and disconnects immediately on explicit local stop without restarting', async () => {
  const ref = createRef<VoiceAudioHandle>();
  const view = render(<AudioSession ref={ref} roomId="room" participant={participant} muted={false} />);
  await screen.findByText('متصل بالصوت');
  await waitFor(() => expect(mocks.mic).toHaveBeenCalledWith(true, expect.anything()));
  act(() => ref.current!.stop());
  expect(mocks.track.enabled).toBe(false);
  expect(mocks.track.stop).toHaveBeenCalledTimes(1);
  expect(mocks.disconnect).toHaveBeenCalledWith(true);
  expect(screen.getByText('الصوت غير متصل')).toBeInTheDocument();
  act(() => ref.current!.retry());
  await act(async () => {});
  expect(mocks.connect).toHaveBeenCalledTimes(1);
  view.unmount();
  expect(mocks.disconnect).toHaveBeenCalledTimes(1);
});

it('disconnects a connection that completes after explicit local stop without enabling capture', async () => {
  let finishConnect!: () => void;
  mocks.connect.mockImplementation(() => new Promise<void>((resolve) => { finishConnect = resolve; }));
  const ref = createRef<VoiceAudioHandle>();
  render(<AudioSession ref={ref} roomId="room" participant={participant} muted={false} />);
  await waitFor(() => expect(mocks.connect).toHaveBeenCalledTimes(1));
  act(() => ref.current!.stop());
  expect(mocks.disconnect).toHaveBeenCalledWith(true);
  await act(async () => { finishConnect(); });
  expect(mocks.disconnect).toHaveBeenCalledTimes(2);
  expect(mocks.mic).not.toHaveBeenCalledWith(true, expect.anything());
  expect(screen.getByText('الصوت غير متصل')).toBeInTheDocument();
  act(() => ref.current!.retry());
  await act(async () => {});
  expect(mocks.connect).toHaveBeenCalledTimes(1);
});

it('disables a late microphone enable completion after explicit local stop', async () => {
  let finishEnable!: () => void;
  mocks.mic.mockImplementation((enabled: boolean) => {
    if (!enabled) {
      mocks.track.enabled = false;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      finishEnable = () => {
        mocks.track.enabled = true;
        resolve();
      };
    });
  });
  const ref = createRef<VoiceAudioHandle>();
  render(<AudioSession ref={ref} roomId="room" participant={participant} muted={false} />);
  await waitFor(() => expect(mocks.mic).toHaveBeenCalledWith(true, expect.anything()));
  act(() => ref.current!.stop());
  expect(mocks.track.enabled).toBe(false);
  expect(mocks.track.stop).toHaveBeenCalledTimes(1);
  await act(async () => { finishEnable(); });
  expect(mocks.mic).toHaveBeenLastCalledWith(false);
  expect(mocks.track.enabled).toBe(false);
  expect(screen.getByText('الصوت غير متصل')).toBeInTheDocument();
  expect(mocks.connect).toHaveBeenCalledTimes(1);
});
describe('audio session lifecycle', () => {
  it('inspects the current transport without reconnecting or changing the microphone', async () => {
    render(<AudioSession roomId="room" participant={participant} muted />);
    await screen.findByText('متصل بالصوت');
    await waitFor(() => expect(mocks.mic).toHaveBeenCalledWith(false, expect.any(Object)));
    const microphoneCalls = mocks.mic.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'فحص اتصال الغرفة' }));
    expect(await screen.findByText('اتصال الصوت قائم الآن.')).toBeInTheDocument();
    expect(mocks.connect).toHaveBeenCalledTimes(1);
    expect(mocks.disconnect).not.toHaveBeenCalled();
    expect(mocks.mic).toHaveBeenCalledTimes(microphoneCalls);
  });
  it('shows setup-needed and never connects to a fake audio service', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      json: async () => ({ code: 'MEDIA_SETUP_REQUIRED', error: 'خدمة الصوت غير مهيأة' }),
    } as Response);
    render(<AudioSession roomId="room" participant={participant} />);
    expect(await screen.findByText('الصوت يحتاج إعداد الخدمة')).toBeInTheDocument();
    expect(mocks.connect).not.toHaveBeenCalled();
  });
  it('prevents a second tab from opening another microphone session', async () => {
    mocks.lock.mockImplementation((_name, _options, work) => work(null));
    render(<AudioSession roomId="room" participant={participant} />);
    expect(await screen.findByText('الصوت مفتوح في علامة تبويب أخرى')).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('propagates real active speakers, mutes on request and disconnects on unmount', async () => {
    const onSpeakersChange = vi.fn();
    const view = render(
      <AudioSession
        roomId="room"
        participant={participant}
        muted={false}
        onSpeakersChange={onSpeakersChange}
      />,
    );
    await screen.findByText('متصل بالصوت');
    await waitFor(() =>
      expect(mocks.mic).toHaveBeenCalledWith(
        true,
        expect.objectContaining({ echoCancellation: true, noiseSuppression: true }),
      ),
    );
    act(() => mocks.events.get('speakers')?.([{ identity: 'actual-speaker' }]));
    expect(onSpeakersChange).toHaveBeenLastCalledWith(['actual-speaker']);
    view.rerender(
      <AudioSession
        roomId="room"
        participant={participant}
        muted
        onSpeakersChange={onSpeakersChange}
      />,
    );
    await waitFor(() => expect(mocks.mic).toHaveBeenCalledWith(false, expect.anything()));
    view.unmount();
    expect(mocks.disconnect).toHaveBeenCalledWith(true);
    expect(onSpeakersChange).toHaveBeenLastCalledWith([]);
  });
  it('never requests microphone capture for a listener', async () => {
    render(
      <AudioSession
        roomId="room"
        participant={{ ...participant, role: 'listener', seatIndex: null }}
        muted={false}
      />,
    );
    await screen.findByText('متصل بالصوت');
    await waitFor(() => expect(mocks.mic).toHaveBeenCalledWith(false, expect.anything()));
    expect(mocks.mic).not.toHaveBeenCalledWith(true, expect.anything());
  });
});

it('cuts microphone capture immediately when muting, before queued SDK work completes', async () => {
  mocks.track.enabled = true;
  const view = render(<AudioSession roomId="room" participant={participant} muted={false} />);
  await waitFor(() => expect(mocks.mic).toHaveBeenCalledWith(true, expect.anything()));
  mocks.mic.mockImplementation(() => new Promise(() => {}));
  view.rerender(<AudioSession roomId="room" participant={participant} muted />);
  expect(mocks.track.enabled).toBe(false);
});
it('accepts invalidation only from server data for the current room', async () => {
  const changed = vi.fn();
  render(<AudioSession roomId="room" participant={participant} onRoomChanged={changed} />);
  await screen.findByText('متصل بالصوت');
  const packet = (roomId: string) =>
    new TextEncoder().encode(JSON.stringify({ roomId, cursor: 10 }));
  act(() => {
    mocks.events.get('data')?.(
      packet('room'),
      { identity: 'untrusted' },
      0,
      'tahaddi-voice-refresh-v1',
    );
    mocks.events.get('data')?.(packet('other'), undefined, 0, 'tahaddi-voice-refresh-v1');
    mocks.events.get('data')?.(packet('room'), undefined, 0, 'other');
  });
  expect(changed).not.toHaveBeenCalled();
  act(() => {
    mocks.events.get('data')?.(packet('room'), undefined, 0, 'tahaddi-voice-refresh-v1');
  });
  expect(changed).toHaveBeenCalledTimes(1);
});

afterEach(() => vi.useRealTimers());
it('restores the SFU connection with a new token after listener promotion and Cloud revocation', async () => {
  const listener = { ...participant, role: 'listener' as const, seatIndex: null };
  const view = render(<AudioSession roomId="room" participant={listener} muted />);
  await screen.findByText('متصل بالصوت');
  vi.mocked(fetch).mockResolvedValueOnce({
    ok: false,
    status: 409,
    json: async () => ({ code: 'MEDIA_RETRY', error: 'updating' }),
  } as Response);
  vi.useFakeTimers();
  view.rerender(<AudioSession roomId="room" participant={participant} muted={false} />);
  act(() => mocks.events.get('disconnected')?.(4));
  expect(screen.getByText('جارٍ إعادة الاتصال…')).toBeInTheDocument();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(fetch).toHaveBeenCalledTimes(2);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(mocks.connect).toHaveBeenCalledTimes(2);
  expect(screen.getByText('متصل بالصوت')).toBeInTheDocument();
  expect(mocks.mic).toHaveBeenLastCalledWith(true, expect.anything());
});
it('does not reconnect a removed member when the fresh token request is forbidden', async () => {
  render(<AudioSession roomId="room" participant={participant} />);
  await screen.findByText('متصل بالصوت');
  vi.mocked(fetch).mockResolvedValue({
    ok: false,
    status: 403,
    json: async () => ({ error: 'انتهت عضويتك' }),
  } as Response);
  vi.useFakeTimers();
  act(() => mocks.events.get('disconnected')?.(4));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(20_000);
  });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(mocks.connect).toHaveBeenCalledTimes(1);
  expect(screen.getByText('انتهت عضويتك')).toBeInTheDocument();
});
it('never fights a duplicate identity or leaves a reconnect timer after unmount', async () => {
  const view = render(<AudioSession roomId="room" participant={participant} />);
  await screen.findByText('متصل بالصوت');
  vi.useFakeTimers();
  act(() => mocks.events.get('disconnected')?.(2));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000);
  });
  expect(screen.getByText('الصوت مفتوح في علامة تبويب أخرى')).toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(1);
  act(() => mocks.events.get('disconnected')?.(4));
  view.unmount();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000);
  });
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('delivers live chat only from the server and never from a peer data publisher', async () => {
  const received = vi.fn();
  render(<AudioSession roomId="room" participant={participant} onRoomMessage={received} />);
  await screen.findByText('متصل بالصوت');
  const packet = {
    roomId: 'room',
    cursor: 12,
    message: {
      id: 'msg',
      userId: 'sender',
      name: 'عضو',
      image: null,
      text: 'أهلًا',
      createdAt: 1,
      replyTo: null,
      pinned: false,
      reactions: {},
    },
  };
  const bytes = new TextEncoder().encode(JSON.stringify(packet));
  act(() => mocks.events.get('data')?.(bytes, { identity: 'peer' }, 0, 'tahaddi-voice-message-v1'));
  expect(received).not.toHaveBeenCalled();
  act(() => mocks.events.get('data')?.(bytes, undefined, 0, 'tahaddi-voice-message-v1'));
  expect(received).toHaveBeenCalledWith(packet);
});

it('stops automatic reconnects after a bounded number of transport failures', async () => {
  mocks.connect.mockRejectedValue(new Error('transport'));
  vi.useFakeTimers();
  render(<AudioSession roomId="room" participant={participant} />);
  await act(async () => {});
  for (const delay of [1000, 2000, 4000, 8000])
    await act(async () => {
      await vi.advanceTimersByTimeAsync(delay);
    });
  expect(mocks.connect).toHaveBeenCalledTimes(5);
  expect(screen.getByText('تعذّر الاتصال بالصوت')).toBeInTheDocument();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30_000);
  });
  expect(mocks.connect).toHaveBeenCalledTimes(5);
});
it('exposes a user-gesture playback action when the browser blocks remote audio', async () => {
  mocks.canPlaybackAudio = false;
  mocks.startAudio.mockImplementation(async () => {
    mocks.canPlaybackAudio = true;
  });
  const ref = createRef<VoiceAudioHandle>();
  const blocked = vi.fn();
  render(
    <AudioSession
      ref={ref}
      roomId="room"
      participant={participant}
      onPlaybackBlockedChange={blocked}
    />,
  );
  await screen.findByText('متصل بالصوت');
  expect(blocked).toHaveBeenLastCalledWith(true);
  await act(async () => {
    await ref.current?.startAudio();
  });
  expect(mocks.startAudio).toHaveBeenCalledTimes(1);
  expect(blocked).toHaveBeenLastCalledWith(false);
});

it('attaches a newly subscribed speaker after the listener is already connected without reconnecting', async () => {
  const listener = { ...participant, role: 'listener' as const, seatIndex: null };
  const view = render(<AudioSession roomId="room" participant={listener} volume={0.4} />);
  await screen.findByText('متصل بالصوت');

  const audio = document.createElement('audio');
  const remoteTrack = {
    kind: 'audio',
    attach: vi.fn(() => audio),
    detach: vi.fn(() => [audio]),
    on: vi.fn(),
    off: vi.fn(),
  };
  act(() => {
    mocks.events.get('subscribed')?.(remoteTrack, {}, { identity: 'late-speaker' });
  });

  expect(document.querySelector('audio[data-voice-audio="late-speaker"]')).toBe(audio);
  expect(audio.autoplay).toBe(true);
  expect(audio.muted).toBe(false);
  expect(audio.volume).toBe(0.4);
  expect(mocks.connect).toHaveBeenCalledTimes(1);
  expect(mocks.disconnect).not.toHaveBeenCalled();

  view.rerender(
    <AudioSession roomId="room" participant={listener} volume={0.4} mutedUserIds={['late-speaker']} />,
  );
  expect(audio.muted).toBe(true);

  act(() => mocks.events.get('unsubscribed')?.(remoteTrack));
  expect(audio).not.toBeInTheDocument();
  expect(mocks.connect).toHaveBeenCalledTimes(1);
});

it.each(['membership-first', 'grant-first'] as const)(
  'starts a promoted speaker without reconnecting when %s arrives',
  async (order) => {
    const listener = { ...participant, role: 'listener' as const, seatIndex: null };
    mocks.permissions = { canSubscribe: true, canPublish: false };
    const view = render(<AudioSession roomId="room" participant={listener} muted={false} />);
    await screen.findByText('متصل بالصوت');
    await waitFor(() => expect(mocks.track.enabled).toBe(false));

    const grantPublishing = () => {
      const previous = mocks.permissions;
      mocks.permissions = { canSubscribe: true, canPublish: true };
      act(() => mocks.events.get('permissions')?.(previous, { identity: participant.id }));
    };
    const promoteMembership = () => {
      view.rerender(<AudioSession roomId="room" participant={participant} muted={false} />);
    };
    if (order === 'membership-first') {
      promoteMembership();
      await act(async () => {});
      expect(mocks.track.enabled).toBe(false);
      grantPublishing();
    } else {
      grantPublishing();
      await act(async () => {});
      expect(mocks.track.enabled).toBe(false);
      promoteMembership();
    }

    await waitFor(() => expect(mocks.track.enabled).toBe(true));
    expect(mocks.mic).toHaveBeenLastCalledWith(true, expect.anything());
    expect(mocks.connect).toHaveBeenCalledTimes(1);
    expect(mocks.disconnect).not.toHaveBeenCalled();
  },
);

it.each([
  { name: 'deafened', deafened: true, mutedUserIds: [] },
  { name: 'muted member', deafened: false, mutedUserIds: ['late'] },
])('preserves $name while a user gesture unlocks SDK playback', async ({ deafened, mutedUserIds }) => {
  const ref = createRef<VoiceAudioHandle>();
  const view = render(
    <AudioSession ref={ref} roomId="room" participant={participant} deafened={deafened} mutedUserIds={mutedUserIds} />,
  );
  await screen.findByText('متصل بالصوت');
  const audio = document.createElement('audio');
  const track = { kind: 'audio', attach: () => audio, detach: () => [audio], on: vi.fn(), off: vi.fn() };
  act(() => mocks.events.get('subscribed')?.(track, {}, { identity: 'late' }));
  expect(audio.muted).toBe(true);
  let finish!: () => void;
  mocks.startAudio.mockImplementation(() => {
    // Room.startAudio synchronously unmutes attached elements before awaiting play.
    audio.muted = false;
    return new Promise<void>((resolve) => { finish = resolve; });
  });
  await act(async () => {
    const unlocked = ref.current!.startAudio();
    expect(audio.muted).toBe(true);
    finish();
    await unlocked;
  });
  expect(audio.muted).toBe(true);
  expect(mocks.connect).toHaveBeenCalledTimes(1);
  view.unmount();
});

it.each(['user-gesture', 'same-track-retry', 'unsubscribe'] as const)(
  'keeps recovery available for a blocked late track despite another track playing, then handles %s',
  async (recovery) => {
  const sdk = await vi.importActual<typeof import('livekit-client')>('livekit-client');
  const previousMediaStream = globalThis.MediaStream;
  class BrowserMediaStream {
    tracks: MediaStreamTrack[] = [];
    getTracks() { return this.tracks; }
    getAudioTracks() { return this.tracks.filter((track) => track.kind === 'audio'); }
    getVideoTracks() { return this.tracks.filter((track) => track.kind === 'video'); }
    addTrack(track: MediaStreamTrack) { this.tracks = [...this.tracks, track]; }
    removeTrack(track: MediaStreamTrack) { this.tracks = this.tracks.filter((entry) => entry !== track); }
  }
  vi.stubGlobal('MediaStream', BrowserMediaStream);
  const playing = new WeakSet<HTMLMediaElement>();
  let allowLatePlayback = false;
  let startExisting!: () => void;
  const existingPlayback = new Promise<void>((resolve) => { startExisting = resolve; });
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
    Object.defineProperty(this, 'paused', {
      configurable: true,
      get: () => !playing.has(this),
    });
    const source = this.srcObject as MediaStream;
    if (source.getAudioTracks()[0].id === 'late' && !allowLatePlayback)
      return Promise.reject(new DOMException('A user gesture is required', 'NotAllowedError'));
    return existingPlayback.then(() => { playing.add(this); });
  });
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  const tracks = ['existing', 'late'].map((id) => new sdk.RemoteAudioTrack(
    { id, kind: 'audio', enabled: true, readyState: 'live' } as MediaStreamTrack,
    `track-${id}`,
    {} as RTCRtpReceiver,
  ));
  // Reproduce the SDK's documented room-wide playback status events using real
  // RemoteAudioTrack.attach/play handling. Browser play permission is the only
  // playback boundary replaced here; no application mute or volume is forced.
  for (const track of tracks) {
    track.on(sdk.TrackEvent.AudioPlaybackFailed, () => {
      mocks.canPlaybackAudio = false;
      mocks.events.get('playback')?.();
    });
    track.on(sdk.TrackEvent.AudioPlaybackStarted, () => {
      mocks.canPlaybackAudio = true;
      mocks.events.get('playback')?.();
    });
  }
  const listener = { ...participant, role: 'listener' as const, seatIndex: null };
  const view = render(<AudioSession roomId="room" participant={listener} />);
  try {
    await screen.findByText('متصل بالصوت');
    await act(async () => {
      for (const [index, track] of tracks.entries())
        mocks.events.get('subscribed')?.(track, {}, { identity: index ? 'late' : 'existing' });
    });
    const late = document.querySelector<HTMLAudioElement>('audio[data-voice-audio="late"]')!;
    expect(late.muted).toBe(false);
    expect(late.paused).toBe(true);
    expect(screen.getByRole('button', { name: 'تفعيل الاستماع' })).toBeInTheDocument();

    await act(async () => { startExisting(); });
    expect(mocks.canPlaybackAudio).toBe(true);
    expect(late.paused).toBe(true);
    expect(screen.getByRole('button', { name: 'تفعيل الاستماع' })).toBeInTheDocument();

    allowLatePlayback = true;
    if (recovery === 'user-gesture') {
      mocks.startAudio.mockImplementation(async () => {
        await Promise.all(tracks.flatMap((track) => track.attachedElements).map((element) => {
          element.muted = false;
          return element.play();
        }));
        mocks.canPlaybackAudio = true;
        mocks.events.get('playback')?.();
      });
      fireEvent.click(screen.getByRole('button', { name: 'تفعيل الاستماع' }));
      await waitFor(() => expect(late.paused).toBe(false));
    } else if (recovery === 'same-track-retry') {
      await act(async () => { tracks[1].attach(late); });
      expect(late.paused).toBe(false);
    } else {
      act(() => mocks.events.get('unsubscribed')?.(tracks[1]));
      expect(late).not.toBeInTheDocument();
    }
    await waitFor(() => expect(screen.queryByRole('button', { name: 'تفعيل الاستماع' })).not.toBeInTheDocument());
    expect(mocks.connect).toHaveBeenCalledTimes(1);

  } finally {
    view.unmount();
    play.mockRestore();
    pause.mockRestore();
    vi.stubGlobal('MediaStream', previousMediaStream);
  }
  },
);
