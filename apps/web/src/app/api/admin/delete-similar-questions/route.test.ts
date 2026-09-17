import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const mocks = vi.hoisted(() => ({
  delete: vi.fn(),
  deleteMany: vi.fn(),
  requireAdminConsole: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock('@/lib/auth/prisma', () => ({
  getPrismaClient: () => ({
    question: { delete: mocks.delete, deleteMany: mocks.deleteMany, updateMany: mocks.updateMany },
  }),
}));

vi.mock('@/lib/auth/session', () => ({ requireAdminConsole: mocks.requireAdminConsole }));

describe('POST /api/admin/delete-similar-questions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateMany.mockResolvedValue({ count: 3 });
  });

  it('archives matched questions and never calls a permanent deletion operation', async () => {
    const response = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ query: ' سؤال مكرر ' }) }));
    const body = await response.json();

    expect(mocks.requireAdminConsole).toHaveBeenCalledOnce();
    expect(mocks.delete).not.toHaveBeenCalled();
    expect(mocks.deleteMany).not.toHaveBeenCalled();
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: {
        prompt: { contains: 'سؤال مكرر', mode: 'insensitive' },
        status: { not: 'ARCHIVED' },
      },
      data: {
        status: 'ARCHIVED',
        archivedAt: expect.any(Date),
        lastEditedAt: expect.any(Date),
      },
    });
    expect(body).toEqual({ message: 'تمت أرشفة الأسئلة المطابقة لعبارة البحث بنجاح.', archivedCount: 3 });
  });

  it('rejects an empty search phrase before changing questions', async () => {
    const response = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ query: '   ' }) }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'يجب إدخال عبارة بحث غير فارغة.' });
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
});
