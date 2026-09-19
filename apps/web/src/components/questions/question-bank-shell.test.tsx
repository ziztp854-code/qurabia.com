import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QuestionBankShell } from './question-bank-shell';

describe('QuestionBankShell', () => {
  it('scopes the vault class without the cinematic-bank leak marker', () => {
    const { container } = render(
      <QuestionBankShell>
        <p>الخزانة</p>
      </QuestionBankShell>,
    );

    const root = container.querySelector('.question-bank');
    expect(root).toBeTruthy();
    expect(root?.classList.contains('cinematic-bank')).toBe(false);
    expect(root).toHaveTextContent('الخزانة');
  });
});
