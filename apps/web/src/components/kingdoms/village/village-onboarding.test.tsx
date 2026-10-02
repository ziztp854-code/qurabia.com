import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VillageOnboarding } from './village-onboarding';

afterEach(() => vi.unstubAllGlobals());
const response = (completed: boolean) =>
  new Response(
    JSON.stringify({
      success: true,
      data: { completed, completedAt: completed ? '2026-10-02T00:00:00Z' : null },
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );

describe('account village tour', () => {
  it('focuses the four landmarks and persists completion through the account API', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response(false))
      .mockResolvedValueOnce(response(true));
    vi.stubGlobal('fetch', fetcher);
    const focus = vi.fn();
    render(<VillageOnboarding ready focus={focus} accountId="player-1" />);
    await screen.findByText('هذه عاصمتك، ومن هنا تدير المملكة.');
    expect(focus).toHaveBeenLastCalledWith('hall');
    fireEvent.click(screen.getByRole('button', { name: 'التالي' }));
    expect(focus).toHaveBeenLastCalledWith('farm');
    fireEvent.click(screen.getByRole('button', { name: 'التالي' }));
    expect(focus).toHaveBeenLastCalledWith('barracks');
    fireEvent.click(screen.getByRole('button', { name: 'التالي' }));
    expect(focus).toHaveBeenLastCalledWith('gate');
    fireEvent.click(screen.getByRole('button', { name: 'ابدأ اللعب' }));
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'جولة القرية' })).not.toBeInTheDocument(),
    );
    expect(fetcher.mock.calls[1][0]).toBe('/api/kingdoms/village-onboarding');
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ completed: true });
  });
  it('does not repeat a tour already completed on the account', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(true)));
    const focus = vi.fn();
    render(<VillageOnboarding ready focus={focus} accountId="player-1" />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(focus).not.toHaveBeenCalled();
    expect(screen.queryByRole('region', { name: 'جولة القرية' })).not.toBeInTheDocument();
  });
  it('keeps the final step available for retry when saving fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(response(false)).mockRejectedValue(new Error('offline')),
    );
    render(<VillageOnboarding ready focus={vi.fn()} accountId="player-1" />);
    await screen.findByText('هذه عاصمتك، ومن هنا تدير المملكة.');
    fireEvent.click(screen.getByRole('button', { name: 'إنهاء الجولة' }));
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: 'أعد حفظ الجولة' })).toBeEnabled();
  });
});
