import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BrandLogo, BrandMark } from './brand';

describe('Brand identity', () => {
  it('يعرض التاج الهندسي كشعار SVG قابل للتكبير دون رموز تعبيرية', () => {
    const { container } = render(<BrandMark title="تحدي" />);

    expect(screen.getByRole('img', { name: 'تحدي' })).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/[👑🏆]/u);
  });

  it('يعرض الشعار الأفقي والنص الرسمي', () => {
    render(<BrandLogo variant="horizontal" />);

    expect(screen.getByText('تحدي')).toBeInTheDocument();
    expect(screen.getByText('تفاعل، تنافس، تميّز')).toBeInTheDocument();
  });
});
