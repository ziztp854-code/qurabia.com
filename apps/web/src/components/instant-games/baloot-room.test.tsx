import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BalootRoom } from './baloot-room';
import { formatNumber } from '@/lib/utils';

const mock = vi.hoisted(() => ({
  room: {
    roomCode: '123456',
    phase: 'BIDDING',
    stateVersion: 1,
    seats: Array.from({ length: 4 }, (_, seat) => ({
      seat,
      team: seat % 2 ? 'B' : 'A',
      playerName: `لاعب ${seat}`,
      ready: true,
      connected: true,
      isHost: seat === 0,
    })),
    yourSeat: 1,
    yourTeam: 'B',
    yourHand: [{ id: 'hearts-A', suit: 'hearts', rank: 'A' }],
    purchaseCard: { id: 'spades-K', suit: 'spades', rank: 'K' },
    contract: null,
    lastContract: null,
    buyerPlayerId: 0,
    leaderSeat: 0,
    auctionRound: 1,
    bidder: 1,
    pendingDouble: null,
    turn: null,
    currentTrick: [],
    trickHistory: [],
    scores: [37, 64],
    roundScore: null,
    autoPlayEvents: [],
    availableBids: [],
  },
}));
vi.mock('./use-baloot-socket', () => ({
  useBalootSocket: () => ({
    room: mock.room,
    connected: true,
    latencyMs: 20,
    connectionQuality: 'excellent',
    busy: false,
    restoring: false,
    error: '',
    emit: vi.fn(),
    leave: vi.fn(),
    clearError: vi.fn(),
  }),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Baloot table', () => {
  it('shows scores and the active buyer from team B’s perspective', () => {
    render(<BalootRoom />);
    const info = screen.getByLabelText('معلومات الجولة');
    expect(info).toHaveTextContent(`لنا${formatNumber(64)}·لهم${formatNumber(37)}`);
    expect(
      screen
        .getAllByText('لاعب 1')
        .map((node) => node.closest('[data-position]'))
        .find(Boolean),
    ).toHaveAttribute('data-active', 'true');
    expect(screen.getByLabelText('ورقة الشراء المكشوفة')).toHaveTextContent('K');
  });

  it('expands the table without losing the current hand or purchase card', () => {
    render(<BalootRoom />);
    fireEvent.click(screen.getByRole('button', { name: 'توسيع الطاولة' }));
    expect(screen.getByRole('button', { name: 'الحجم العادي' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByLabelText('ورقة الشراء المكشوفة')).toBeVisible();
    expect(screen.getByLabelText('يدك').querySelector('img')).toHaveAttribute('src', '/game-art/baloot-cards/H-A.svg');
    fireEvent.click(screen.getByRole('button', { name: 'الحجم العادي' }));
    expect(screen.getByRole('button', { name: 'توسيع الطاولة' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('closes the rules with Escape', () => {
    render(<BalootRoom />);
    fireEvent.click(screen.getByRole('button', { name: 'القوانين' }));
    expect(screen.getByRole('dialog', { name: 'دليل قوانين البلوت' })).toBeVisible();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
