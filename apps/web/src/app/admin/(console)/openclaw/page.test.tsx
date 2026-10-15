import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ actor: vi.fn(), redirect: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ requireAdminConsole: mocks.actor }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('./approval-panel', () => ({ ApprovalPanel: () => null }));
import Page from './page';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.redirect.mockImplementation(() => { throw new Error('redirect'); });
});

describe('OpenClaw approval page', () => {
  it('requires a freshly verified OWNER session', async () => {
    mocks.actor.mockResolvedValue({ role: 'OWNER' });
    expect(await Page()).toBeTruthy();
    expect(mocks.actor).toHaveBeenCalledWith('/admin/openclaw');
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it.each(['ADMIN', 'CONTENT_EDITOR', 'USER'])('blocks %s', async (role) => {
    mocks.actor.mockResolvedValue({ role });
    await expect(Page()).rejects.toThrow('redirect');
    expect(mocks.redirect).toHaveBeenCalledWith('/forbidden');
  });
});
