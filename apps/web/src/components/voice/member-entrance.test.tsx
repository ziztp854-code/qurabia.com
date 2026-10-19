import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemberEntrance, voiceArrivals, voiceEntranceRank } from './member-entrance';
import type { VoiceParticipant, VoiceSnapshot } from '@/lib/voice/types';

const member = { id: 'me', name: 'عضو الاختبار', image: null, joinedAt: 1 } as VoiceParticipant;
const other = { ...member, id: 'other', name: 'ضيف المجلس' };
const snapshot = (participants: VoiceParticipant[], me: VoiceParticipant | null = member) =>
  ({ room: { id: 'room', active: true }, participants, me }) as VoiceSnapshot;
afterEach(() => vi.useRealTimers());
describe('member entrance notices', () => {
  it('welcomes self initially without claiming everyone already present just joined', () => {
    expect(voiceArrivals(null, snapshot([member, other]))).toEqual([member]);
    expect(voiceArrivals(null, snapshot([other], null))).toEqual([]);
  });
  it('announces real joins and rejoins, while ignoring heartbeat/name changes', () => {
    expect(voiceArrivals(snapshot([member]), snapshot([member, other]))).toEqual([other]);
    expect(
      voiceArrivals(snapshot([member, other]), snapshot([member, { ...other, name: 'اسم جديد' }])),
    ).toEqual([]);
    const rejoined = { ...other, joinedAt: 2 };
    expect(voiceArrivals(snapshot([member, other]), snapshot([member, rejoined]))).toEqual([
      rejoined,
    ]);
    expect(
      voiceArrivals(snapshot([member]), {
        ...snapshot([member, other]),
        room: { ...snapshot([]).room, active: false },
      }),
    ).toEqual([]);
  });
  it('expires while hidden and supports an explicit dismissal without stealing focus', () => {
    vi.useFakeTimers();
    const dismiss = vi.fn();
    const view = render(
      <MemberEntrance
        arrival={{ member, key: 'me:1', expiresAt: Date.now() + 6000 }}
        selfId="me"
        visible
        onDismiss={dismiss}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('حيّاك');
    fireEvent.click(screen.getByRole('button', { name: 'إخفاء شارة الدخول' }));
    expect(dismiss).toHaveBeenCalledTimes(1);
    view.rerender(
      <MemberEntrance
        arrival={{ member, key: 'me:1', expiresAt: Date.now() + 6000 }}
        selfId="me"
        visible={false}
        onDismiss={dismiss}
      />,
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(6000));
    expect(dismiss).toHaveBeenCalledTimes(2);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

it('uses verified account badges for entrance rank, with platform-role precedence', () => {
  expect(voiceEntranceRank({ ...member, role: 'host', accountBadges: [] })).toBe('member');
  expect(voiceEntranceRank({ ...member, accountBadges: ['prince', 'knight', 'sultan'] })).toBe(
    'sultan',
  );
  expect(voiceEntranceRank({ ...member, accountBadges: ['sultan', 'owner'] })).toBe('owner');
  render(
    <MemberEntrance
      arrival={{
        member: { ...member, accountBadges: ['prince'] },
        key: 'prince',
        expiresAt: Date.now() + 6000,
      }}
      visible
      selfId="me"
      onDismiss={() => {}}
    />,
  );
  expect(screen.getByRole('status')).toHaveTextContent('دخول الأمير');
});

it('reserves the bespoke owner treatment for the verified platform owner badge', () => {
  const { rerender } = render(
    <MemberEntrance
      arrival={{
        member: { ...member, role: 'host', accountBadges: ['verified', 'owner'] },
        key: 'owner',
        expiresAt: Date.now() + 6000,
      }}
      visible
      selfId="me"
      onDismiss={() => {}}
    />,
  );
  expect(screen.getByRole('status')).toHaveTextContent('دخول مالك المنصة');
  expect(screen.getByRole('img', { name: 'مالك المنصة موثّق' })).toBeInTheDocument();
  expect(document.querySelector('aside[data-rank="owner"] img')).toHaveAttribute(
    'src',
    expect.stringContaining('emblem-owner.png'),
  );
  rerender(
    <MemberEntrance
      arrival={{
        member: { ...member, role: 'host', accountBadges: [] },
        key: 'host',
        expiresAt: Date.now() + 6000,
      }}
      visible
      selfId="me"
      onDismiss={() => {}}
    />,
  );
  expect(screen.queryByText('تحدّي لايف')).not.toBeInTheDocument();
  expect(document.querySelector('aside[data-rank="owner"]')).toBeNull();
});

it('shows the special entrance only for an eligible account and keeps the real name', () => {
  const arrival = {
    member: { ...member, accountBadges: ['sultan'] as const },
    key: 'sultan',
    expiresAt: Date.now() + 6000,
  };
  const { rerender } = render(
    <MemberEntrance
      arrival={{ ...arrival, member: { ...arrival.member, accountBadges: ['sultan'] } }}
      visible
      selfId="someone-else"
      onDismiss={() => {}}
    />,
  );
  expect(screen.getByRole('status')).toHaveTextContent('دخول مميز');
  expect(screen.getByRole('status')).toHaveTextContent(member.name);
  expect(screen.getByRole('status')).toHaveTextContent('دخول السلطان');
  rerender(
    <MemberEntrance
      arrival={{ ...arrival, member: { ...member, role: 'host', accountBadges: [] } }}
      visible
      selfId="me"
      onDismiss={() => {}}
    />,
  );
  expect(screen.queryByText('دخول مميز')).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('نورت المجلس');
});
