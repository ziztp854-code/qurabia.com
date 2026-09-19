import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { joinLiveSessionByCode } from '@/app/live/actions';
import { JoinQuizForm } from './join-quiz-form';

const router = { push: vi.fn() };

vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

vi.mock('@/app/live/actions', () => ({
  joinLiveSessionByCode: vi.fn(),
}));

const mockedJoin = vi.mocked(joinLiveSessionByCode);

async function submitJoinForm() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('اسم اللاعب'), 'نورة');
  await user.type(screen.getByLabelText('رمز الغرفة'), 'A7K9PQ');
  await user.click(screen.getByRole('button', { name: 'انضم الآن' }));
}

describe('JoinQuizForm', () => {
  beforeEach(() => {
    router.push.mockReset();
    mockedJoin.mockReset();
  });

  it('يعرّف حقول الانضمام المطلوبة بأسماء مناسبة للنماذج', () => {
    render(<JoinQuizForm />);

    expect(screen.getByLabelText('اسم اللاعب')).toHaveAttribute('name', 'playerName');
    expect(screen.getByLabelText('اسم اللاعب')).toBeRequired();
    expect(screen.getByLabelText('رمز الغرفة')).toHaveAttribute('name', 'roomCode');
    expect(screen.getByLabelText('رمز الغرفة')).toBeRequired();
  });

  it('لا يضع رمز وصول لاعب القاتل في عنوان الصفحة', async () => {
    mockedJoin.mockResolvedValue({
      status: 'success',
      gameType: 'mafia',
      sessionId: 'mafia-game',
      participantId: 'player-1',
      roomCode: 'A7K9PQ',
    });
    render(<JoinQuizForm />);

    await submitJoinForm();

    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith(
        '/mafia/mafia-game/play?participantId=player-1&code=A7K9PQ',
      ),
    );
  });

  it('يبقي رمز الوصول الموقّع لمسار المسابقة المباشرة', async () => {
    mockedJoin.mockResolvedValue({
      status: 'success',
      gameType: 'quiz',
      sessionId: 'quiz-session',
      participantId: 'player-2',
      participantToken: 'signed-player-token',
      roomCode: 'A7K9PQ',
    });
    render(<JoinQuizForm />);

    await submitJoinForm();

    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith(
        '/live/quiz-session/play?participantId=player-2&code=A7K9PQ&token=signed-player-token',
      ),
    );
  });

  it('يوجه رمز دعوة الشطرنج الرقمي إلى غرفة الشطرنج', async () => {
    const user = userEvent.setup();
    render(<JoinQuizForm initialCode="889188" inviteMode />);

    await user.type(screen.getByLabelText('اسم اللاعب'), 'نورة');
    await user.click(screen.getByRole('button', { name: 'انضم الآن' }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/games/chess/?join=889188'));
    expect(localStorage.getItem('tahaddi-chess-player-name')).toBe('نورة');
    expect(mockedJoin).not.toHaveBeenCalled();
  });
});
