import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VoiceParticipant, VoiceRoom, VoiceSnapshot } from '@/lib/voice/types';
import { VoiceRoomEntry } from './voice-room-entry';
import { VoiceSessionProvider } from './voice-session-provider';
import { emptyPreferences } from './voice-client';

const sdk = vi.hoisted(() => ({
  pathname: '/voice/room-one',
  push: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  microphone: vi.fn(),
  events: new Map<string, (...args: unknown[]) => void>(),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => sdk.pathname,
  useRouter: () => ({ push: sdk.push }),
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
  Track: { Kind: { Audio: 'audio' } },
  RoomEvent: { DataReceived: 'data' },
  Room: class {
    state = 'connected';
    canPlaybackAudio = true;
    localParticipant = {
      permissions: { canPublish: true },
      setMicrophoneEnabled: sdk.microphone,
    };
    connect = sdk.connect;
    disconnect = sdk.disconnect;
    on(event: string, callback: (...args: unknown[]) => void) {
      sdk.events.set(event, callback);
      return this;
    }
    removeAllListeners() {
      sdk.events.clear();
    }
  },
}));

const host: VoiceParticipant = {
  id: 'host',
  name: 'مستخدم اختبار',
  image: null,
  role: 'host',
  seatIndex: 0,
  handRaised: false,
  requestedSeat: null,
  muted: false,
  moderatorMuted: false,
  joinedAt: 1,
  lastSeenAt: 1,
};
const room: VoiceRoom = {
  id: 'room-one',
  name: 'غرفة اختبار الاستمرار',
  description: '',
  category: 'ألعاب',
  cover: '/voice/covers/gaming.webp',
  seatCount: 4,
  isPrivate: false,
  allowMicRequests: true,
  chatEnabled: true,
  moderatorsCanManage: true,
  hostId: host.id,
  hostName: host.name,
  hostImage: null,
  createdAt: 1,
  active: true,
  lockedSeats: [],
  participantCount: 1,
  listenerCount: 0,
  speakers: [host],
  passwordRequired: false,
};
let current: VoiceSnapshot;
let pollStatus: number;
let leaveFails: boolean;
let fetcher: ReturnType<typeof vi.fn>;
const response = (value: unknown, status = 200) =>
  Promise.resolve({ ok: status < 400, status, json: async () => value } as Response);

// These are React route fixtures, not browser navigation or real game sessions.
function RouteFixture() {
  if (sdk.pathname.startsWith('/voice/'))
    return <VoiceRoomEntry roomId={sdk.pathname.split('/')[2]} user={host} />;
  return <main aria-label="لعبة اختبار">{sdk.pathname}</main>;
}
function App() {
  return (
    <VoiceSessionProvider>
      <RouteFixture />
    </VoiceSessionProvider>
  );
}
function requests(suffix: string) {
  return fetcher.mock.calls.filter(([url]) => String(url).endsWith(suffix));
}
async function connected() {
  await screen.findByText('متصل بالصوت');
  await waitFor(() => expect(sdk.microphone).toHaveBeenCalledWith(true, expect.anything()));
}

beforeEach(() => {
  vi.clearAllMocks();
  sdk.pathname = '/voice/room-one';
  pollStatus = 200;
  leaveFails = false;
  current = { room, me: host, participants: [host], messages: [], cursor: 10 };
  sdk.connect.mockResolvedValue(undefined);
  sdk.disconnect.mockResolvedValue(undefined);
  sdk.microphone.mockResolvedValue(undefined);
  window.history.replaceState(null, '', sdk.pathname);
  vi.stubGlobal('isSecureContext', true);
  Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: vi.fn(() => true) });
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { enumerateDevices: vi.fn().mockResolvedValue([]) },
  });
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: (_name: string, _options: object, work: (lock: object) => unknown) => work({}),
    },
  });
  fetcher = vi.fn((url: string, init?: RequestInit) => {
    if (url.endsWith('/preferences')) return response(emptyPreferences);
    if (url.endsWith('/token'))
      return response({ token: 'test-only-token', url: 'ws://127.0.0.1:7890' });
    if (url.endsWith('/leave'))
      return response(leaveFails ? { error: 'تعذر إنهاء الجلسة.' } : {}, leaveFails ? 503 : 200);
    if (url.endsWith('/events') && init?.body) {
      const event = JSON.parse(init.body as string);
      if (event.type === 'mute') {
        const me = { ...current.me!, muted: event.muted };
        current = { ...current, me, participants: [me], cursor: current.cursor + 1 };
      }
      return response(current);
    }
    if (url.endsWith('/events') && pollStatus !== 200)
      return response({ error: 'انتهت صلاحية جلسة الصوت.' }, pollStatus);
    if (url.includes('/room-two'))
      return response({ ...current, room: { ...room, id: 'room-two' } });
    return response(current);
  });
  vi.stubGlobal('fetch', fetcher);
});
afterEach(() => vi.unstubAllGlobals());

describe('persistent microphone across game routes', () => {
  it('keeps the microphone connected during trial gifting and releases the gift dialog on game navigation', async () => {
    const view = render(<App />);
    await connected();
    const microphoneCalls = sdk.microphone.mock.calls.length;
    const previousOverflow = document.body.style.overflow;
    fireEvent.click(screen.getByRole('button', { name: 'الهدايا' }));
    expect(await screen.findByRole('dialog', { name: 'الهدايا التجريبية' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'إرسال وردة مجانًا' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'الهدايا التجريبية' })).not.toBeInTheDocument(),
    );
    expect(
      fetcher.mock.calls.some(
        ([, init]) => init?.body && JSON.parse(init.body as string).type === 'gift',
      ),
    ).toBe(true);
    expect(sdk.microphone).toHaveBeenCalledTimes(microphoneCalls);
    expect(sdk.disconnect).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'الهدايا التجريبية' })).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe(previousOverflow);
    fireEvent.click(screen.getByRole('button', { name: 'الهدايا' }));
    sdk.pathname = '/games/chess';
    view.rerender(<App />);
    expect(screen.queryByRole('dialog', { name: 'الهدايا التجريبية' })).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe(previousOverflow);
    expect(sdk.connect).toHaveBeenCalledTimes(1);
    expect(sdk.disconnect).not.toHaveBeenCalled();
    expect(requests('/token')).toHaveLength(1);
    // Drain this fixture's deferred page-leave cleanup before the next navigator mock.
    view.unmount();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  });
  it('does not load or request voice for users who only open games', async () => {
    sdk.pathname = '/games/chess';
    render(<App />);
    expect(screen.getByRole('main', { name: 'لعبة اختبار' })).toBeInTheDocument();
    expect(fetcher).not.toHaveBeenCalled();
    expect(sdk.connect).not.toHaveBeenCalled();
  });

  it('keeps one connection and microphone through games and back, with working mute/deafen', async () => {
    const view = render(<App />);
    await connected();
    for (const path of ['/games/', '/games/chess', '/games/kingdoms', '/live/TEST/host']) {
      sdk.pathname = path;
      view.rerender(<App />);
      expect(
        screen.getByRole('complementary', { name: 'جلسة الصوت المستمرة' }),
      ).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'على الميكروفون' })).not.toBeInTheDocument();
    }
    expect(sdk.disconnect).not.toHaveBeenCalled();
    expect(navigator.sendBeacon).not.toHaveBeenCalled();
    expect(requests('/leave')).toHaveLength(0);
    expect(requests('/join')).toHaveLength(0);
    expect(requests('/token')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'كتم المايك أثناء اللعب' }));
    await waitFor(() => expect(sdk.microphone).toHaveBeenLastCalledWith(false, expect.anything()));
    fireEvent.click(screen.getByRole('button', { name: 'كتم سماعات الغرفة' }));
    expect(screen.getByRole('button', { name: 'تشغيل سماعات الغرفة' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    sdk.pathname = '/voice/room-one/';
    view.rerender(<App />);
    expect(await screen.findByRole('heading', { name: 'على الميكروفون' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'تشغيل الميكروفون' })).toBeInTheDocument();
    expect(sdk.connect).toHaveBeenCalledTimes(1);
    expect(sdk.disconnect).not.toHaveBeenCalled();
    expect(requests('/token')).toHaveLength(1);
  });

  it('continues membership polling and applies moderator mute while a game is open', async () => {
    const view = render(<App />);
    await connected();
    sdk.pathname = '/games/chess';
    view.rerender(<App />);
    const me = { ...host, moderatorMuted: true };
    current = { ...current, me, participants: [me], cursor: 11 };
    await waitFor(() => expect(sdk.microphone).toHaveBeenLastCalledWith(false, expect.anything()), {
      timeout: 3500,
    });
    expect(requests('/events').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'تشغيل المايك أثناء اللعب' })).toBeDisabled();
    expect(sdk.disconnect).not.toHaveBeenCalled();
  });

  it('releases the mobile chat focus and scroll lock when opening a game', async () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn((query: string) => ({
      ...originalMatchMedia(query),
      matches: query === '(max-width: 1020px)',
    }));
    const previousOverflow = document.body.style.overflow;
    try {
      const view = render(<App />);
      await connected();
      fireEvent.click(screen.getByRole('button', { name: 'الدردشة' }));
      expect(await screen.findByRole('dialog', { name: 'دردشة الغرفة' })).toBeInTheDocument();
      expect(document.body.style.overflow).toBe('hidden');
      sdk.pathname = '/games/chess';
      view.rerender(<App />);
      expect(screen.queryByRole('dialog', { name: 'دردشة الغرفة' })).not.toBeInTheDocument();
      expect(document.body.style.overflow).toBe(previousOverflow);
      expect(sdk.disconnect).not.toHaveBeenCalled();
      expect(screen.getByRole('main', { name: 'لعبة اختبار' })).toBeInTheDocument();
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  it.each([401, 403, 410])('disconnects media on HTTP %s while playing', async (status) => {
    const view = render(<App />);
    await connected();
    sdk.pathname = '/games/chess';
    view.rerender(<App />);
    pollStatus = status;
    await waitFor(() => expect(sdk.disconnect).toHaveBeenCalledWith(true), { timeout: 3500 });
    expect(screen.queryByText('متصل بالصوت')).not.toBeInTheDocument();
    expect(screen.getByRole('main', { name: 'لعبة اختبار' })).toBeInTheDocument();
  });

  it('leaves from the game without navigating away or sending another join', async () => {
    const view = render(<App />);
    await connected();
    sdk.pathname = '/games/chess';
    view.rerender(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'مغادرة الصوت' }));
    await waitFor(() => expect(sdk.disconnect).toHaveBeenCalledWith(true));
    expect(requests('/leave')).toHaveLength(1);
    expect(requests('/join')).toHaveLength(0);
    expect(sdk.push).not.toHaveBeenCalled();
    expect(screen.getByRole('main', { name: 'لعبة اختبار' })).toBeInTheDocument();
  });

  it('requires an explicit room switch, retains audio if leave fails, then switches once', async () => {
    const view = render(<App />);
    await connected();
    sdk.pathname = '/voice/room-two';
    view.rerender(<App />);
    expect(await screen.findByText('أنت متصل بغرفة صوتية أخرى')).toBeInTheDocument();
    expect(requests('/leave')).toHaveLength(0);
    expect(requests('/token')).toHaveLength(1);
    leaveFails = true;
    fireEvent.click(screen.getByRole('button', { name: 'مغادرة الحالية والانضمام' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'مغادرة الحالية والانضمام' })).toBeEnabled(),
    );
    expect(sdk.disconnect).not.toHaveBeenCalled();
    leaveFails = false;
    fireEvent.click(screen.getByRole('button', { name: 'مغادرة الحالية والانضمام' }));
    await waitFor(() => expect(sdk.connect).toHaveBeenCalledTimes(2));
    expect(sdk.disconnect).toHaveBeenCalledTimes(1);
    expect(requests('/token')).toHaveLength(2);
  });

  it('leaving on the room page does not immediately recreate the session', async () => {
    render(<App />);
    await connected();
    fireEvent.click(screen.getByRole('button', { name: 'مغادرة الصوت' }));
    await waitFor(() => expect(sdk.disconnect).toHaveBeenCalledWith(true));
    await act(async () => {});
    expect(sdk.push).toHaveBeenCalledWith('/voice');
    expect(requests('/token')).toHaveLength(1);
    expect(sdk.connect).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole('complementary', { name: 'جلسة الصوت المستمرة' }),
    ).not.toBeInTheDocument();
  });
});

it('renders server-confirmed chat immediately and does not let an older heartbeat erase or duplicate it', async () => {
  const view = render(<App />);
  await connected();
  const message = {
    id: 'server-live-message',
    userId: 'other',
    name: 'ضيف المجلس',
    image: null,
    text: 'وصلت الرسالة مباشرة',
    createdAt: Date.now(),
    replyTo: null,
    pinned: false,
    reactions: {},
  };
  const bytes = new TextEncoder().encode(JSON.stringify({ roomId: room.id, cursor: 12, message }));
  try {
    act(() => sdk.events.get('data')?.(bytes, undefined, 0, 'tahaddi-voice-message-v1'));
    expect(screen.getByText(message.text)).toBeInTheDocument();
    act(() => sdk.events.get('data')?.(bytes, undefined, 0, 'tahaddi-voice-message-v1'));
    expect(screen.getAllByText(message.text)).toHaveLength(1);
    await waitFor(() => expect(requests('/events').length).toBeGreaterThan(0), { timeout: 3500 });
    expect(screen.getAllByText(message.text)).toHaveLength(1);
    current = { ...current, cursor: 13, messages: [] };
    await waitFor(() => expect(screen.queryByText(message.text)).not.toBeInTheDocument(), {
      timeout: 3500,
    });
    expect(sdk.connect).toHaveBeenCalledTimes(1);
  } finally {
    view.unmount();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
});
