import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ArchiveQuestionButton } from './archive-question-button';

vi.mock('@/app/questions/actions', () => ({
  archiveQuestion: vi.fn(),
}));

describe('ArchiveQuestionButton', () => {
  it('asks for confirmation before archiving', async () => {
    const user = userEvent.setup();
    render(<ArchiveQuestionButton questionId="q-1" />);
    await user.click(screen.getByRole('button', { name: /أرشفة/ }));
    expect(screen.getByRole('dialog', { name: /أرشفة السؤال/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'تأكيد الأرشفة' })).toHaveClass('button-danger');
  });
});
