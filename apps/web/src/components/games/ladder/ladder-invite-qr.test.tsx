import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LadderInviteQr } from './ladder-invite-qr';

describe('LadderInviteQr', () => {
  it('renders an accessible QR code for the current room invitation', () => {
    const { rerender } = render(
      <LadderInviteQr inviteUrl="https://qurabia.com/games/ladder/join/ABCDEFGH" roomCode="ABCDEFGH" />,
    );
    const image = screen.getByRole('img', { name: 'رمز مسح للانضمام إلى غرفة السلم ABCDEFGH' });
    expect(image).toHaveAttribute('viewBox');
    const paths = image.querySelectorAll('path');
    expect(paths[0]).toHaveAttribute('fill', 'var(--qr-paper, #ffffff)');
    expect(paths[1]).toHaveAttribute('fill', 'var(--qr-ink, #111827)');
    expect(image).toHaveStyle({ backgroundColor: 'var(--qr-paper, #ffffff)' });
    const firstImage = image.innerHTML;
    rerender(<LadderInviteQr inviteUrl="https://qurabia.com/games/ladder/join/12345678" roomCode="12345678" />);
    expect(screen.getByRole('img', { name: 'رمز مسح للانضمام إلى غرفة السلم 12345678' }).innerHTML).not.toBe(firstImage);
    expect(screen.getByText('امسح الرمز بكاميرا الجوال للانضمام')).toBeInTheDocument();
  });

  it('shows a loading message instead of encoding an empty address', () => {
    render(<LadderInviteQr inviteUrl="" roomCode="ABCDEFGH" />);
    expect(screen.getByRole('status')).toHaveTextContent('جارٍ تجهيز رمز الدخول');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
