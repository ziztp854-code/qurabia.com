import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { QuestionImageField } from './question-image-field';

describe('QuestionImageField', () => {
  it('shows an existing image and marks it for removal', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <QuestionImageField initialImageUrl="https://example.com/question.png" />,
    );

    expect(screen.getByRole('img', { name: 'معاينة صورة السؤال' })).toHaveAttribute(
      'src',
      'https://example.com/question.png',
    );

    await user.click(screen.getByRole('button', { name: /حذف الصورة/ }));

    expect(screen.queryByRole('img', { name: 'معاينة صورة السؤال' })).not.toBeInTheDocument();
    expect(container.querySelector<HTMLInputElement>('input[name="removeImage"]')?.value).toBe(
      'true',
    );
  });
});
