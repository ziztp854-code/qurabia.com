import { describe, expect, it } from 'vitest';

import {
  assertMoveIsSafe,
  buildCategoryTree,
  CategoryCycleError,
  computeTreeStats,
  findCategoryNode,
  flattenCategoryTree,
  formatCategoryPath,
  isAncestor,
  listAncestorIds,
  listDescendantIds,
  type CategoryRow,
} from './category-tree';

function row(
  id: string,
  parentId: string | null,
  overrides: Partial<CategoryRow> = {},
): CategoryRow {
  return {
    id,
    parentId,
    name: id,
    slug: id.toLowerCase(),
    description: null,
    icon: null,
    position: 0,
    isActive: true,
    ...overrides,
  };
}

describe('buildCategoryTree', () => {
  it('builds a forest with deterministic ordering', () => {
    const rows: CategoryRow[] = [
      row('history', null, { name: 'تاريخ', position: 2 }),
      row('science', null, { name: 'علوم', position: 1 }),
      row('modern', 'history', { name: 'تاريخ حديث', position: 0 }),
      row('ancient', 'history', { name: 'تاريخ قديم', position: 1 }),
      row('biology', 'science', { name: 'أحياء', position: 0 }),
    ];
    const roots = buildCategoryTree(rows);
    expect(roots.map((node) => node.row.name)).toEqual(['علوم', 'تاريخ']);
    const history = roots[1]!;
    expect(history.children.map((child) => child.row.name)).toEqual(['تاريخ حديث', 'تاريخ قديم']);
    expect(history.depth).toBe(0);
    expect(history.children[0]!.depth).toBe(1);
    expect(history.children[0]!.children).toEqual([]);
    expect(history.descendantCount).toBe(2);
    expect(history.leafCount).toBe(2);
    expect(history.children[0]!.descendantCount).toBe(0);
  });

  it('treats orphan parentIds as roots instead of dropping the row', () => {
    const rows: CategoryRow[] = [
      row('a', null),
      row('b', 'a'),
      row('c', 'missing-parent'),
    ];
    const roots = buildCategoryTree(rows);
    expect(roots.map((node) => node.row.id).sort()).toEqual(['a', 'c']);
  });

  it('computes aggregate counts across deep trees', () => {
    const rows: CategoryRow[] = [
      row('root', null),
      row('a', 'root'),
      row('a1', 'a'),
      row('a2', 'a'),
      row('b1', 'a1'),
    ];
    const flat = flattenCategoryTree(buildCategoryTree(rows));
    const root = flat.find((n) => n.row.id === 'root')!;
    expect(root.descendantCount).toBe(4);
    // Leaves in the root subtree: b1 and a2.
    expect(root.leafCount).toBe(2);
    const a = flat.find((n) => n.row.id === 'a')!;
    // Leaves in a's subtree: b1 and a2.
    expect(a.leafCount).toBe(2);
    const a1 = flat.find((n) => n.row.id === 'a1')!;
    expect(a1.leafCount).toBe(1);
  });
});

describe('isAncestor / listAncestorIds / listDescendantIds', () => {
  const rows: CategoryRow[] = [
    row('root', null),
    row('mid', 'root'),
    row('leaf', 'mid'),
    row('other', 'root'),
  ];

  it('detects ancestors correctly', () => {
    expect(isAncestor(rows, 'root', 'leaf')).toBe(true);
    expect(isAncestor(rows, 'mid', 'leaf')).toBe(true);
    expect(isAncestor(rows, 'other', 'leaf')).toBe(false);
    expect(isAncestor(rows, 'leaf', 'root')).toBe(false);
    expect(isAncestor(rows, 'leaf', 'leaf')).toBe(false);
  });

  it('returns the chain of ancestors from the closest to the root', () => {
    expect(listAncestorIds(rows, 'leaf')).toEqual(['mid', 'root']);
    expect(listAncestorIds(rows, 'root')).toEqual([]);
  });

  it('lists descendant ids with deduplication', () => {
    const roots = buildCategoryTree(rows);
    expect(listDescendantIds(roots, 'root').sort()).toEqual(['leaf', 'mid', 'other']);
    expect(listDescendantIds(roots, 'leaf')).toEqual([]);
  });
});

describe('assertMoveIsSafe', () => {
  const rows: CategoryRow[] = [
    row('root', null),
    row('mid', 'root'),
    row('leaf', 'mid'),
  ];

  it('rejects self-parenting', () => {
    expect(() => assertMoveIsSafe(rows, 'leaf', 'leaf')).toThrow(CategoryCycleError);
  });

  it('rejects moves that would create a cycle', () => {
    expect(() => assertMoveIsSafe(rows, 'root', 'leaf')).toThrow(CategoryCycleError);
    expect(() => assertMoveIsSafe(rows, 'mid', 'leaf')).toThrow(CategoryCycleError);
  });

  it('accepts valid moves to roots or unrelated branches', () => {
    expect(() => assertMoveIsSafe(rows, 'leaf', null)).not.toThrow();
    expect(() => assertMoveIsSafe(rows, 'leaf', 'root')).not.toThrow();
  });
});

describe('formatCategoryPath', () => {
  it('renders an Arabic breadcrumb from root to leaf', () => {
    const rows: CategoryRow[] = [
      row('r', null, { name: 'تاريخ' }),
      row('m', 'r', { name: 'إسلامي' }),
      row('l', 'm', { name: 'حديث' }),
    ];
    expect(formatCategoryPath(rows, 'l')).toBe('تاريخ › إسلامي › حديث');
  });
});

describe('findCategoryNode / computeTreeStats', () => {
  it('finds a deep node by id', () => {
    const rows: CategoryRow[] = [
      row('a', null),
      row('b', 'a'),
      row('c', 'b'),
    ];
    const node = findCategoryNode(buildCategoryTree(rows), 'c');
    expect(node?.depth).toBe(2);
  });

  it('returns null for unknown ids', () => {
    const rows: CategoryRow[] = [row('a', null)];
    expect(findCategoryNode(buildCategoryTree(rows), 'zzz')).toBeNull();
  });

  it('summarises the tree', () => {
    const rows: CategoryRow[] = [
      row('a', null),
      row('b', 'a'),
      row('c', 'b'),
    ];
    const stats = computeTreeStats(buildCategoryTree(rows));
    expect(stats).toMatchObject({ total: 3, rootCount: 1, maxDepth: 2 });
  });
});
