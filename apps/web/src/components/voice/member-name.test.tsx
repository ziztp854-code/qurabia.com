import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { MemberName } from './member-name';
it('renders only supplied account badges with accessible labels next to an isolated name', () => {
  const view = render(<MemberName name="سالم" />);
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  view.rerender(<MemberName name="سالم" badges={['verified', 'owner', 'sultan']} />);
  expect(screen.getByRole('img', { name: 'مالك المنصة موثّق' })).toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'مالك المنصة' })).toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'باقة السلطان' })).toBeInTheDocument();
  expect(view.container.querySelector('bdi')).toHaveTextContent('سالم');
});

it('does not show verification for a subscription or a verification flag without a platform role', () => {
  const { rerender } = render(<MemberName name="عضو" badges={['sultan']} />);
  expect(screen.queryByRole('img', { name: /موثّق/ })).not.toBeInTheDocument();
  rerender(<MemberName name="عضو" badges={['verified']} />);
  expect(screen.queryByRole('img', { name: /موثّق/ })).not.toBeInTheDocument();
  rerender(<MemberName name="مشرف" badges={['verified', 'admin']} />);
  expect(screen.getByRole('img', { name: 'حساب إدارة موثّق' })).toBeInTheDocument();
});

it('shows the authoritative account number and granted primary badge', () => {
  const identity = {
    userId: 'server-user', accountNumber: 123456789, name: 'سالم', username: null, avatarUrl: null,
    badges: [], frame: null, effect: null,
    primaryBadge: { id: 'supporter', name: 'الداعم', description: '', category: '', rarity: '', assetUrl: null, sensitive: false, archived: false, effectId: null, frameId: null },
  };
  render(<MemberName name="سالم" identity={identity} />);
  expect(screen.getByText('ID 123456789')).toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'الداعم' })).toBeInTheDocument();
  expect(screen.queryByRole('img', { name: 'مالك المنصة' })).not.toBeInTheDocument();
});
