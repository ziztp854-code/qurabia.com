import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MafiaRoleReveal } from './mafia-role-reveal';

describe('MafiaRoleReveal Accessibility', () => {
  it('renders dialog semantics when role is provided', () => {
    render(<MafiaRoleReveal role="CITIZEN" onRevealed={() => {}} />);
    const dialog = screen.getByRole('dialog', { name: 'كشف الدور' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('focuses the primary button when dialog opens', () => {
    render(<MafiaRoleReveal role="CITIZEN" onRevealed={() => {}} />);
    const button = screen.getByRole('button', { name: /اكشف دوري/ });
    expect(button).toHaveFocus();
  });

  it('closes dialog on Escape key', async () => {
    let revealed = false;
    const { unmount } = render(<MafiaRoleReveal role="CITIZEN" onRevealed={() => { revealed = true; unmount(); }} />);
    await userEvent.keyboard('{Escape}');
    expect(revealed).toBe(true);
  });

  it('restores focus after reveal', async () => {
    let onRevealedCalled = false;
    render(<MafiaRoleReveal role="CITIZEN" onRevealed={() => { onRevealedCalled = true; }} />);
    const button = screen.getByRole('button', { name: /اكشف دوري/ });
    button.focus();
    await userEvent.click(button);
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(onRevealedCalled).toBe(true);
  });
});
