import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createWorld, executeCommand, projectWorld } from '@/lib/kingdoms/engine';
import {
  prepareCurrentWorldAbandoned,
  ABANDONED_ROLLOUT_WORLD_ID,
  ABANDONED_ROLLOUT_WORLD_NAME,
} from '@/lib/kingdoms/abandoned-village-rollout';
import { emptyTroops } from '@/lib/kingdoms/simulation';
import { unitKeys } from '@/lib/kingdoms/types';
import type { WorldView } from '../shared';
import { AbandonedGatheringPanel } from './AbandonedGatheringPanel';
import { AbandonedWorldPanel, ABANDONED_MAP_SOURCE } from './AbandonedWorldPanel';
import type { Map as LibreMap } from 'maplibre-gl';
const now = 1800000000000;
function fixture() {
  const state = executeCommand(
    createWorld(now),
    'alice',
    { type: 'found', name: 'قرية الانطلاق' },
    now,
  );
  const home = Object.values(state.villages)[0]!;
  home.troops = { ...emptyTroops(), guard: 10 };
  state.abandonedVillages = prepareCurrentWorldAbandoned(
    {
      id: ABANDONED_ROLLOUT_WORLD_ID,
      name: ABANDONED_ROLLOUT_WORLD_NAME,
      state,
      revision: 2,
      paused: false,
    },
    now,
  ).layout;
  const view: WorldView = {
    ...projectWorld(state, 'alice', now),
    worldId: ABANDONED_ROLLOUT_WORLD_ID,
    worldName: ABANDONED_ROLLOUT_WORLD_NAME,
    revision: 2,
    paused: false,
  };
  return {
    view,
    village: view.villages[0]!,
    site: view.abandonedVillages![0]!,
    busy: false,
    send: vi.fn().mockResolvedValue(undefined),
  };
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe('real abandoned gathering interface', () => {
  it('uses all real troop keys and sends only target identity, origin and selected army', () => {
    const props = fixture();
    render(<AbandonedGatheringPanel {...props} />);
    expect(screen.getAllByRole('spinbutton')).toHaveLength(unitKeys.length);
    fireEvent.change(
      screen.getByRole('spinbutton', { name: new RegExp(props.view.config.units.guard.name) }),
      { target: { value: '10' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'إرسال بعثة جمع' }));
    expect(props.send).toHaveBeenCalledWith({
      type: 'gatherAbandoned',
      villageId: props.village.id,
      targetId: props.site.id,
      troops: { ...emptyTroops(), guard: 10 },
    });
    expect(screen.getByText('سعة الحمل الإجمالية:')).toBeTruthy();
  });
  it('blocks invalid army counts without a rendering error', () => {
    const props = fixture();
    render(<AbandonedGatheringPanel {...props} />);
    fireEvent.change(
      screen.getByRole('spinbutton', { name: new RegExp(props.view.config.units.guard.name) }),
      { target: { value: '100000000000000000000' } },
    );
    expect(screen.getByRole('button', { name: 'إرسال بعثة جمع' })).toBeDisabled();
    expect(props.send).not.toHaveBeenCalled();
  });
  it.each(['paused', 'ended'] as const)('blocks sending when %s', (status) => {
    const props = fixture();
    if (status === 'paused') props.view.paused = true;
    else props.view.season.status = 'ended';
    render(<AbandonedGatheringPanel {...props} />);
    expect(screen.getByRole('button', { name: 'إرسال بعثة جمع' })).toBeDisabled();
  });
  it('loads the exact-world real API and installs a separate SDK source; selecting a marker opens the gathering form', async () => {
    const { view } = fixture(),
      sources = new Map<string, { data: unknown; setData: (data: unknown) => void }>(),
      layers = new Map<string, unknown>(),
      listeners = new Map<string, (event: unknown) => void>();
    const map = {
      // Remote basemap tiles are still loading; authorized markers must not wait for them.
      isStyleLoaded: () => false,
      getStyle: () => ({}),
      getSource: (id: string) => sources.get(id),
      addSource: (id: string, source: { data: unknown }) =>
        sources.set(id, {
          data: source.data,
          setData(data) {
            this.data = data;
          },
        }),
      getLayer: (id: string) => layers.get(id),
      addLayer: (definition: { id: string }) => layers.set(definition.id, definition),
      getContainer: () => document.body,
      getCanvas: () => ({ style: { cursor: '' } }),
      on: (event: string, id: unknown, fn?: (event: unknown) => void) => {
        listeners.set(
          `${event}:${typeof id === 'string' ? id : ''}`,
          fn ?? (id as (event: unknown) => void),
        );
      },
      off: () => {},
      removeLayer: (id: string) => layers.delete(id),
      removeSource: (id: string) => sources.delete(id),
    } as unknown as LibreMap;
    const fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ success: true, data: view }) });
    vi.stubGlobal('fetch', fetch);
    const onLocate = vi.fn();
    const rendered = render(
      <AbandonedWorldPanel
        worldId={view.worldId}
        viewerId="alice"
        status="ready"
        mapRef={{ current: map }}
        mapStyleReadyRef={{ current: true }}
        onLocate={onLocate}
      />,
    );
    await screen.findByRole('heading', { name: 'القرى المهجورة · ٤٨' });
    expect(fetch.mock.calls[0]![0]).toBe(`/api/kingdoms?worldId=${view.worldId}`);
    await waitFor(() =>
      expect(sources.get(ABANDONED_MAP_SOURCE)?.data).toMatchObject({
        features: expect.arrayContaining([
          expect.objectContaining({ id: view.abandonedVillages![0]!.id }),
        ]),
      }),
    );
    const data = sources.get(ABANDONED_MAP_SOURCE)!.data as { features: unknown[] };
    expect(data.features).toHaveLength(48);
    act(() =>
      listeners.get('click:abandoned-village-hit-targets')!({
        features: [{ properties: { id: view.abandonedVillages![0]!.id } }],
      }),
    );
    await screen.findByRole('button', { name: 'إرسال بعثة جمع' });
    fireEvent.click(screen.getAllByRole('button', { pressed: true })[0]!);
    expect(onLocate).toHaveBeenCalledWith(view.abandonedVillages![0]);
    const selected = sources.get(ABANDONED_MAP_SOURCE)!.data as {
      features: { properties: { selected: boolean } }[];
    };
    expect(selected.features.filter((f) => f.properties.selected)).toHaveLength(1);
    rendered.unmount();
    expect(sources.size).toBe(0);
    expect(layers.size).toBe(0);
  });
  it('does not display registry data returned for another world or player', async () => {
    const { view } = fixture();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: { ...view, worldId: 'kw_foreign' } }),
      }),
    );
    render(
      <AbandonedWorldPanel
        worldId={view.worldId}
        viewerId="alice"
        status="ready"
        onLocate={vi.fn()}
      />,
    );
    await screen.findByRole('alert');
    expect(screen.queryByRole('heading', { name: 'القرى المهجورة · ٤٨' })).toBeNull();
  });
});
