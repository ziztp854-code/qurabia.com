import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BalootRoom } from './baloot-room';
import { formatNumber } from '@/lib/utils';

const mock = vi.hoisted(() => ({
  showLobby: false,
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
    room: mock.showLobby ? null : mock.room,
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
  mock.showLobby = false;
  vi.restoreAllMocks();
});

describe('Baloot table', () => {
  it('opens the join form with the invited room code', () => {
    mock.showLobby = true;
    render(<BalootRoom initialCode="123456" />);
    expect(screen.getByRole('button', { name: 'دخول برمز' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('رمز المجلس')).toHaveValue('123456');
  });

  it('copies an invitation that opens the same room without a seat token', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const descriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    try {
      render(<BalootRoom />);
      fireEvent.click(screen.getByRole('button', { name: 'نسخ رابط دعوة البلوت' }));
      await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/games/baloot/join/123456`));
      expect(screen.getByText('نُسخ رابط الدعوة.')).toBeInTheDocument();
    } finally {
      if (descriptor) Object.defineProperty(navigator, 'clipboard', descriptor);
      else Reflect.deleteProperty(navigator, 'clipboard');
    }
  });

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

  it('closes the rules with Escape', async () => {
    render(<BalootRoom />);
    fireEvent.click(screen.getByRole('button', { name: 'القوانين' }));
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'دليل قوانين البلوت' })).toBeVisible());
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
