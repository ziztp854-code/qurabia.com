import { act, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveHostExperience } from './live-host-experience';
import { LivePlayerExperience } from './live-player-experience';

vi.mock('./use-live-game', () => ({
  useLiveGame: () => ({
    snapshot: {
      sessionId: 'session-1',
      roomCode: 'ABC123',
      phase: 'FINISHED',
      serverTime: Date.now(),
      question: null,
      reveal: null,
      leaderboard: [
        { id: 'player-1', name: 'سارة العتيبي', score: 9_800, rank: 1 },
        { id: 'player-2', name: 'محمد القحطاني', score: 9_200, rank: 2 },
        { id: 'player-3', name: 'نورة الحربي', score: 8_700, rank: 3 },
        { id: 'player-4', name: 'خالد الدوسري', score: 8_100, rank: 4 },
      ],
      participantCount: 4,
      playerAnswer: null,
      playerResult: null,
    },
    stats: null,
    clockOffset: 0,
    connected: true,
    message: '',
    busy: false,
    startQuestion: vi.fn(),
    nextQuestion: vi.fn(),
    finishGame: vi.fn(),
    submitAnswer: vi.fn(),
  }),
}));

describe('LivePlayerExperience final results', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the podium and contestant ranking after the session finishes', () => {
    render(
      <LivePlayerExperience
        sessionId="session-1"
        participantId="player-4"
        accessToken="token"
        displayName="خالد الدوسري"
      />,
    );
    act(() => vi.runAllTimers());

    expect(screen.getByRole('heading', { name: 'المركز الأول' })).toBeInTheDocument();
    expect(screen.getByLabelText('منصة الفائزين')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'ترتيب المتسابقين' })).toBeInTheDocument();
    expect(screen.getAllByText('سارة العتيبي')).toHaveLength(2);
    expect(screen.getAllByText('محمد القحطاني')).toHaveLength(2);
    expect(screen.getAllByText('نورة الحربي')).toHaveLength(2);
    expect(screen.getAllByText('خالد الدوسري')).toHaveLength(2);
  });

  it('shows the final winner and top three to the host', () => {
    render(
      <LiveHostExperience
        sessionId="session-1"
        hostId="host-1"
        accessToken="token"
        roomCode="ABC123"
        joinUrl="https://example.test/join/ABC123"
        initialAutoAdvance
      />,
    );
    act(() => vi.runAllTimers());

    expect(screen.getByRole('heading', { name: 'الفائز' })).toBeInTheDocument();
    const podium = screen.getByLabelText('منصة أفضل ثلاثة متسابقين');
    expect(podium).toBeInTheDocument();
    expect(within(podium).getByText('سارة العتيبي')).toBeVisible();
    expect(within(podium).getByText('محمد القحطاني')).toBeVisible();
    expect(within(podium).getByText('نورة الحربي')).toBeVisible();
  });
});
