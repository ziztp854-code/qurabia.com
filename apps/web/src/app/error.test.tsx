import { fireEvent, render, screen } from '@testing-library/react';
import * as Sentry from '@sentry/nextjs';
import { describe, expect, it, vi } from 'vitest';
import AppError from './error';

vi.mock('@sentry/nextjs', () => ({ captureMessage: vi.fn() }));

describe('AppError', () => {
  it('reports the error and lets the visitor retry without exposing details', () => {
    const error = new Error('private connection string');
    const reset = vi.fn();

    render(<AppError error={error} reset={reset} />);

    expect(Sentry.captureMessage).toHaveBeenCalledWith('Application error');
    expect(screen.getByRole('alert')).not.toHaveTextContent(error.message);
    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }));
    expect(reset).toHaveBeenCalledOnce();
  });
});
