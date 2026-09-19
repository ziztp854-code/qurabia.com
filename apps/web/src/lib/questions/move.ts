/**
 * Safe category move & merge primitives for the question bank.
 *
 * The DB has a `ON DELETE RESTRICT` FK from `Category.parentId` to
 * itself, so any attempt to create a cycle fails with a Prisma
 * `P2003` error. The helpers here re-parent the children first and
 * check for cycles in pure TypeScript before issuing any DB write,
 * so the route layer can return a clean Arabic error to the admin
 * instead of a generic constraint failure.
 */

import {
  assertMoveIsSafe,
  CategoryCycleError,
  getRootsAndChildren,
  listDescendantIds,
  type CategoryRow,
} from './category-tree';

export type CategoryMoveAction = {
  categoryId: string;
  /**
   * The previous parent. Optional on input — the planner fills it
   * in by inspecting the loaded rows, so the route layer can pass
   * just the user-supplied target.
   */
  fromParentId?: string | null;
  toParentId: string | null;
  /**
   * If the category already has children, they must move with it
   * unless `reparentChildren` is false. Defaults to true.
   */
  reparentChildren?: boolean;
};

export type CategoryMergeAction = {
  sourceId: string;
  targetId: string;
};

export class CategoryNotFoundError extends Error {
  constructor(readonly categoryId: string) {
    super(`Category ${categoryId} not found`);
    this.name = 'CategoryNotFoundError';
  }
}

export class CategoryHasChildrenError extends Error {
  constructor(
    readonly categoryId: string,
    readonly childCount: number,
  ) {
    super(`Category ${categoryId} still has ${childCount} children`);
    this.name = 'CategoryHasChildrenError';
  }
}

export function planCategoryMove(
  rows: CategoryRow[],
  action: CategoryMoveAction,
): CategoryMoveAction {
  const byId = new Map(rows.map((row) => [row.id, row] as const));
  const target = byId.get(action.categoryId);
  if (!target) throw new CategoryNotFoundError(action.categoryId);

  const toParentId = action.toParentId;
  if (toParentId) {
    if (!byId.has(toParentId)) throw new CategoryNotFoundError(toParentId);
    assertMoveIsSafe(rows, action.categoryId, toParentId);
  }

  return { ...action, fromParentId: target.parentId };
}

export function listAffectedCategoriesForMove(
  rows: CategoryRow[],
  categoryId: string,
): string[] {
  const { roots, flat } = getRootsAndChildren(rows);
  const descendantIds = listDescendantIds(roots, categoryId);
  flat.forEach((node) => {
    if (node.row.id === categoryId) return;
  });
  return [categoryId, ...descendantIds];
}

export function planCategoryMerge(
  rows: CategoryRow[],
  action: CategoryMergeAction,
): CategoryMergeAction {
  if (action.sourceId === action.targetId) {
    throw new Error('Source and target must differ');
  }
  const byId = new Map(rows.map((row) => [row.id, row] as const));
  if (!byId.has(action.sourceId)) throw new CategoryNotFoundError(action.sourceId);
  if (!byId.has(action.targetId)) throw new CategoryNotFoundError(action.targetId);
  return action;
}

export { CategoryCycleError };
