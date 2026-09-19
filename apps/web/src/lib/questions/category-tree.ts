/**
 * Category tree utilities for the question bank.
 *
 * The bank stores categories as a flat list with `parentId`. These
 * helpers turn that list into the structures the admin UI and the
 * public catalog actually need: a forest of trees, depth-aware
 * ancestors, descendant sets, and safe move / merge operations.
 *
 * All helpers are pure: they never touch Prisma. Routes and the
 * admin UI pass in the rows they have already loaded; this module
 * returns the operations to perform. The route layer persists the
 * result inside a transaction.
 */

export type CategoryRow = {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  icon: string | null;
  position: number;
  isActive: boolean;
  parentId: string | null;
};

export type CategoryNode = {
  row: CategoryRow;
  depth: number;
  children: CategoryNode[];
  /** Total number of leaf descendants (categories with no children). */
  leafCount: number;
  /** Total number of descendants at every level. */
  descendantCount: number;
};

export type CategoryTreeStats = {
  total: number;
  rootCount: number;
  maxDepth: number;
  orphans: string[];
};

export function buildCategoryTree(rows: CategoryRow[]): CategoryNode[] {
  const byId = new Map<string, CategoryNode>();
  for (const row of rows) {
    byId.set(row.id, { row, depth: 0, children: [], leafCount: 0, descendantCount: 0 });
  }

  const roots: CategoryNode[] = [];
  const childrenByParent = new Map<string, CategoryNode[]>();

  for (const node of byId.values()) {
    const parentId = node.row.parentId;
    if (!parentId || !byId.has(parentId)) {
      roots.push(node);
      continue;
    }
    const list = childrenByParent.get(parentId) ?? [];
    list.push(node);
    childrenByParent.set(parentId, list);
  }

  // Deterministic ordering: position ascending, then name as tiebreaker.
  const byPosition = (a: CategoryNode, b: CategoryNode): number => {
    if (a.row.position !== b.row.position) return a.row.position - b.row.position;
    return a.row.name.localeCompare(b.row.name, 'ar');
  };

  const attach = (node: CategoryNode, depth: number) => {
    const list = (childrenByParent.get(node.row.id) ?? []).sort(byPosition);
    node.children = list;
    node.depth = depth;
    let descendantCount = 0;
    let leafCount = 0;
    for (const child of list) {
      attach(child, depth + 1);
      descendantCount += 1 + child.descendantCount;
      leafCount += child.leafCount + (child.children.length === 0 ? 1 : 0);
    }
    node.descendantCount = descendantCount;
    node.leafCount = leafCount;
  };

  for (const root of [...roots].sort(byPosition)) {
    attach(root, 0);
  }

  return roots.sort(byPosition);
}

export function flattenCategoryTree(roots: CategoryNode[]): CategoryNode[] {
  const flat: CategoryNode[] = [];
  const visit = (node: CategoryNode) => {
    flat.push(node);
    for (const child of node.children) visit(child);
  };
  for (const root of roots) visit(root);
  return flat;
}

export function findCategoryNode(
  roots: CategoryNode[],
  categoryId: string,
): CategoryNode | null {
  for (const root of roots) {
    const found = findInSubtree(root, categoryId);
    if (found) return found;
  }
  return null;
}

function findInSubtree(node: CategoryNode, id: string): CategoryNode | null {
  if (node.row.id === id) return node;
  for (const child of node.children) {
    const found = findInSubtree(child, id);
    if (found) return found;
  }
  return null;
}

export function listAncestorIds(
  rows: CategoryRow[],
  categoryId: string,
): string[] {
  const byId = new Map(rows.map((row) => [row.id, row] as const));
  const ids: string[] = [];
  let current = byId.get(categoryId);
  const seen = new Set<string>();
  while (current && current.parentId && !seen.has(current.parentId)) {
    seen.add(current.parentId);
    ids.push(current.parentId);
    current = byId.get(current.parentId);
  }
  return ids;
}

export function listDescendantIds(
  roots: CategoryNode[],
  categoryId: string,
): string[] {
  const node = findCategoryNode(roots, categoryId);
  if (!node) return [];
  const ids: string[] = [];
  const visit = (child: CategoryNode) => {
    ids.push(child.row.id);
    for (const grand of child.children) visit(grand);
  };
  for (const child of node.children) visit(child);
  return ids;
}

export function isAncestor(
  rows: CategoryRow[],
  candidateAncestorId: string,
  descendantId: string,
): boolean {
  if (candidateAncestorId === descendantId) return false;
  return listAncestorIds(rows, descendantId).includes(candidateAncestorId);
}

/**
 * Throws when moving `categoryId` under `newParentId` would create a
 * cycle. The caller is expected to handle the thrown error and
 * surface it to the UI as a friendly Arabic message.
 */
export class CategoryCycleError extends Error {
  constructor(readonly categoryId: string, readonly newParentId: string) {
    super(`Moving ${categoryId} under ${newParentId} would create a cycle.`);
    this.name = 'CategoryCycleError';
  }
}

export function assertMoveIsSafe(
  rows: CategoryRow[],
  categoryId: string,
  newParentId: string | null,
): void {
  if (newParentId === null) return;
  if (newParentId === categoryId) {
    throw new CategoryCycleError(categoryId, newParentId);
  }
  if (isAncestor(rows, categoryId, newParentId)) {
    throw new CategoryCycleError(categoryId, newParentId);
  }
}

export function computeTreeStats(roots: CategoryNode[]): CategoryTreeStats {
  const flat = flattenCategoryTree(roots);
  const maxDepth = flat.reduce((max, node) => Math.max(max, node.depth), 0);
  return {
    total: flat.length,
    rootCount: roots.length,
    maxDepth,
    orphans: flat.filter((node) => node.depth === 0 && node.row.parentId !== null)
      .filter((node) => node.row.parentId && !flat.some((other) => other.row.id === node.row.parentId))
      .map((node) => node.row.id),
  };
}

export function formatCategoryPath(rows: CategoryRow[], categoryId: string): string {
  const byId = new Map(rows.map((row) => [row.id, row] as const));
  const names: string[] = [];
  const seen = new Set<string>();
  let current = byId.get(categoryId);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    names.unshift(current.name);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return names.join(' › ');
}

export function getRootsAndChildren(rows: CategoryRow[]): {
  roots: CategoryNode[];
  flat: CategoryNode[];
} {
  const roots = buildCategoryTree(rows);
  return { roots, flat: flattenCategoryTree(roots) };
}
