import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CommandSparkline } from './command-sparkline';

describe('CommandSparkline', () => {
  it('exposes weekly values in chronological order without changing the trend label', () => {
    render(<CommandSparkline values={[0, 5, 10]} tone="gold" label="المسابقات" />);
    expect(
      screen.getByRole('img', { name: 'المسابقات: مسار 3 أسابيع، الاتجاه صاعد' }),
    ).toHaveAccessibleDescription('من الأقدم إلى الأحدث: 0، 5، 10');
  });

  it('plots weekly counts against the existing zero baseline and padded bounds', () => {
    render(<CommandSparkline values={[0, 2, 1]} tone="azure" label="الأسئلة" />);
    const chart = screen.getByRole('img');
    expect(chart).toHaveAttribute('viewBox', '0 0 132 36');
    expect(chart.querySelector('path')).toHaveAttribute('d', 'M4,32L66,4L128,18');
  });

  it.each([[], [0, 0, 0], [7]])('renders finite geometry for %j', (...values) => {
    render(<CommandSparkline values={values} tone="gold" label="النشاط" />);
    const path = screen.getByRole('img').querySelector('path')?.getAttribute('d');
    expect(path).toBeTruthy();
    expect(path).not.toMatch(/NaN|Infinity/);
  });

  it('keeps descriptions separate when multiple charts appear together', () => {
    render(
      <>
        <CommandSparkline values={[1, 2]} tone="gold" label="الأول" />
        <CommandSparkline values={[4, 3]} tone="azure" label="الثاني" />
      </>,
    );
    const charts = screen.getAllByRole('img');
    expect(charts[0]).toHaveAccessibleDescription('من الأقدم إلى الأحدث: 1، 2');
    expect(charts[1]).toHaveAccessibleDescription('من الأقدم إلى الأحدث: 4، 3');
    expect(charts[0].getAttribute('aria-describedby')).not.toBe(
      charts[1].getAttribute('aria-describedby'),
    );
  });
});
