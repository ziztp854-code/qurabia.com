import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BuildingActivity } from './building-activity';

const now = 1800000000000;
const props = { name: 'دار الحكم', level: 1, serverNow: now, x: 50, y: 34 };
const build = { building: 'hall' as const, level: 2, startedAt: now - 30000, endsAt: now + 30000 };

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('building activity', () => {
  it('anchors progress to server timestamps even when the device clock is wrong', () => {
    vi.spyOn(Date, 'now').mockReturnValue(0);
    render(<BuildingActivity {...props} build={build} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
    expect(screen.getByLabelText('الوقت المتبقي لبناء دار الحكم')).toHaveTextContent('00:00:30');
  });

  it('waits for a server level update after the countdown expires and cleans up its timer', () => {
    vi.useFakeTimers();
    let elapsed = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => elapsed);
    const { rerender, unmount } = render(<BuildingActivity {...props} build={build} />);
    act(() => {
      elapsed = 30000;
      vi.advanceTimersByTime(30000);
    });
    expect(screen.getByText('بانتظار تأكيد الاكتمال')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    rerender(<BuildingActivity {...props} level={2} serverNow={now + 30000} />);
    expect(screen.getByRole('status')).toHaveTextContent('اكتمل دار الحكم');
    act(() => vi.advanceTimersByTime(4000));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('re-synchronizes when a fresh server snapshot arrives', () => {
    const { rerender } = render(<BuildingActivity {...props} build={build} />);
    rerender(<BuildingActivity {...props} serverNow={now + 15000} build={build} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '75');
  });

  it('supports old saved jobs without inventing a start time or percentage', () => {
    render(
      <BuildingActivity {...props} build={{ building: 'hall', level: 2, endsAt: now + 30000 }} />,
    );
    expect(screen.getByText('جارٍ البناء')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('celebrates the highest stage and the maximum level when a building tops out', () => {
    vi.useFakeTimers();
    let elapsed = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => elapsed);
    const { rerender } = render(<BuildingActivity {...props} build={build} />);
    act(() => {
      elapsed = 30000;
      vi.advanceTimersByTime(30000);
    });
    rerender(
      <BuildingActivity
        {...props}
        level={20}
        stageName="المرحلة العليا"
        atMaxLevel
        serverNow={now + 30000}
      />,
    );
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('اكتمل دار الحكم');
    expect(status).toHaveTextContent('المرحلة العليا');
    expect(status).toHaveTextContent('الحد الأعلى');
    expect(status).toHaveAttribute('data-top', 'true');
  });

  it('does not celebrate an already completed building on initial load', () => {
    const { container } = render(<BuildingActivity {...props} level={8} />);
    expect(container).toBeEmptyDOMElement();
  });
});
