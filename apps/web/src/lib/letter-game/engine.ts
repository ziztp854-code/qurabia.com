import type { BoardCell, GameBoard, TeamId } from './types';

const EVEN_ROW_DIRECTIONS = [
  [-1, -1],
  [-1, 0],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
] as const;

const ODD_ROW_DIRECTIONS = [
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, 0],
  [1, 1],
] as const;

export function createLetterBoard(letters: readonly string[], rows = 5, columns = 5): GameBoard {
  if (
    !Number.isFinite(rows) ||
    !Number.isFinite(columns) ||
    !Number.isInteger(rows) ||
    !Number.isInteger(columns) ||
    rows < 1 ||
    columns < 1 ||
    letters.length < rows * columns
  ) {
    throw new Error('عدد الحروف لا يكفي لبناء اللوحة المطلوبة.');
  }

  return {
    rows,
    columns,
    cells: Array.from({ length: rows * columns }, (_, index) => ({
      id: `${Math.floor(index / columns)}:${index % columns}`,
      row: Math.floor(index / columns),
      column: index % columns,
      letter: letters[index] ?? '',
      owner: null,
    })),
  };
}

export function getCell(board: GameBoard, cellId: string): BoardCell | undefined {
  return board.cells.find((cell) => cell.id === cellId);
}

export function getHexNeighborIds(board: GameBoard, cellId: string): string[] {
  const cell = getCell(board, cellId);
  if (!cell) return [];

  const directions = cell.row % 2 === 0 ? EVEN_ROW_DIRECTIONS : ODD_ROW_DIRECTIONS;
  return directions
    .map(([rowDelta, columnDelta]) => `${cell.row + rowDelta}:${cell.column + columnDelta}`)
    .filter((candidateId) => getCell(board, candidateId) !== undefined);
}

export function claimCell(board: GameBoard, cellId: string, team: TeamId): GameBoard {
  const target = getCell(board, cellId);
  if (!target) throw new Error('الخلية غير موجودة.');
  if (target.owner) throw new Error('هذه الخلية مملوكة بالفعل.');

  return {
    ...board,
    cells: board.cells.map((cell) => (cell.id === cellId ? { ...cell, owner: team } : cell)),
  };
}

export function switchTeam(team: TeamId): TeamId {
  return team === 'green' ? 'orange' : 'green';
}

function isStartCell(board: GameBoard, cell: BoardCell, team: TeamId) {
  return team === 'orange' ? cell.column === board.columns - 1 : cell.row === 0;
}

function isGoalCell(board: GameBoard, cell: BoardCell, team: TeamId) {
  return team === 'orange' ? cell.column === 0 : cell.row === board.rows - 1;
}

export function findWinningPath(board: GameBoard, team: TeamId): string[] | null {
  const starts = board.cells.filter(
    (cell) => cell.owner === team && isStartCell(board, cell, team),
  );
  const queue = starts.map((cell) => cell.id);
  const parents = new Map<string, string | null>(starts.map((cell) => [cell.id, null]));

  for (let head = 0; head < queue.length; head += 1) {
    const currentId = queue[head];
    if (!currentId) continue;
    const current = getCell(board, currentId);
    if (!current) continue;

    if (isGoalCell(board, current, team)) {
      const path: string[] = [];
      let cursor: string | null = currentId;
      while (cursor !== null) {
        path.push(cursor);
        cursor = parents.get(cursor) ?? null;
      }
      return path.reverse();
    }

    for (const neighborId of getHexNeighborIds(board, currentId)) {
      if (parents.has(neighborId)) continue;
      if (getCell(board, neighborId)?.owner !== team) continue;
      parents.set(neighborId, currentId);
      queue.push(neighborId);
    }
  }

  return null;
}

export function isWinningPath(board: GameBoard, team: TeamId, path: readonly string[]): boolean {
  if (path.length === 0) return false;
  const cells = path.map((id) => getCell(board, id));
  const first = cells[0];
  const last = cells.at(-1);
  if (!first || !last || !isStartCell(board, first, team) || !isGoalCell(board, last, team)) {
    return false;
  }
  if (cells.some((cell) => cell?.owner !== team)) return false;

  return path.every(
    (cellId, index) =>
      index === 0 || getHexNeighborIds(board, path[index - 1] ?? '').includes(cellId),
  );
}
