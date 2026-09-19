import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { CategoryBoardRoom } from './category-board-room';

describe('CategoryBoardRoom', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('starts with three categories per team and opens the host board', async () => {
    const user = userEvent.setup();
    render(<CategoryBoardRoom />);

    expect(screen.getByRole('heading', { name: 'جهّز مواجهة الفئات' })).toBeInTheDocument();
    expect(screen.getByText('3 فئات للفريق السماوي')).toBeInTheDocument();
    expect(screen.getByText('3 فئات للفريق الذهبي')).toBeInTheDocument();
    expect(screen.getAllByText('6 أسئلة')).toHaveLength(12);
    expect(
      screen.getAllByRole('button', { name: /إسناد .* إلى الفريق السماوي/ })[0],
    ).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'ابدأ لوحة المضيف' }));

    expect(screen.getByRole('heading', { name: 'لوحة الفئات' })).toBeInTheDocument();
    expect(screen.getAllByText('دور الفريق السماوي')).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /سؤال .* بقيمة 200/ })).toHaveLength(12);
  });

  it('reveals an answer, awards its value, consumes the tile, and changes the turn', async () => {
    const user = userEvent.setup();
    render(<CategoryBoardRoom />);

    await user.click(screen.getByRole('button', { name: 'ابدأ لوحة المضيف' }));
    const firstQuestion = screen.getAllByRole('button', { name: /سؤال .* بقيمة 200/ })[0];
    await user.click(firstQuestion);

    expect(screen.getByText('السؤال مفتوح')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'اكشف الإجابة' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'اكشف الإجابة' }));
    expect(screen.getAllByText('الإجابة')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: /^الفريق السماوي أجاب/ }));

    expect(screen.getByTestId('score-cyan')).toHaveTextContent('200');
    expect(screen.getAllByText('دور الفريق الذهبي')).toHaveLength(2);
    expect(
      screen.getByRole('button', { name: 'سؤال معلومات عامة بقيمة 200 — مستخدم' }),
    ).toBeDisabled();
  });

  it('doubles the next question and provides a timed search helper', async () => {
    const user = userEvent.setup();
    render(<CategoryBoardRoom />);

    await user.click(screen.getByRole('button', { name: 'ابدأ لوحة المضيف' }));
    await user.click(screen.getByRole('button', { name: 'دبلها — ضاعف السؤال التالي' }));
    await user.click(screen.getAllByRole('button', { name: /سؤال .* بقيمة 200/ })[0]);

    expect(screen.getByText('قيمة السؤال المضاعفة: 400')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'تحايل — 15 ثانية للبحث' }));
    expect(screen.getByRole('status')).toHaveTextContent('مهلة البحث');

    await user.click(screen.getByRole('button', { name: 'إنهاء مهلة البحث' }));
    expect(screen.getByRole('button', { name: 'تحايل — استُخدمت' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'اكشف الإجابة' }));
    await user.click(screen.getByRole('button', { name: /^الفريق السماوي أجاب/ }));

    expect(screen.getByTestId('score-cyan')).toHaveTextContent('400');
    expect(screen.getAllByText('دور الفريق الذهبي')).toHaveLength(2);
  });
});
