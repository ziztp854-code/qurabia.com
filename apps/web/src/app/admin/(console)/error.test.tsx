import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AdminError from './error';

describe('AdminError', () => {
  it('does not render raw server error details to the browser', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <AdminError
        error={Object.assign(new Error('private connection string'), { digest: 'ref-123' })}
        reset={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert')).not.toHaveTextContent('private connection string');
    expect(screen.getByRole('alert')).toHaveTextContent('ref-123');
    expect(log).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ message: 'private connection string' }),
    );
    log.mockRestore();
  });
});
