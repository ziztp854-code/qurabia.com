import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioSession } from './audio-session';
import type { VoiceParticipant } from '@/lib/voice/types';
const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  mic: vi.fn(),
  startAudio: vi.fn(),
  lock: vi.fn(),
  track: { enabled: true },
  events: new Map<string, (...args: unknown[]) => void>(),
}));
vi.mock('livekit-client', () => ({
  ConnectionState: { Connected: 'connected' },
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
    canPlaybackAudio = true;
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
