import { fireEvent, render, screen } from '@testing-library/react';
import type { LadderRoomSnapshot } from '@tahaddi/domain';
import { describe, expect, it, vi } from 'vitest';
import { LadderReportList } from './report-list';

vi.mock('@/components/games/ladder/ladder-report', () => ({
  LadderReport: ({ room }: { room: LadderRoomSnapshot }) => <div>تقرير {room.roomCode}</div>,
}));

describe('LadderReportList', () => {
  it('unmounts the previous report when another room is selected', () => {
    const rooms = ['FIRST', 'SECOND'].map(
      (roomCode) => ({ roomCode, rightScore: 1, leftScore: 0 }) as LadderRoomSnapshot,
    );
    render(<LadderReportList rooms={rooms} />);
    fireEvent.click(screen.getByRole('button', { name: /FIRST/ }));
    expect(screen.getByText('تقرير FIRST')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /SECOND/ }));
    expect(screen.queryByText('تقرير FIRST')).not.toBeInTheDocument();
    expect(screen.getByText('تقرير SECOND')).toBeInTheDocument();
  });
});
