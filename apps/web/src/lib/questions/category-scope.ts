import { buildCategoryTree, listDescendantIds } from './category-tree';

/** Minimal category-finder surface the loader needs (satisfied by Prisma's client). */
export type CategoryScopeFinder = {
  category: {
    findMany: (args: {
      select: {
        id: true;
        name: true;
        slug: true;
        description: true;
        icon: true;
        position: true;
        isActive: true;
        parentId: true;
      };
    }) => Promise<
      Array<{
        id: string;
        name: string;
        slug: string | null;
        description: string | null;
        icon: string | null;
        position: number;
        isActive: boolean;
        parentId: string | null;
      }>
    >;
  };
};

/**
 * Loads the given category together with all of its descendant ids.
 * Shared by the admin bank API and the admin content page so a category
 * filter with `includeDescendants` behaves identically on both surfaces.
 */
export async function loadCategorySubtreeIds(
  prisma: CategoryScopeFinder,
  categoryId: string,
): Promise<string[]> {
  const rows = await prisma.category.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      icon: true,
      position: true,
      isActive: true,
      parentId: true,
    },
  });
  const tree = buildCategoryTree(rows);
  return [categoryId, ...listDescendantIds(tree, categoryId)];
}

/** True when the filter needs a subtree lookup (not ALL / UNCATEGORIZED). */
export function categoryScopeNeedsSubtree(category: string, includeDescendants: boolean): boolean {
  return category !== 'ALL' && category !== 'UNCATEGORIZED' && includeDescendants;
}
