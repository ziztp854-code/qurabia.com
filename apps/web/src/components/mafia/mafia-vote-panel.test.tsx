import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MafiaVotePanel } from './mafia-vote-panel';

const players = [
  { id: 'a', displayName: 'سالم' },
  { id: 'b', displayName: 'ناصر' },
];

describe('MafiaVotePanel', () => {
  it('waits for server acceptance and allows changing an accepted vote', async () => {
    const user = userEvent.setup();
    let accept!: (value: boolean) => void;
    const onSubmit = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<boolean>((resolve) => {
            accept = resolve;
          }),
      )
      .mockResolvedValue(true);
    render(<MafiaVotePanel players={players} onSubmit={onSubmit} />);
    await user.click(screen.getByRole('radio', { name: /سالم/ }));
    await user.click(screen.getByRole('button', { name: /تثبيت التصويت/ }));
    expect(screen.queryByText('تم تسجيل صوتك')).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /ناصر/ })).toBeDisabled();
    accept(true);
    await screen.findByText('تم تسجيل صوتك');
    await user.click(screen.getByRole('radio', { name: /ناصر/ }));
    await user.click(screen.getByRole('button', { name: /تثبيت التصويت/ }));
    await waitFor(() => expect(onSubmit).toHaveBeenLastCalledWith('b'));
    await screen.findByText('الصوت المسجل: ناصر');
  });

  it.each([false, new Error('offline')])(
    'keeps the selected target for retry when saving fails: %s',
    async (result) => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      if (result instanceof Error) onSubmit.mockRejectedValueOnce(result);
      else onSubmit.mockResolvedValueOnce(result);
      onSubmit.mockResolvedValueOnce(true);
      render(<MafiaVotePanel players={players} onSubmit={onSubmit} />);
      await user.click(screen.getByRole('radio', { name: /سالم/ }));
      await user.click(screen.getByRole('button', { name: /تثبيت التصويت/ }));
      await screen.findByRole('alert');
      expect(screen.queryByText('تم تسجيل صوتك')).not.toBeInTheDocument();
      expect(screen.getByRole('radio', { name: /سالم/ })).toBeChecked();
      await user.click(screen.getByRole('button', { name: /تثبيت التصويت/ }));
      await screen.findByText('تم تسجيل صوتك');
      expect(onSubmit).toHaveBeenCalledTimes(2);
    },
  );
});
