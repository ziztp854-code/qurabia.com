import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { QuestionComposer } from './question-composer';

describe('QuestionComposer', () => {
  it('opens when the header add-question link is used', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <>
        <a href="#question-editor">إضافة سؤال</a>
        <QuestionComposer defaultOpen={false}>
          <p>نموذج السؤال</p>
        </QuestionComposer>
      </>,
    );

    const details = container.querySelector('#question-editor') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    await user.click(screen.getByRole('link', { name: 'إضافة سؤال' }));
    expect(details.open).toBe(true);
    expect(screen.getByText('نموذج السؤال')).toBeDefined();
  });
});
