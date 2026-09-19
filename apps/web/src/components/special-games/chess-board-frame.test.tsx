import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ChessBoardFrame } from './chess-board-frame';
import { ChessBoardSpecimen } from './chess-board-specimen';

describe('ChessBoardFrame', () => {
  it('builds a minimal coal frame with one simple coordinate axis', () => {
    const { container } = render(
      <div data-game="chess">
        <ChessBoardFrame flipped>
          <div className="chess-board" />
        </ChessBoardFrame>
      </div>,
    );

    const frame = container.querySelector('.chess-board-frame');
    expect(frame).toHaveAttribute('data-material', 'coal');
    expect(frame).toHaveAttribute('data-coordinates', 'visible');
    expect(container.querySelectorAll('.chess-board-frame__file')).toHaveLength(8);
    expect(container.querySelectorAll('.chess-board-frame__rank')).toHaveLength(8);
    expect(container.querySelector('.chess-board-frame__coordinates--start')).toHaveTextContent(
      '12345678',
    );
    expect(container.querySelector('.chess-board-frame__coordinates--bottom')).toHaveTextContent(
      'hgfedcba',
    );
    expect(container.querySelector('.chess-board-frame__coordinates--top')).toBeNull();
    expect(container.querySelector('.chess-board-frame__inner-bevel')).toBeNull();
  });
});

describe('ChessBoardSpecimen', () => {
  it('renders a square 8×8 board with the shared SVG piece set', () => {
    render(<ChessBoardSpecimen />);

    const board = screen.getByLabelText('رقعة الشطرنج الكلاسيكية');
    expect(board).toHaveAttribute('dir', 'ltr');
    expect(board).toHaveClass('chess-board--classic');
    expect(board.querySelectorAll('.chess-square')).toHaveLength(64);
    expect(board.querySelectorAll('.chess-piece-model')).toHaveLength(32);
    expect(board.querySelectorAll('.chess-board__coord')).toHaveLength(0);
    expect(
      board.closest('.chess-board-frame')?.querySelectorAll('.chess-board-frame__file'),
    ).toHaveLength(8);
    expect(
      board.closest('.chess-board-frame')?.querySelectorAll('.chess-board-frame__rank'),
    ).toHaveLength(8);
    expect(board.closest('.chess-board-frame')).not.toBeNull();
  });

  it('uses one roving tab stop with complete grid, row, and gridcell semantics', () => {
    render(<ChessBoardSpecimen selectedSquare="b8" legalSquares={['b7']} />);

    const board = screen.getByRole('grid', { name: 'رقعة الشطرنج الكلاسيكية' });
    const rows = within(board).getAllByRole('row');
    const cells = within(board).getAllByRole('gridcell');
    const squares = Array.from(board.querySelectorAll<HTMLButtonElement>('.chess-square'));

    expect(rows).toHaveLength(8);
    expect(cells).toHaveLength(64);
    expect(squares.filter((square) => square.tabIndex === 0)).toHaveLength(1);
    expect(screen.getByRole('gridcell', { name: /أسود الحصان في b8/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('button', { name: /b7، نقلة قانونية/ })).toBeInTheDocument();
  });

  it('moves focus visually with arrows and activates a square with Enter or Space', async () => {
    const user = userEvent.setup();
    const onSquareActivate = vi.fn();
    const { unmount } = render(<ChessBoardSpecimen onSquareActivate={onSquareActivate} />);
    const board = screen.getByRole('grid', { name: 'رقعة الشطرنج الكلاسيكية' });
    const a8 = board.querySelector<HTMLButtonElement>('[data-square="a8"]')!;
    const b8 = board.querySelector<HTMLButtonElement>('[data-square="b8"]')!;
    const b7 = board.querySelector<HTMLButtonElement>('[data-square="b7"]')!;

    expect(a8).toHaveAttribute('tabindex', '0');
    a8.focus();
    fireEvent.keyDown(a8, { key: 'ArrowRight' });
    expect(b8).toHaveFocus();
    fireEvent.keyDown(b8, { key: 'ArrowDown' });
    expect(b7).toHaveFocus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onSquareActivate).toHaveBeenNthCalledWith(1, 'b7');
    expect(onSquareActivate).toHaveBeenNthCalledWith(2, 'b7');

    unmount();
    render(<ChessBoardSpecimen flipped onSquareActivate={onSquareActivate} />);
    const flippedBoard = screen.getByRole('grid', { name: 'رقعة الشطرنج الكلاسيكية' });
    const h1 = flippedBoard.querySelector<HTMLButtonElement>('[data-square="h1"]')!;
    const g1 = flippedBoard.querySelector<HTMLButtonElement>('[data-square="g1"]')!;
    expect(h1).toHaveAttribute('tabindex', '0');
    h1.focus();
    fireEvent.keyDown(h1, { key: 'ArrowRight' });
    expect(g1).toHaveFocus();
  });
});
