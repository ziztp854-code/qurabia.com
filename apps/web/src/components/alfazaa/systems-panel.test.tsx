import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { createInitialState } from '@/lib/alfazaa/domain/state';
import { SystemsPanel } from './systems-panel';
afterEach(cleanup);
describe('systems player interface', () => {
  it('shows role gated dailies and sends the exact road claim without mutating player state', async () => {
    const state = { ...createInitialState(1800000000000), castleLevel: 3 },
      send = vi.fn().mockResolvedValue(undefined);
    render(<SystemsPanel state={state} send={send} busy={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'درب المجد' }));
    fireEvent.click(screen.getByRole('button', { name: 'استلام مكافأة تطوير القلعة إلى مستوى 3' }));
    await waitFor(() =>
      expect(send).toHaveBeenCalledWith({ type: 'systems-claim', family: 'road', id: 104 }),
    );
    expect(state.realm.systems.claims).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'اليومية' }));
    expect(screen.getByText(/تفتح المهام اليومية عند مستوى اللاعب 10/)).toBeInTheDocument();
  });
  it('prevents sending queue commands while another action is busy', () => {
    const send = vi.fn();
    render(<SystemsPanel state={createInitialState(1800000000000)} send={send} busy />);
    fireEvent.click(screen.getByRole('button', { name: 'التدريب والعلاج' }));
    expect(screen.getByRole('button', { name: 'تحديث الطوابير' })).toBeDisabled();
    expect(send).not.toHaveBeenCalled();
  });
  it('uses actual box choices and displays source richtext as safe plain text', async () => {
    const base = createInitialState(1800000000000),
      state = { ...base, balances: { ...base.balances, '202003': 1, '800081': 1 } },
      send = vi.fn().mockResolvedValue(undefined);
    render(<SystemsPanel state={state} send={send} busy={false} initialTab="bag" />);
    expect(screen.queryByText(/<br>/)).toBeNull();
    fireEvent.change(screen.getByLabelText('اختر محتوى الصندوق'), { target: { value: '1' } });
    const choiceCard = screen.getByLabelText('اختر محتوى الصندوق').closest('article')!;
    fireEvent.click(choiceCard.querySelector('button')!);
    await waitFor(() =>
      expect(send).toHaveBeenCalledWith({
        type: 'systems-use',
        itemId: 202003,
        count: 1,
        choice: 1,
      }),
    );
    expect(state.balances['202003']).toBe(1);
  });
  it('searches real hero supplies, respects research gates and exposes independent event/progression rules', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    render(<SystemsPanel state={createInitialState(1800000000000)} send={send} busy={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'الإمداد والمتجر' }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '720001' } });
    fireEvent.click(screen.getByRole('button', { name: 'شراء الإمداد' }));
    await waitFor(() =>
      expect(send).toHaveBeenCalledWith({ type: 'systems-exchange', itemId: 720001, count: 1 }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'الأبحاث' }));
    fireEvent.click(screen.getByRole('button', { name: 'كلية العلوم' }));
    expect(
      screen
        .getAllByRole('button', { name: 'متطلبات البحث غير مكتملة' })
        .every((b) => b.hasAttribute('disabled')),
    ).toBe(true);
    expect(screen.queryByText(/\{0\}/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'المرافق والآثار' }));
    fireEvent.click(screen.getByRole('button', { name: 'عربة الحرب' }));
    expect(screen.getByRole('button', { name: 'تطوير عربة الحرب' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'الآثار' }));
    expect(
      screen
        .getAllByRole('button', { name: 'تجهيز الأثر' })
        .every((b) => b.hasAttribute('disabled')),
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'التحديات' }));
    expect(screen.getByText('راية المغامرة اليومية')).toBeInTheDocument();
  });
});
