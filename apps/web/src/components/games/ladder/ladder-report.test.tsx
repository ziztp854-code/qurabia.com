import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { LadderRoomSnapshot } from '@tahaddi/domain';
import { LadderReport } from './ladder-report';

const room: LadderRoomSnapshot = {
  roomCode: 'ABCD1234', phase: 'finished', currentRound: 2, totalRounds: 2,
  rightScore: 120, leftScore: 200, rightPosition: 1, leftPosition: 2,
  winningPosition: 10, questionTimeLimit: 30, currentQuestion: null, isHost: false,
  rightTeam: [{ playerName: 'أحمد', isHost: false }],
  leftTeam: [{ playerName: 'سارة', isHost: false }], endedAt: 1793500000000,
  roundHistory: [
    { roundNumber: 1, questionId: 'q1', questionText: 'السؤال الأول', options: [{ id: 'a', text: 'صحيح' }, { id: 'b', text: 'خطأ' }], correctOptionId: 'a', right: { optionId: 'b', correct: false, elapsedMs: 2300, points: 0 }, left: { optionId: 'a', correct: true, elapsedMs: 1200, points: 100 } },
    { roundNumber: 2, questionId: 'q2', questionText: 'السؤال الثاني', options: [{ id: 'a', text: 'الجواب الثاني' }], correctOptionId: 'a', right: { optionId: 'a', correct: true, elapsedMs: 1000, points: 120 }, left: { optionId: null, correct: false, elapsedMs: null, points: 0 } },
  ],
};

describe('LadderReport', () => {
  it('shows only the selected player’s mistakes and prints their report', async () => {
    const user = userEvent.setup();
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    render(<LadderReport room={room} />);
    await user.click(screen.getByRole('button', { name: /تقرير أحمد/ }));
    let report = screen.getByRole('article', { name: 'تقرير اللاعب أحمد' });
    expect(within(report).getByText(/السؤال الأول/)).toBeInTheDocument();
    expect(within(report).queryByText(/السؤال الثاني/)).not.toBeInTheDocument();
    expect(within(report).getByText(/2.3 ثانية/)).toBeInTheDocument();
    expect(within(report).getByText('صحيح')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /حفظه PDF/ }));
    expect(print).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: /تقرير سارة/ }));
    report = screen.getByRole('article', { name: 'تقرير اللاعب سارة' });
    expect(within(report).getByText(/السؤال الثاني/)).toBeInTheDocument();
    expect(within(report).getByText('لم تتم الإجابة', { exact: true })).toBeInTheDocument();
    expect(within(report).getByText(/لم يُسجّل وقت/)).toBeInTheDocument();
    print.mockRestore();
  });
});
