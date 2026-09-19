import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LivePlayerExperience } from './live-player-experience';

const submitAnswer = vi.fn();

const liveGame = vi.hoisted(() => ({
  snapshot: {
    sessionId: 'session-1',
    roomCode: 'ABC123',
    phase: 'QUESTION' as const,
    serverTime: Date.now(),
    question: {
      questionId: 'question-1',
      prompt: 'أي كوكب يُعرف باسم الكوكب الأحمر؟',
      options: [
        { id: 'option-1', text: 'الزهرة', position: 0 },
        { id: 'option-2', text: 'المريخ', position: 1 },
        { id: 'option-3', text: 'المشتري', position: 2 },
        { id: 'option-4', text: 'عطارد', position: 3 },
      ],
      media: [],
      questionStartedAt: Date.now(),
      questionEndsAt: Date.now() + 20_000,
      questionNumber: 1,
      totalQuestions: 10,
    },
    reveal: null,
    leaderboard: [],
    participantCount: 4,
    playerAnswer: null as null | { questionId: string; optionId: string },
    playerResult: null,
  },
  stats: null,
  clockOffset: 0,
  connected: true,
  message: '',
  busy: false,
}));

vi.mock('./use-live-game', () => ({
  useLiveGame: () => ({
    ...liveGame,
    startQuestion: vi.fn(),
    nextQuestion: vi.fn(),
    finishGame: vi.fn(),
    submitAnswer,
  }),
}));

describe('LivePlayerExperience active question', () => {
  beforeEach(() => {
    submitAnswer.mockClear();
    liveGame.connected = true;
    liveGame.snapshot.playerAnswer = null;
  });

  it('prioritizes the readable question, timer, and full-width answer controls', () => {
    const { container } = render(
      <LivePlayerExperience
        sessionId="session-1"
        participantId="player-1"
        accessToken="token"
        displayName="Amira"
      />,
    );

    expect(screen.getByText('Amira')).toBeVisible();
    expect(screen.getByText('متصل')).toBeVisible();
    expect(screen.getByText('السؤال 1 من 10')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'أي كوكب يُعرف باسم الكوكب الأحمر؟' })).toBeVisible();
    expect(screen.getByRole('timer')).toBeVisible();
    expect(container.querySelector('.royal-question-stage--player')).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(4);

    fireEvent.click(screen.getByRole('button', { name: /الخيار ب: المريخ/ }));
    expect(submitAnswer).toHaveBeenCalledWith('question-1', 'option-2');
  });

  it('announces reconnecting without hiding the player identity', () => {
    liveGame.connected = false;
    render(
      <LivePlayerExperience
        sessionId="session-1"
        participantId="player-1"
        accessToken="token"
        displayName="Amira"
      />,
    );

    expect(screen.getByText('Amira')).toBeVisible();
    expect(screen.getByText('يعيد الاتصال')).toBeVisible();
  });
});
