import { normalizeCategoryName } from './category-taxonomy';

type CategoryReader = {
  category: {
    findUnique: (args: {
      where: { id: string };
      select: { id: true; name: true };
    }) => Promise<{ id: string; name: string } | null>;
    upsert: (args: {
      where: { name: string };
      update: Record<string, never>;
      create: { name: string };
    }) => Promise<{ id: string }>;
  };
};

/**
 * Point a selected Category row at its canonical name, creating the
 * canonical row when the bank still only has a synonym.
 */
export async function resolveCategoryToCanonicalId(
  prisma: CategoryReader,
  categoryId: string | null | undefined,
): Promise<string | undefined> {
  if (!categoryId) return undefined;

  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { id: true, name: true },
  });
  if (!category) return undefined;

  const canonical = normalizeCategoryName(category.name) ?? category.name;
  if (canonical === category.name) return category.id;

  const target = await prisma.category.upsert({
    where: { name: canonical },
    update: {},
    create: { name: canonical },
  });
  return target.id;
}
