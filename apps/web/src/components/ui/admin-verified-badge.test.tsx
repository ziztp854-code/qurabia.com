import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AdminVerifiedBadge } from './admin-verified-badge';

describe('AdminVerifiedBadge', () => {
  it('يقدم وصفًا واضحًا للتقنيات المساعدة', () => {
    render(<AdminVerifiedBadge />);

    expect(screen.getByLabelText('مدير موثّق')).toHaveAttribute('title', 'مدير موثّق');
  });
});
