import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorld, executeCommand, projectWorld } from '@/lib/kingdoms/engine';
import { KingdomsClient } from './kingdoms-client';
import { useKingdoms } from './use-kingdoms';
const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));

vi.mock('./use-kingdoms', () => ({ useKingdoms: vi.fn() }));
vi.mock('./village-panel', () => ({ VillagePanel: () => <p>مشهد القرية</p>, ArmyPanel: () => <p>لوحة الجيش</p> }));
vi.mock('./map-panel', () => ({ MapPanel: () => <p>خريطة العالم</p> }));
vi.mock('./reports-panel', () => ({ ReportsPanel: () => <p>تقارير المملكة</p> }));

const vibrate = vi.fn();
let expectedVillageId: string;

beforeEach(() => {
  const now = 1800000000000;
  const world = executeCommand(createWorld(now), 'viewer', { type: 'found', name: 'النور' }, now);
  const projected = projectWorld(world, 'viewer', now);
  expectedVillageId = projected.villages[0].id;
  const view = {
    ...projected,
    villages: projected.villages.map((village) => ({ ...village, resources: { ...village.resources, wood: 12345 } })),
    worldId: 'world-1', worldName: 'عالمي', revision: 1, paused: false,
  };
  vi.mocked(useKingdoms).mockReturnValue({
    worlds: [], worldId: view.worldId, view, busy: false, loading: false,
    error: '', notice: '', send: vi.fn(), refresh: vi.fn(), listWorlds: vi.fn(), setWorldId: vi.fn(),
  } as ReturnType<typeof useKingdoms>);
  vibrate.mockReset();
  vi.stubGlobal('navigator', { vibrate });
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ matches: query.includes('pointer: coarse') })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('mobile kingdom controls', () => {
  it('keeps the exact resource amount accessible beside its compact visual value', () => {
    render(<KingdomsClient />);
    const resources = screen.getByRole('region', { name: 'موارد القرية' });
    const wood = resources.querySelector('[data-resource="wood"]')!;
    expect(within(wood as HTMLElement).getByRole('group', { name: 'الخشب: ١٢٬٣٤٥' })).toBeInTheDocument();
    expect(wood.querySelector('[data-compact-value]')).toHaveTextContent(/ألف/);
    expect(wood.getAttribute('title')).toContain('١٢٬٣٤٥');
  });

  it('provides five persistent destinations and updates the selected destination', () => {
    render(<KingdomsClient />);
    const nav = within(screen.getByRole('navigation', { name: 'تنقل المملكة' }));
    expect(nav.getAllByRole('button')).toHaveLength(4);
    const mapLink = nav.getByRole('link', { name: 'انتقل إلى العالم' });
    const mapUrl = new URL(mapLink.getAttribute('href')!, 'https://app.test');
    expect(mapUrl.pathname).toBe('/games/kingdoms/world-map');
    expect(mapUrl.searchParams.get('worldId')).toBe('world-1');
    expect(mapUrl.searchParams.get('villageId')).toBe(expectedVillageId);
    expect(nav.getByRole('button', { name: 'انتقل إلى القرية' })).toHaveAttribute('aria-current', 'page');
    fireEvent.click(nav.getByRole('button', { name: 'انتقل إلى الجيش' }));
    expect(screen.getByText('لوحة الجيش')).toBeInTheDocument();
    expect(nav.getByRole('button', { name: 'انتقل إلى الجيش' })).toHaveAttribute('aria-current', 'page');
    expect(nav.getByRole('button', { name: 'انتقل إلى القرية' })).not.toHaveAttribute('aria-current');
    fireEvent.click(screen.getByRole('button', { name: 'إدارة المملكة' }));
    expect(screen.getByRole('button', { name: 'السوق' })).toBeInTheDocument();
  });

  it('provides optional touch feedback without vibrating under reduced motion', () => {
    render(<KingdomsClient />);
    const army = within(screen.getByRole('navigation', { name: 'تنقل المملكة' })).getByRole('button', { name: 'انتقل إلى الجيش' });
    fireEvent.click(army);
    expect(vibrate).toHaveBeenCalledWith(8);
    vibrate.mockClear();
    vi.mocked(matchMedia).mockImplementation((query) => ({ matches: query.includes('reduced-motion') || query.includes('pointer: coarse') }) as MediaQueryList);
    fireEvent.click(army);
    expect(vibrate).not.toHaveBeenCalled();
  });
});
