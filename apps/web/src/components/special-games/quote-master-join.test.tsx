import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QuoteMasterJoin } from './quote-master-join';

describe('QuoteMasterJoin', () => {
  it('explains that old room invitations cannot join a live game', () => {
    render(<QuoteMasterJoin roomCode="ABC234" />);
    expect(screen.getByText(/الانضمام إلى غرفة مشتركة غير متاح/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'انضمام' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'افتح اللعبة' })).toHaveAttribute('href', '/games/quote-master');
  });
});
