import { fireEvent, render, screen } from '@testing-library/react';
import * as Sentry from '@sentry/nextjs';
import { describe, expect, it, vi } from 'vitest';
import AppError from './error';
import GlobalError from './global-error';

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

describe('AppError', () => {
  it.each([AppError, GlobalError])(
    'reports the error and lets the visitor retry without exposing details (%#)',
    (Component) => {
      const error = new Error('private connection string');
      const reset = vi.fn();

      render(<Component error={error} reset={reset} />);

      expect(Sentry.captureException).toHaveBeenCalledWith(error);
      expect(screen.getByRole('alert')).not.toHaveTextContent(error.message);
      fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }));
      expect(reset).toHaveBeenCalledOnce();
    },
  );
});
