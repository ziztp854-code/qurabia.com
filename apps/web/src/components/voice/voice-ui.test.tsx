import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VoiceParticipant, VoiceRoom, VoiceSnapshot } from '@/lib/voice/types';
import { CreateRoom } from './create-room';
import { VoiceLobby } from './voice-lobby';
import { VoiceRoomView } from './voice-room';
import { VoiceRoomEntry } from './voice-room-entry';
import { VoiceShell } from './voice-ui';
import {
  captureInvite,
  clearSavedInvite,
  emptyPreferences,
  nextSnapshot,
  requestedSeat,
} from './voice-client';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    <span role="img" aria-label={alt} data-src={src} />
  ),
}));
vi.mock('./audio-session', () => ({
  AudioSession: () => <section aria-label="طبقة الصوت المعزولة في اختبار الواجهة" />,
}));

const host: VoiceParticipant = {
  id: 'host',
  name: 'مضيف الاختبار',
  image: null,
  role: 'host',
  seatIndex: 0,
  handRaised: false,
  requestedSeat: null,
  muted: true,
  moderatorMuted: false,
  joinedAt: 1,
  lastSeenAt: 1,
};
const listener: VoiceParticipant = {
  ...host,
  id: 'listener',
  name: 'مستمع الاختبار',
  role: 'listener',
  seatIndex: null,
  requestedSeat: -1,
};
const room: VoiceRoom = {
  id: 'test-room',
  name: 'غرفة اختبار معزولة',
  description: 'بيانات اختبار لا تظهر في الإنتاج',
  category: 'مجالس',
  cover: '/voice/covers/friends.webp',
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
  lockedSeats: [1],
  participantCount: 2,
  listenerCount: 1,
  speakers: [host],
  passwordRequired: false,
};
function snapshot(me = host): VoiceSnapshot {
  return { room, participants: [host, listener], messages: [], me, cursor: 10 };
}
function response(value: unknown, status = 200) {
  return Promise.resolve({ ok: status < 400, status, json: async () => value } as Response);
}
function mockRoom(me = host) {
  const fetcher = vi.fn((url: string, init?: RequestInit) => {
    if (url.endsWith('/preferences')) return response(emptyPreferences);
    if (url.endsWith('/events') && init?.body) return response({ ...snapshot(me), cursor: 11 });
    return response(snapshot(me));
  });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}
beforeEach(() => {
  push.mockClear();
  window.history.replaceState(null, '', '/voice');
  sessionStorage.clear();
  Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: vi.fn(() => true) });
});
afterEach(() => vi.unstubAllGlobals());

describe('Voice lobby and creation', () => {
  it('shows an honest empty state without fabricated rooms or memberships', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        response({ rooms: [], stats: { activeRooms: 0, listeners: 0, participants: 0 } }),
      ),
    );
    render(<VoiceLobby user={null} />);
    expect(await screen.findByText('المجلس ينتظر أول صوت')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'دخول الغرفة' })).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'إنشاء غرفة' })[0]);
    expect(push).toHaveBeenCalledWith('/auth/sign-in?next=%2Fvoice');
  });
  it('never presents an unavailable service as an empty room list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => response({ error: 'سجّل الدخول' }, 401)),
    );
    render(<VoiceLobby user={null} />);
    expect(await screen.findByText('اللقاء يبدأ بحسابك')).toBeInTheDocument();
    expect(screen.queryByText('المجلس ينتظر أول صوت')).not.toBeInTheDocument();
    expect(screen.queryByText('مجلس الأصدقاء')).not.toBeInTheDocument();
  });
  it('creates a persisted room with the selected privacy, category and microphone settings', async () => {
    const fetcher = vi.fn((...args: [string, RequestInit?]) => {
      void args;
      return response(snapshot());
    });
    vi.stubGlobal('fetch', fetcher);
    const close = vi.fn();
    render(<CreateRoom open onOpenChange={close} />);
    fireEvent.change(screen.getByLabelText('اسم الغرفة'), { target: { value: 'مجلسنا الخاص' } });
    fireEvent.change(screen.getByLabelText('التصنيف'), { target: { value: 'ثقافة' } });
    fireEvent.click(screen.getByRole('switch', { name: 'غرفة خاصة' }));
    fireEvent.change(screen.getByLabelText('كلمة المرور (اختيارية)'), {
      target: { value: 'secret-password' },
    });
    fireEvent.click(screen.getByRole('switch', { name: 'السماح بطلب الميكروفون' }));
    fireEvent.click(screen.getByRole('button', { name: 'إنشاء الغرفة' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/voice/test-room'));
    const body = JSON.parse(fetcher.mock.calls[0][1]?.body as string);
    expect(body).toMatchObject({
      name: 'مجلسنا الخاص',
      category: 'ثقافة',
      isPrivate: true,
      password: 'secret-password',
      allowMicRequests: false,
    });
    expect(close).toHaveBeenCalledWith(false);
  });
  it('keeps entered details and shows server validation failure without routing away', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => response({ error: 'وصلت إلى الحد المسموح للغرف.' }, 429)),
    );
    render(<CreateRoom open onOpenChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('اسم الغرفة'), { target: { value: 'مجلس محلي' } });
    fireEvent.click(screen.getByRole('button', { name: 'إنشاء الغرفة' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('وصلت إلى الحد المسموح');
    expect(screen.getByLabelText('اسم الغرفة')).toHaveValue('مجلس محلي');
    expect(push).not.toHaveBeenCalled();
  });
  it('rejects oversized covers locally before sending or replacing the selected cover', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const { container } = render(<CreateRoom open onOpenChange={vi.fn()} />);
    const file = new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'cover.webp', {
      type: 'image/webp',
    });
    fireEvent.change(container.querySelector('input[type=file]')!, { target: { files: [file] } });
    expect(await screen.findByRole('alert')).toHaveTextContent('٢ ميغابايت');
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('Live room roles and state', () => {
  it('lists speakers and listeners together and searches members without removing their microphone seat', async () => {
    mockRoom();
    render(<VoiceRoomView roomId={room.id} user={host} />);
    fireEvent.click(await screen.findByRole('button', { name: /عرض أعضاء الغرفة/ }));
    const members = await screen.findByRole('region', { name: 'أعضاء الغرفة' });
    expect(
      within(members).getByRole('button', { name: new RegExp(host.name) }),
    ).toBeInTheDocument();
    expect(
      within(members).getByRole('button', { name: new RegExp(listener.name) }),
    ).toBeInTheDocument();
    fireEvent.change(within(members).getByRole('searchbox'), {
      target: { value: `  ${listener.name}  ` },
    });
    expect(
      within(members).queryByRole('button', { name: new RegExp(host.name) }),
    ).not.toBeInTheDocument();
    expect(
      within(members).getByRole('button', { name: new RegExp(listener.name) }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: new RegExp(`${host.name}.*الميكروفون مكتوم`) }),
    ).toBeInTheDocument();
    fireEvent.change(within(members).getByRole('searchbox'), {
      target: { value: 'اسم غير موجود' },
    });
    expect(within(members).getByText('لا يوجد اسم يطابق البحث.')).toBeInTheDocument();
  });
  it('allows a host to approve a generic request into a free unlocked seat', async () => {
    const fetcher = mockRoom();
    render(<VoiceRoomView roomId={room.id} user={host} />);
    fireEvent.click(await screen.findByRole('button', { name: 'قبول' }));
    await waitFor(() =>
      expect(
        fetcher.mock.calls.some(
          ([, init]) => init?.body && JSON.parse(init.body as string).type === 'approve-seat',
        ),
      ).toBe(true),
    );
    const command = fetcher.mock.calls.find(
      ([, init]) => init?.body && JSON.parse(init.body as string).type === 'approve-seat',
    );
    expect(JSON.parse(command![1]!.body as string)).toMatchObject({
      type: 'approve-seat',
      userId: listener.id,
      seatIndex: 2,
    });
  });
  it('keeps the listener microphone disabled and excludes host moderation controls', async () => {
    mockRoom(listener);
    render(<VoiceRoomView roomId={room.id} user={listener} />);
    expect(await screen.findByRole('button', { name: 'الميكروفون مكتوم' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'قبول' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'إنهاء البث للجميع' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'طلبك قيد المراجعة' })).toBeEnabled();
  });
  it('warns when permissions are saved but media enforcement is not confirmed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        response(
          url.endsWith('/preferences')
            ? emptyPreferences
            : { ...snapshot(), mediaSyncPending: true },
        ),
      ),
    );
    render(<VoiceRoomView roomId={room.id} user={host} />);
    expect(await screen.findByText(/تطبيق صلاحيات الصوت لم يتأكد بعد/)).toBeInTheDocument();
  });
  it('stops the audio layer when polling reports revoked membership', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.endsWith('/preferences')) return response(emptyPreferences);
        if (url.endsWith('/events'))
          return response({ error: 'انتهت عضويتك في الغرفة.', code: 'NOT_JOINED' }, 403);
        return response(snapshot());
      }),
    );
    render(<VoiceRoomView roomId={room.id} user={host} />);
    expect(
      await screen.findByRole('region', { name: 'طبقة الصوت المعزولة في اختبار الواجهة' }),
    ).toBeInTheDocument();
    await waitFor(
      () =>
        expect(
          screen.queryByRole('region', { name: 'طبقة الصوت المعزولة في اختبار الواجهة' }),
        ).not.toBeInTheDocument(),
      { timeout: 3500 },
    );
    expect(screen.getByRole('button', { name: 'الانضمام للغرفة' })).toBeInTheDocument();
  });
  it('offers renewed sign-in when the server revokes the account session', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => response({ error: 'سجّل الدخول من جديد.', code: 'UNAUTHORIZED' }, 401)),
    );
    render(<VoiceRoomView roomId={room.id} user={host} />);
    expect(await screen.findByRole('link', { name: 'تسجيل الدخول من جديد' })).toHaveAttribute(
      'href',
      '/auth/sign-in?next=%2Fvoice%2Ftest-room',
    );
    expect(
      screen.queryByRole('region', { name: 'طبقة الصوت المعزولة في اختبار الواجهة' }),
    ).not.toBeInTheDocument();
  });
  it('ignores an older response that would restore revoked speaking permissions', () => {
    const latest = { ...snapshot(listener), cursor: 15 };
    const stale = { ...snapshot(host), cursor: 14 };
    expect(nextSnapshot(latest, stale)).toBe(latest);
    expect(nextSnapshot(stale, latest)).toBe(latest);
  });
  it('never allocates a locked, occupied or invalid requested seat', () => {
    expect(requestedSeat({ ...listener, requestedSeat: -1 }, room, [host])).toBe(2);
    expect(requestedSeat({ ...listener, requestedSeat: 1 }, room, [host])).toBe(2);
    expect(requestedSeat({ ...listener, requestedSeat: 0 }, room, [host])).toBe(2);
    expect(requestedSeat(listener, { seatCount: 2, lockedSeats: [1] }, [host])).toBeUndefined();
  });
});

describe('Private invitations', () => {
  it('keeps the invitation out of query strings and retains it only until admission', () => {
    const token = 'a'.repeat(64);
    window.history.replaceState(null, '', `/voice/test-room#invite=${token}`);
    expect(captureInvite(room.id)).toBe(token);
    expect(window.location.hash).toBe('');
    expect(window.location.search).toBe('');
    expect(captureInvite(room.id)).toBe(token);
    clearSavedInvite(room.id);
    expect(captureInvite(room.id)).toBeNull();
  });
  it('preserves a logged-out invitation across the sign-in gate with a clean callback', async () => {
    window.history.replaceState(null, '', `/voice/test-room#invite=${'b'.repeat(64)}`);
    await act(async () => render(<VoiceRoomEntry roomId={room.id} user={null} />));
    expect(screen.getByRole('link', { name: 'تسجيل الدخول والانضمام' })).toHaveAttribute(
      'href',
      '/auth/sign-in?next=%2Fvoice%2Ftest-room',
    );
    expect(window.location.hash).toBe('');
    expect(sessionStorage.getItem('tahaddi:voice-invite:test-room')).toBe('b'.repeat(64));
  });
});

describe('Narrow screen navigation accessibility', () => {
  it('contains focus in the menu, supports Escape and returns focus to its trigger', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: true,
        media: '',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    render(
      <VoiceShell user={host}>
        <p>محتوى الاختبار</p>
      </VoiceShell>,
    );
    const trigger = screen.getByRole('button', { name: 'فتح القائمة' });
    trigger.focus();
    fireEvent.click(trigger);
    const menu = screen.getByRole('dialog', { name: 'قائمة الغرف الصوتية' });
    const close = within(menu).getByRole('button', { name: 'إغلاق قائمة الغرف' });
    await waitFor(() => expect(close).toHaveFocus());
    const last = within(menu).getByRole('link', { name: 'العودة إلى تحدي' });
    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(close).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'قائمة الغرف الصوتية' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
