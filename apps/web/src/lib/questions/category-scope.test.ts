import { describe, expect, it } from 'vitest';
import { categoryScopeNeedsSubtree, loadCategorySubtreeIds } from './category-scope';
import type { CategoryRow } from './category-tree';

function fakePrisma(rows: CategoryRow[]) {
  return {
    category: {
      findMany: async () => rows,
    },
  };
}

const rows: CategoryRow[] = [
  {
    id: 'root-geo',
    name: 'جغرافيا',
    slug: null,
    description: null,
    icon: null,
    position: 0,
    isActive: true,
    parentId: null,
  },
  {
    id: 'child-saudi',
    name: 'جغرافيا السعودية',
    slug: null,
    description: null,
    icon: null,
    position: 0,
    isActive: true,
    parentId: 'root-geo',
  },
  {
    id: 'grandchild-cities',
    name: 'مدن',
    slug: null,
    description: null,
    icon: null,
    position: 0,
    isActive: true,
    parentId: 'child-saudi',
  },
  {
    id: 'other-history',
    name: 'تاريخ',
    slug: null,
    description: null,
    icon: null,
    position: 1,
    isActive: true,
    parentId: null,
  },
];

describe('categoryScopeNeedsSubtree', () => {
  it('requires a subtree lookup only for real categories with includeDescendants', () => {
    expect(categoryScopeNeedsSubtree('root-geo', true)).toBe(true);
    expect(categoryScopeNeedsSubtree('root-geo', false)).toBe(false);
    expect(categoryScopeNeedsSubtree('ALL', true)).toBe(false);
    expect(categoryScopeNeedsSubtree('UNCATEGORIZED', true)).toBe(false);
  });
});

describe('loadCategorySubtreeIds', () => {
  it('returns the category and every descendant across levels', async () => {
    const ids = await loadCategorySubtreeIds(fakePrisma(rows), 'root-geo');
    expect(ids).toEqual(['root-geo', 'child-saudi', 'grandchild-cities']);
  });

  it('returns only the category itself when it has no children', async () => {
    const ids = await loadCategorySubtreeIds(fakePrisma(rows), 'other-history');
    expect(ids).toEqual(['other-history']);
  });

  it('returns just the category for an unknown id', async () => {
    const ids = await loadCategorySubtreeIds(fakePrisma(rows), 'missing');
    expect(ids).toEqual(['missing']);
  });
});
