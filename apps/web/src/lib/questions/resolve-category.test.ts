import { describe, expect, it, vi } from 'vitest';
import { resolveCategoryToCanonicalId } from './resolve-category';

describe('resolveCategoryToCanonicalId', () => {
  it('returns undefined when no category is selected', async () => {
    const prisma = {
      category: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
      },
    };

    await expect(resolveCategoryToCanonicalId(prisma, undefined)).resolves.toBeUndefined();
    expect(prisma.category.findUnique).not.toHaveBeenCalled();
  });

  it('upserts the canonical row for a synonym category', async () => {
    const prisma = {
      category: {
        findUnique: vi.fn().mockResolvedValue({ id: 'alias-1', name: 'فيزياء' }),
        upsert: vi.fn().mockResolvedValue({ id: 'canon-science' }),
      },
    };

    await expect(resolveCategoryToCanonicalId(prisma, 'alias-1')).resolves.toBe('canon-science');
    expect(prisma.category.upsert).toHaveBeenCalledWith({
      where: { name: 'علوم' },
      update: {},
      create: { name: 'علوم' },
    });
  });
});
