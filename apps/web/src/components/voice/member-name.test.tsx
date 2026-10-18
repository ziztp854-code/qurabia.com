import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { MemberName } from './member-name';
it('renders only supplied account badges with accessible labels next to an isolated name', () => {
  const view = render(<MemberName name="سالم" />);
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  view.rerender(<MemberName name="سالم" badges={['verified', 'owner', 'sultan']} />);
  expect(screen.getByRole('img', { name: 'حساب إدارة موثّق' })).toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'مالك المنصة' })).toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'باقة السلطان' })).toBeInTheDocument();
  expect(view.container.querySelector('bdi')).toHaveTextContent('سالم');
});
