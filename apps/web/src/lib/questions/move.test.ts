import { describe, expect, it } from 'vitest';

import {
  CategoryCycleError,
  listAffectedCategoriesForMove,
  planCategoryMerge,
  planCategoryMove,
} from './move';
import type { CategoryRow } from './category-tree';

function row(id: string, parentId: string | null): CategoryRow {
  return {
    id,
    parentId,
    name: id,
    slug: id,
    description: null,
    icon: null,
    position: 0,
    isActive: true,
  };
}

describe('planCategoryMove', () => {
  const rows: CategoryRow[] = [
    row('root', null),
    row('mid', 'root'),
    row('leaf', 'mid'),
    row('other', 'root'),
  ];

  it('returns the planned move when valid', () => {
    const plan = planCategoryMove(rows, { categoryId: 'leaf', toParentId: 'other' });
    expect(plan.fromParentId).toBe('mid');
    expect(plan.toParentId).toBe('other');
  });

  it('refuses to create a cycle', () => {
    expect(() =>
      planCategoryMove(rows, { categoryId: 'root', toParentId: 'leaf' }),
    ).toThrow(CategoryCycleError);
  });

  it('refuses to point a node at itself', () => {
    expect(() =>
      planCategoryMove(rows, { categoryId: 'leaf', toParentId: 'leaf' }),
    ).toThrow(CategoryCycleError);
  });

  it('refuses unknown target ids', () => {
    expect(() =>
      planCategoryMove(rows, { categoryId: 'leaf', toParentId: 'unknown' }),
    ).toThrow(/not found/i);
  });
});

describe('listAffectedCategoriesForMove', () => {
  it('returns the moved node plus its descendants', () => {
    const rows: CategoryRow[] = [
      row('root', null),
      row('mid', 'root'),
      row('leaf', 'mid'),
      row('grand', 'leaf'),
    ];
    const affected = listAffectedCategoriesForMove(rows, 'mid');
    expect(affected.sort()).toEqual(['grand', 'leaf', 'mid']);
  });
});

describe('planCategoryMerge', () => {
  it('rejects merging a category into itself', () => {
    expect(() =>
      planCategoryMerge([row('a', null)], { sourceId: 'a', targetId: 'a' }),
    ).toThrow();
  });

  it('returns the plan when both ids exist', () => {
    const rows: CategoryRow[] = [row('a', null), row('b', null)];
    expect(planCategoryMerge(rows, { sourceId: 'a', targetId: 'b' })).toEqual({
      sourceId: 'a',
      targetId: 'b',
    });
  });

  it('rejects unknown ids', () => {
    const rows: CategoryRow[] = [row('a', null)];
    expect(() => planCategoryMerge(rows, { sourceId: 'a', targetId: 'missing' })).toThrow();
  });
});
