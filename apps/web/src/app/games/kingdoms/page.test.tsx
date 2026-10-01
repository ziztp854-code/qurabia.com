import { describe, expect, it, vi } from 'vitest';
const auth = vi.hoisted(() => ({ requireActiveUser: vi.fn() }));
vi.mock('@/lib/auth/session', () => auth);
vi.mock('@/components/layout', () => ({ SiteLayout: () => null }));
vi.mock('@/components/kingdoms/kingdoms-client', () => ({ KingdomsClient: () => null }));
import KingdomsPage from './page';

describe('village management return route', () => {
  it('forwards requested world and village context to the host client after authentication', async () => {
    auth.requireActiveUser.mockResolvedValue({ name: 'Alice', role: 'USER' });
    const page = await KingdomsPage({
      searchParams: Promise.resolve({
        worldId: 'second',
        villageId: 'own-village',
        tab: 'village',
      }),
    });
    expect(page.props.children.props).toMatchObject({
      initialWorldId: 'second',
      initialVillageId: 'own-village',
      initialTab: 'village',
    });
    expect(auth.requireActiveUser).toHaveBeenCalledWith(
      '/games/kingdoms?worldId=second&villageId=own-village&tab=village',
    );
  });
  it('ignores array and unrecognized tab parameters', async () => {
    auth.requireActiveUser.mockResolvedValue({ name: 'Alice', role: 'USER' });
    const page = await KingdomsPage({
      searchParams: Promise.resolve({
        worldId: ['foreign', 'own'],
        villageId: ['enemy'],
        tab: 'admin',
      }),
    });
    expect(page.props.children.props).toMatchObject({
      initialWorldId: '',
      initialVillageId: '',
      initialTab: 'overview',
    });
  });
});
