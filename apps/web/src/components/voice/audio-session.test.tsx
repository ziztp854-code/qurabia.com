import { createRef } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioSession, type VoiceAudioHandle } from './audio-session';
import type { VoiceParticipant } from '@/lib/voice/types';
const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  mic: vi.fn(),
  startAudio: vi.fn(),
  canPlaybackAudio: true,
  lock: vi.fn(),
  track: { enabled: true },
  events: new Map<string, (...args: unknown[]) => void>(),
}));
vi.mock('livekit-client', () => ({
  ConnectionState: { Connected: 'connected' },
  DisconnectReason: { DUPLICATE_IDENTITY: 2, PARTICIPANT_REMOVED: 4 },
  Track: { Kind: { Audio: 'audio' }, Source: { Microphone: 'microphone' } },
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
    get canPlaybackAudio() {
      return mocks.canPlaybackAudio;
    }
    localParticipant = {
      permissions: { canSubscribe: true, canPublish: true },
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
describe('audio session lifecycle', () => {
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
