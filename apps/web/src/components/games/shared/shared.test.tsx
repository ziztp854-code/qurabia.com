import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Game3DCard } from './game-3d-card';
import { GameConnectionStatus } from './game-connection-status';
import { GAME_GUIDES } from './game-guides';
import { GameHowTo } from './game-how-to';
import { GameSoundToggle, useGameSound } from './game-sound';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GAME_GUIDES', () => {
  const ids = [
    'mafia',
    'parallel-world',
    'reverse-time',
    'infiltrator',
    'memory-flash',
    'word-code',
    'question-word',
    'color-rush',
    'chess',
    'baloot',
  ] as const;

  it('covers all published games with complete content', () => {
    for (const id of ids) {
      const guide = GAME_GUIDES[id];
      expect(guide.id).toBe(id);
      expect(guide.goal.length).toBeGreaterThan(10);
      expect(guide.steps.length).toBeGreaterThanOrEqual(3);
      expect(guide.steps.every((step) => step.trim().length > 5)).toBe(true);
      expect(guide.example.length).toBeGreaterThan(10);
      expect(guide.tip.length).toBeGreaterThan(5);
    }
  });
});

describe('GameHowTo', () => {
  it('renders goal, steps, example and tip', () => {
    render(<GameHowTo guide={GAME_GUIDES['parallel-world']} />);
    expect(screen.getByRole('heading', { name: 'كيف تلعب؟' })).toBeInTheDocument();
    expect(screen.getByText('هدف اللعبة')).toBeInTheDocument();
    expect(screen.getByText(GAME_GUIDES['parallel-world'].goal)).toBeInTheDocument();
    for (const step of GAME_GUIDES['parallel-world'].steps) {
      expect(screen.getByText(step)).toBeInTheDocument();
    }
    expect(screen.getByText(GAME_GUIDES['parallel-world'].example)).toBeInTheDocument();
    expect(screen.getByText(GAME_GUIDES['parallel-world'].tip)).toBeInTheDocument();
  });

  it('exposes per-game theming through data-game', () => {
    const { container } = render(<GameHowTo guide={GAME_GUIDES.infiltrator} />);
    expect(container.querySelector('[data-game="infiltrator"]')).not.toBeNull();
  });
});

describe('Game3DCard', () => {
  it('hides the back face until flipped by click', async () => {
    const user = userEvent.setup();
    const onFlipped = vi.fn();
    render(
      <Game3DCard
        flipLabel="اكشف دورك"
        onFlipped={onFlipped}
        front={<span>بطاقة سرية</span>}
        back={<span>أنت الدخيل</span>}
      />,
    );

    const card = screen.getByRole('button', { name: 'اكشف دورك' });
    expect(card).toHaveAttribute('aria-pressed', 'false');
    expect(card.querySelector('.game-3d-card__face--back')).toHaveAttribute('aria-hidden', 'true');

    await user.click(card);
    expect(onFlipped).toHaveBeenCalledTimes(1);
    expect(card).toHaveAttribute('aria-pressed', 'true');
    expect(card.querySelector('.game-3d-card__face--back')).toHaveAttribute('aria-hidden', 'false');

    // Flipping again does nothing (no re-hiding the secret ceremony).
    await user.click(card);
    expect(onFlipped).toHaveBeenCalledTimes(1);
  });

  it('flips with the keyboard', async () => {
    const user = userEvent.setup();
    render(<Game3DCard flipLabel="اكشف دورك" front={<span>وجه</span>} back={<span>ظهر</span>} />);
    const card = screen.getByRole('button', { name: 'اكشف دورك' });
    card.focus();
    await user.keyboard('{Enter}');
    expect(card).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('GameConnectionStatus', () => {
  it('reflects the three connection states', () => {
    const { rerender } = render(<GameConnectionStatus state="connected" />);
    expect(screen.getByRole('status')).toHaveAttribute('data-state', 'connected');
    expect(screen.getByText('متصل بخدمة اللعب')).toBeInTheDocument();

    rerender(<GameConnectionStatus state="connecting" />);
    expect(screen.getByText('جارٍ الاتصال…')).toBeInTheDocument();

    rerender(<GameConnectionStatus state="failed" />);
    expect(screen.getByText('انقطع الاتصال — جارٍ المحاولة مجددًا')).toBeInTheDocument();
  });
});

function SoundHarness() {
  const { muted, toggleMuted } = useGameSound();
  return <GameSoundToggle muted={muted} onToggle={toggleMuted} />;
}

describe('useGameSound / GameSoundToggle', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('toggles mute and persists the setting locally', async () => {
    const user = userEvent.setup();
    render(<SoundHarness />);

    const toggle = screen.getByRole('button', { name: 'كتم الصوت' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    await user.click(toggle);
    expect(screen.getByRole('button', { name: 'تشغيل الصوت' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(localStorage.getItem('tahaddi-sound-muted')).toBe('1');

    await user.click(screen.getByRole('button', { name: 'تشغيل الصوت' }));
    expect(localStorage.getItem('tahaddi-sound-muted')).toBe('0');
  });

  it('restores the persisted mute state', () => {
    localStorage.setItem('tahaddi-sound-muted', '1');
    render(<SoundHarness />);
    expect(screen.getByRole('button', { name: 'تشغيل الصوت' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
