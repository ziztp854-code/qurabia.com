import { describe, it, expect, vi } from 'vitest';
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
    const { unmount } = render(
      <MafiaRoleReveal
        role="CITIZEN"
        onRevealed={() => {
          revealed = true;
          unmount();
        }}
      />,
    );
    await userEvent.keyboard('{Escape}');
    expect(revealed).toBe(true);
  });

  it('keeps the role card open until the player acknowledges it', async () => {
    const onRevealed = vi.fn();
    render(<MafiaRoleReveal role="DETECTIVE" onRevealed={onRevealed} />);
    await userEvent.click(screen.getByRole('button', { name: /اكشف دوري/ }));
    expect(screen.getByRole('dialog', { name: 'بطاقة الدور' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'المحقق' })).toBeInTheDocument();
    expect(onRevealed).not.toHaveBeenCalled();
    const done = screen.getByRole('button', { name: 'فهمت دوري' });
    expect(done).toHaveFocus();
    await userEvent.tab();
    expect(done).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(done).toHaveFocus();
    await userEvent.click(done);
    expect(onRevealed).toHaveBeenCalledOnce();
  });

  it('supports Escape after revealing and restores focus when closed', async () => {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();
    const onRevealed = vi.fn();
    const { unmount } = render(<MafiaRoleReveal role="DOCTOR" onRevealed={onRevealed} />);
    await userEvent.click(screen.getByRole('button', { name: /اكشف دوري/ }));
    await userEvent.keyboard('{Escape}');
    expect(onRevealed).toHaveBeenCalledOnce();
    unmount();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });
});
