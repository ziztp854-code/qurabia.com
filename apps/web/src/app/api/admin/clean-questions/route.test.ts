import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const mocks = vi.hoisted(() => ({
  delete: vi.fn(),
  deleteMany: vi.fn(),
  findMany: vi.fn(),
  requireAdminConsole: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock('@/lib/auth/prisma', () => ({
  getPrismaClient: () => ({
    question: {
      delete: mocks.delete,
      deleteMany: mocks.deleteMany,
      findMany: mocks.findMany,
      updateMany: mocks.updateMany,
    },
  }),
}));

vi.mock('@/lib/auth/session', () => ({ requireAdminConsole: mocks.requireAdminConsole }));

describe('POST /api/admin/clean-questions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMany.mockResolvedValue([{ id: 'non-arabic', source: 'English source' }]);
    mocks.updateMany.mockResolvedValue({ count: 2 });
  });

  it('archives matching questions instead of permanently deleting them', async () => {
    const response = await POST();
    const body = await response.json();

    expect(mocks.requireAdminConsole).toHaveBeenCalledOnce();
    expect(mocks.delete).not.toHaveBeenCalled();
    expect(mocks.deleteMany).not.toHaveBeenCalled();
    expect(mocks.updateMany).toHaveBeenCalledTimes(2);
    expect(mocks.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'ARCHIVED',
          archivedAt: expect.any(Date),
          lastEditedAt: expect.any(Date),
        }),
      }),
    );
    expect(mocks.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { id: { in: ['non-arabic'] }, status: { not: 'ARCHIVED' } },
        data: expect.objectContaining({ status: 'ARCHIVED' }),
      }),
    );
    expect(body).toEqual({ message: 'تمت أرشفة الأسئلة المطابقة بنجاح.', archivedCount: 4 });
  });
});
