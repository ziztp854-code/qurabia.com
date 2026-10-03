import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MapSdkFixture, approvedPayload } from './map-fixture';
import { MamlukWorldMap } from './mamluk-world-map';
const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));

vi.mock('maplibre-gl', async () => {
  const { MapSdkFixture } = await import('./map-fixture');
  return {
    Map: MapSdkFixture,
    setWorkerUrl: (url: string) => {
      MapSdkFixture.workerUrl = url;
    },
  };
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  MapSdkFixture.instances = [];
  MapSdkFixture.failCreation = false;
  MapSdkFixture.workerUrl = null;
  navigation.push.mockClear();
  navigation.replace.mockClear();
  navigation.refresh.mockClear();
});
const worlds = [
  { id: 'world', name: 'مصر والشام' },
  { id: 'other', name: 'العالم الثاني' },
];

describe('strategic world map controls', () => {
  it('changes target mode without replacing the map or camera and confirms only a permitted village ID', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => approvedPayload() }));
    const confirm = vi.fn();
    const props = { worlds, initialWorldId: 'world', viewerPlayerId: 'viewer', onConfirmTarget: confirm, targetVillageIds: ['cairo'] };
    const view = render(<MamlukWorldMap {...props} mode="WORLD" />);
    fireEvent.click(await screen.findByRole('button', { name: 'القاهرة' }));
    const map = MapSdkFixture.instances[0]!;
    const camera = map.lastCamera;
    view.rerender(<MamlukWorldMap {...props} mode="SELECT_ATTACK_TARGET" />);
    expect(screen.getByText('اختر هدف الهجوم')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد الهدف' }));
    expect(confirm).toHaveBeenCalledExactlyOnceWith('cairo');
    view.rerender(<MamlukWorldMap {...props} mode="SELECT_SCOUT_TARGET" targetVillageIds={[]} />);
    expect(screen.getByRole('button', { name: 'تأكيد الهدف' })).toBeDisabled();
    view.rerender(<MamlukWorldMap {...props} mode="SELECT_SETTLEMENT_TARGET" />);
    expect(screen.getByRole('button', { name: 'تأكيد الهدف' })).toBeDisabled();
    expect(screen.getByText(/اختيار أرض الاستيطان/)).toBeInTheDocument();
    expect(MapSdkFixture.instances).toHaveLength(1);
    expect(map.lastCamera).toEqual(camera);
    fireEvent.keyDown(screen.getByRole('region', { name: 'خريطة حروب المماليك' }), { key: 'Escape' });
    expect(screen.getByRole('region', { name: 'الخريطة الاستراتيجية' })).toHaveFocus();
  });
  it('focuses a requested village after its approved coordinates arrive without mounting another map', async () => {
    let deliver: ((value: unknown) => void) | undefined;
    vi.stubGlobal('fetch', vi.fn(() => new Promise((resolve) => { deliver = resolve; })));
    const view = render(<MamlukWorldMap worlds={worlds} initialWorldId="world" viewerPlayerId="viewer" focusVillageId="cairo" />);
    await waitFor(() => expect(deliver).toBeDefined());
    await act(async () => { deliver?.({ ok: true, json: async () => approvedPayload() }); });
    await screen.findByRole('heading', { name: 'القاهرة', level: 2 });
    expect(MapSdkFixture.instances[0]?.lastCamera).toMatchObject({ center: [31.2357, 30.0444] });
    const camera = MapSdkFixture.instances[0]?.lastCamera;
    view.rerender(<MamlukWorldMap worlds={worlds} initialWorldId="world" viewerPlayerId="viewer" focusVillageId="unavailable" />);
    expect(MapSdkFixture.instances).toHaveLength(1);
    expect(MapSdkFixture.instances[0]?.lastCamera).toEqual(camera);
  });
  it('ignores a stale distant-village lookup after another target was requested', async () => {
    const pending = new Map<string, (value: unknown) => void>();
    vi.stubGlobal('fetch', vi.fn((url: string) => url.includes('/location?')
      ? new Promise((resolve) => { pending.set(new URL(url, 'https://test').searchParams.get('villageId')!, resolve); })
      : Promise.resolve({ ok: true, json: async () => approvedPayload() })));
    const props = { worlds, initialWorldId: 'world', viewerPlayerId: 'viewer' };
    const view = render(<MamlukWorldMap {...props} focusVillageId="far-a" />);
    await waitFor(() => expect(pending.has('far-a')).toBe(true));
    view.rerender(<MamlukWorldMap {...props} focusVillageId="far-b" />);
    await waitFor(() => expect(pending.has('far-b')).toBe(true));
    await act(async () => { pending.get('far-b')?.({ ok: true, json: async () => ({ worldId: 'world', villageId: 'far-b', longitude: 44, latitude: 25 }) }); });
    expect(MapSdkFixture.instances[0]?.lastCamera).toMatchObject({ center: [44, 25] });
    await act(async () => { pending.get('far-a')?.({ ok: true, json: async () => ({ worldId: 'world', villageId: 'far-a', longitude: 12, latitude: 20 }) }); });
    expect(MapSdkFixture.instances[0]?.lastCamera).toMatchObject({ center: [44, 25] });
    expect(MapSdkFixture.instances).toHaveLength(1);
  });
  it('groups real player boundaries and focuses an approved village for inspecting its realm', async () => {
    const original = approvedPayload();
    const cairo = original.layers.cities.features[0]!;
    const payload = {
      ...original,
      layers: {
        ...original.layers,
        cities: {
          type: 'FeatureCollection',
          features: [
            cairo,
            {
              ...cairo,
              id: 'alexandria',
              geometry: { type: 'Point', coordinates: [29.9553, 31.2156] },
              properties: {
                ...cairo.properties,
                name: 'الإسكندرية',
                ownerPlayerId: 'other-player',
              },
            },
          ],
        },
        territories: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              id: 'realm-cairo',
              geometry: {
                type: 'Polygon',
                coordinates: [
                  [
                    [31.22, 30.03],
                    [31.25, 30.03],
                    [31.25, 30.06],
                    [31.22, 30.03],
                  ],
                ],
              },
              properties: { regionId: 'egypt', ownerPlayerId: 'viewer', ownerSultanateId: null },
            },
            {
              type: 'Feature',
              id: 'realm-alexandria',
              geometry: {
                type: 'Polygon',
                coordinates: [
                  [
                    [29.94, 31.2],
                    [29.97, 31.2],
                    [29.97, 31.23],
                    [29.94, 31.2],
                  ],
                ],
              },
              properties: {
                regionId: 'egypt',
                ownerPlayerId: 'other-player',
                ownerSultanateId: null,
              },
            },
          ],
        },
      },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'X-Mamluk-Public-Settlements': '1' }),
        json: async () => payload,
      }),
    );
    render(<MamlukWorldMap worlds={worlds} initialWorldId="world" viewerPlayerId="viewer" />);
    const boundaries = await screen.findByRole('region', { name: 'حدود الممالك' });
    const own = await within(boundaries).findByRole('button', { name: 'استكشف حدود مملكتك: القاهرة' });
    const other = within(boundaries).getByRole('button', { name: 'استكشف حدود قرى الإسكندرية' });
    expect(boundaries).not.toHaveTextContent('other-player');
    expect(own).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(own);
    expect(own).toHaveAttribute('aria-pressed', 'true');
    expect(MapSdkFixture.instances[0]?.lastCamera).toMatchObject({
      center: [31.2357, 30.0444],
      zoom: 11,
    });
    fireEvent.click(other);
    expect(other).toHaveAttribute('aria-pressed', 'true');
    expect(MapSdkFixture.instances[0]?.lastCamera).toMatchObject({
      center: [29.9553, 31.2156],
      zoom: 11,
    });
  });

  it('keeps the approved public locations and chosen title steady during polling', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'X-Mamluk-Public-Settlements': '1' }),
          json: async () => approvedPayload(),
        })
        .mockImplementation(() => new Promise(() => {})),
    );
    render(<MamlukWorldMap worlds={worlds} initialWorldId="world" viewerPlayerId="viewer" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    fireEvent.click(screen.getByRole('button', { name: 'القاهرة' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(screen.getByRole('button', { name: 'القاهرة' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'القاهرة' })).toBeInTheDocument();
    expect(screen.getByText('جارٍ تحديث تفاصيل الموقع…')).toBeInTheDocument();
    expect(screen.getByText('التحصين')).toBeInTheDocument();
    expect(screen.getByText('جارٍ تحديث المشهد…')).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(3001); });
    expect(screen.queryByText('التحصين')).not.toBeInTheDocument();
  });

  it('keeps approved own-village navigation usable while private details refresh', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'X-Mamluk-Public-Settlements': '1' }),
          json: async () => approvedPayload(),
        })
        .mockImplementation(() => new Promise(() => {})),
    );
    const village = { villageId: 'cairo', name: 'القاهرة', longitude: 31.2357, latitude: 30.0444 };
    render(
      <MamlukWorldMap
        worlds={worlds}
        initialWorldId="world"
        viewerPlayerId="viewer"
        initialLocation={village}
        initialVillageId="cairo"
        villageLocations={[village]}
      />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const manage = screen.getByRole('link', { name: 'إدارة القرية' });
    expect(screen.getByText('التحصين')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(screen.getByRole('link', { name: 'إدارة القرية' })).toBe(manage);
    expect(screen.getByText('تحت رايتك')).toBeInTheDocument();
    expect(screen.getByText('31.2357 / 30.0444')).toBeInTheDocument();
    expect(screen.getByText('التحصين')).toBeInTheDocument();
    expect(screen.getByText('القيمة الاستراتيجية')).toBeInTheDocument();
  });

  it('focuses the accepted relocation coordinates and refreshes the selected village context', async () => {
    let moved = false;
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/world-map/relocate')) {
        if (init?.method === 'POST') moved = true;
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: {
              worldId: 'world',
              villageId: 'cairo',
              longitude: moved ? 35 : 31.2357,
              latitude: moved ? 32 : 30.0444,
              relocationUsed: moved,
              canRelocate: !moved,
              reason: moved ? 'used' : null,
              bounds: { west: -179.9, south: -85, east: 179.9, north: 85 },
              revision: moved ? 2 : 1,
            },
          }),
        };
      }
      const payload = approvedPayload();
      const city = payload.layers.cities.features[0];
      return {
        ok: true,
        json: async () =>
          moved
            ? {
                ...payload,
                layers: {
                  ...payload.layers,
                  cities: {
                    type: 'FeatureCollection',
                    features: [{ ...city, geometry: { type: 'Point', coordinates: [35, 32] } }],
                  },
                },
              }
            : payload,
      };
    });
    vi.stubGlobal('fetch', fetch);
    const village = { villageId: 'cairo', name: 'القاهرة', longitude: 31.2357, latitude: 30.0444 };
    render(
      <MamlukWorldMap
        worlds={worlds}
        initialWorldId="world"
        viewerPlayerId="viewer"
        initialLocation={village}
        initialVillageId="cairo"
        villageLocations={[village]}
      />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'نقل القرية' }));
    await screen.findByRole('heading', { name: 'اختر الوجهة الجديدة' });
    expect(screen.getByRole('button', { name: 'راجع الوجهة' })).toBeDisabled();
    expect(screen.queryByRole('complementary', { name: 'تفاصيل الخريطة' })).not.toBeInTheDocument();
    const map = MapSdkFixture.instances[0];
    await act(async () => map.fire('click', {
      point: { x: 1, y: 1 }, lngLat: { lng: 35, lat: 32 },
    }));
    expect(screen.getByText('معاينة الوجهة')).toBeInTheDocument();
    expect(fetch.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
    expect(map.sources.get('mamluk-cities')?.data).toMatchObject({
      features: [{ geometry: { coordinates: [31.2357, 30.0444] } }],
    });
    fireEvent.click(screen.getByRole('button', { name: 'راجع الوجهة' }));
    expect(screen.getByRole('button', { name: 'تأكيد النقل الدائم' })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد النقل الدائم' }));
    await waitFor(() => expect(navigation.refresh).toHaveBeenCalledOnce());
    expect(navigation.replace).toHaveBeenCalledWith(
      '/games/kingdoms/world-map/?worldId=world&villageId=cairo',
    );
    expect(MapSdkFixture.instances).toHaveLength(1);
    expect(MapSdkFixture.instances[0].removed).toBe(false);
    await waitFor(() =>
      expect(MapSdkFixture.instances[0].lastCamera).toMatchObject({ center: [35, 32], zoom: 6.5 }),
    );
    await screen.findByRole('heading', { name: 'القاهرة', level: 2 });
    fireEvent.click(screen.getByRole('button', { name: 'انتقل إلى قريتك' }));
    expect(MapSdkFixture.instances[0].lastCamera).toMatchObject({ center: [35, 32], zoom: 6.5 });
    expect(fetch.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
    expect(map.sources.has('qurabia-relocation-preview')).toBe(false);
  });
  it('links real own villages above the map to their authorized geographic context', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => approvedPayload() }),
    );
    const villages = [
      { villageId: 'cairo', name: 'القاهرة', longitude: 31.2357, latitude: 30.0444 },
      { villageId: 'my-second', name: 'قرية النور', longitude: 29.9553, latitude: 31.2156 },
    ];
    render(
      <MamlukWorldMap
        worlds={worlds}
        initialWorldId="world"
        viewerPlayerId="viewer"
        initialVillageId="cairo"
        villageLocations={villages}
      />,
    );
    const navigation = screen.getByRole('navigation', { name: 'قراي' });
    expect(within(navigation).getByRole('link', { name: 'القاهرة' })).toHaveAttribute(
      'aria-current',
      'location',
    );
    expect(within(navigation).getByRole('link', { name: 'قرية النور' })).toHaveAttribute(
      'href',
      '/games/kingdoms/world-map?worldId=world&villageId=my-second',
    );
    expect(within(navigation).getAllByRole('link')).toHaveLength(2);
    await screen.findByRole('button', { name: 'القاهرة' });
  });
  it('does not offer village management after current authoritative ownership changes', async () => {
    const original = approvedPayload();
    const city = original.layers.cities.features[0];
    const payload = {
      ...original,
      layers: {
        ...original.layers,
        cities: {
          type: 'FeatureCollection',
          features: [
            { ...city, properties: { ...city.properties, ownerPlayerId: 'other-player' } },
          ],
        },
      },
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => payload }));
    const village = { villageId: 'cairo', name: 'القاهرة', longitude: 31.2357, latitude: 30.0444 };
    render(
      <MamlukWorldMap
        worlds={worlds}
        initialWorldId="world"
        viewerPlayerId="viewer"
        initialLocation={village}
        initialVillageId="cairo"
        villageLocations={[village]}
      />,
    );
    await screen.findByRole('heading', { name: 'القاهرة', level: 2 });
    expect(screen.queryByRole('link', { name: 'إدارة القرية' })).not.toBeInTheDocument();
  });
  it('focuses server-provided village coordinates and exposes management only after an approved own-city payload', async () => {
    const payload = approvedPayload();
    const village = { villageId: 'cairo', name: 'القاهرة', longitude: 31.2357, latitude: 30.0444 };
    let deliver: ((value: unknown) => void) | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise((resolve) => {
            deliver = resolve;
          }),
      ),
    );
    render(
      <MamlukWorldMap
        worlds={worlds}
        initialWorldId="world"
        viewerPlayerId="viewer"
        initialLocation={village}
        initialVillageId="cairo"
        villageLocations={[village]}
      />,
    );
    await waitFor(() => expect(deliver).toBeDefined());
    expect(screen.queryByRole('link', { name: 'إدارة القرية' })).not.toBeInTheDocument();
    expect(MapSdkFixture.instances[0]?.initialCamera).toEqual({
      center: [31.2357, 30.0444],
      zoom: 6.5,
    });
    await act(async () => {
      deliver?.({ ok: true, json: async () => payload });
    });
    expect(await screen.findByRole('heading', { name: 'القاهرة', level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'إدارة القرية' })).toHaveAttribute(
      'href',
      '/games/kingdoms?worldId=world&villageId=cairo&tab=village',
    );
    fireEvent.click(screen.getByRole('button', { name: 'انتقل إلى قريتك' }));
    expect(MapSdkFixture.instances[0]?.lastCamera).toMatchObject({
      center: [31.2357, 30.0444],
      zoom: 6.5,
    });
    expect(screen.getByRole('link', { name: 'إدارة القرية' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'العالم' }), {
      target: { value: 'other' },
    });
    expect(navigation.push).toHaveBeenCalledWith('/games/kingdoms/world-map/?worldId=other');
  });
  it('labels the reference atlas and presents public city coordinates without game claims', async () => {
    const atlasId = 'mamluk-public-geographic-atlas-v1';
    const publicPayload = approvedPayload(atlasId);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => publicPayload }),
    );
    render(
      <MamlukWorldMap
        worlds={[{ id: atlasId, name: 'أطلس المدن — مرجع جغرافي' }]}
        initialWorldId={atlasId}
        viewerPlayerId="viewer"
        referenceOnly
      />,
    );
    await screen.findByRole('button', { name: 'القاهرة' });
    expect(screen.getByText('أطلس جغرافي · مدن مصر والشام والحجاز')).toBeInTheDocument();
    expect(
      screen.getByText('لا توجد حملة متصلة. استكشف مواقع المدن بإحداثياتها الجغرافية.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('رؤيتك الحالية')).not.toBeInTheDocument();
    expect(
      screen.queryByText('تعرض الخريطة المواقع المسموح لك بالاطلاع عليها.'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('الجيوش')).not.toBeInTheDocument();
    expect(screen.queryByText('الحصار')).not.toBeInTheDocument();
    expect(screen.queryByText('القلاع')).not.toBeInTheDocument();
    expect(screen.queryByText('حدود القرى')).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'قراي' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'القاهرة' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'القاهرة' })).toBeInTheDocument();
    expect(screen.getByText('31.2357 / 30.0444')).toBeInTheDocument();
    expect(screen.queryByText('الملكية')).not.toBeInTheDocument();
    expect(screen.queryByText('التحصين')).not.toBeInTheDocument();
    expect(screen.queryByText('القيمة الاستراتيجية')).not.toBeInTheDocument();
  });
  it('preserves valid selection during refresh and removes details when revoked', async () => {
    vi.useFakeTimers();
    let deliver: ((value: unknown) => void) | undefined;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => approvedPayload() })
      .mockImplementation(
        () =>
          new Promise((resolve) => {
            deliver = resolve;
          }),
      );
    vi.stubGlobal('fetch', fetchMock);
    render(<MamlukWorldMap worlds={worlds} initialWorldId="world" viewerPlayerId="viewer" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const map = MapSdkFixture.instances[0]!;
    map.clicked = [{ source: 'mamluk-cities', id: 'cairo' }];
    act(() => map.fire('click', { point: { x: 1, y: 1 } }));
    expect(screen.getByText('التحصين')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(screen.getByText('التحصين')).toBeInTheDocument();
    await act(async () => {
      deliver?.({ ok: true, json: async () => approvedPayload('world', '2') });
    });
    expect(screen.getByText('التحصين')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    const revoked = approvedPayload('world', '3');
    await act(async () => {
      deliver?.({
        ok: true,
        json: async () => ({
          ...revoked,
          layers: {
            ...revoked.layers,
            cities: { type: 'FeatureCollection', features: [] },
          },
        }),
      });
    });
    expect(screen.queryByText('التحصين')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'القاهرة' })).not.toBeInTheDocument();
  });
  it('loads authoritative viewport data and supports globe, flat, location, and keyboard details', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => ({
      ok: true,
      json: async () =>
        approvedPayload(new URL(url, 'https://app.test').searchParams.get('worldId') ?? 'world'),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const view = render(
      <MamlukWorldMap worlds={worlds} initialWorldId="world" viewerPlayerId="viewer" />,
    );
    await screen.findByRole('button', { name: 'القاهرة' });
    expect(MapSdkFixture.instances[0]?.workerUrlAtCreation).toBe(
      '/maplibre/maplibre-gl-worker.mjs',
    );
    expect(screen.getByRole('heading', { level: 1, name: 'خريطة العالم' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'حدود الممالك' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'GeoNames' })).toHaveAttribute(
      'href',
      'https://www.geonames.org/',
    );
    expect(screen.getByRole('link', { name: 'CC BY 4.0' })).toHaveAttribute(
      'href',
      'https://creativecommons.org/licenses/by/4.0/',
    );
    fireEvent.click(screen.getByRole('button', { name: 'خريطة مسطحة' }));
    expect(MapSdkFixture.instances[0]?.projection).toBe('mercator');
    fireEvent.click(screen.getByRole('button', { name: 'الكرة الأرضية' }));
    expect(MapSdkFixture.instances[0]?.projection).toBe('globe');
    await screen.findByRole('button', { name: 'القاهرة' });
    fireEvent.click(screen.getByRole('button', { name: 'القاهرة' }));
    expect(await screen.findByText('التحصين')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('region', { name: 'خريطة حروب المماليك' }), {
      key: 'Escape',
    });
    expect(screen.queryByText('التحصين')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'قرّب الخريطة' }));
    fireEvent.click(screen.getByRole('button', { name: 'أبعد الخريطة' }));
    fireEvent.click(screen.getByRole('button', { name: 'انتقل إلى القاهرة' }));
    expect(screen.getByRole('button', { name: 'القاهرة' })).toBeInTheDocument();
    view.unmount();
    expect(MapSdkFixture.instances[0]?.removed).toBe(true);
    expect(fetchMock.mock.calls[0]?.[0]).not.toContain('viewer');
  });
  it('disposes the previous world and its selection before loading another world', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string) => ({
        ok: true,
        json: async () =>
          approvedPayload(new URL(url, 'https://app.test').searchParams.get('worldId') ?? 'world'),
      })),
    );
    render(<MamlukWorldMap worlds={worlds} initialWorldId="world" viewerPlayerId="viewer" />);
    await screen.findByRole('button', { name: 'القاهرة' });
    fireEvent.click(screen.getByRole('button', { name: 'القاهرة' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'العالم' }), {
      target: { value: 'other' },
    });
    expect(screen.queryByText('التحصين')).not.toBeInTheDocument();
    await waitFor(() => expect(MapSdkFixture.instances).toHaveLength(2));
    expect(MapSdkFixture.instances[0]?.removed).toBe(true);
    await screen.findByRole('button', { name: 'القاهرة' });
  });

  it('fails closed on a request error and retries without retaining selected data', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockRejectedValueOnce(new Error('private server error'))
        .mockResolvedValue({ ok: true, json: async () => approvedPayload() }),
    );
    render(<MamlukWorldMap worlds={worlds} initialWorldId="world" viewerPlayerId="viewer" />);
    await screen.findByRole('alert');
    expect(screen.queryByText('private server error')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'أعد محاولة تحميل الخريطة' }));
    await screen.findByRole('button', { name: 'القاهرة' });
    fireEvent.click(screen.getByRole('button', { name: 'القاهرة' }));
    fireEvent.click(await screen.findByRole('button', { name: 'أغلق تفاصيل الموقع' }));
    expect(screen.queryByText('التحصين')).not.toBeInTheDocument();
  });

  it('allows retrying browser map creation and reports a broad viewport without fetching all world data', async () => {
    MapSdkFixture.failCreation = true;
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => approvedPayload() });
    vi.stubGlobal('fetch', fetchMock);
    render(<MamlukWorldMap worlds={worlds} initialWorldId="world" viewerPlayerId="viewer" />);
    await screen.findByRole('alert');
    MapSdkFixture.failCreation = false;
    fireEvent.click(screen.getByRole('button', { name: 'أعد محاولة تحميل الخريطة' }));
    await screen.findByRole('button', { name: 'القاهرة' });
    const map = MapSdkFixture.instances[0]!;
    map.bounds = { west: -180, east: 180, south: -80, north: 80 };
    fireEvent.click(screen.getByRole('button', { name: 'أبعد الخريطة' }));
    expect(screen.getByText('قرّب الخريطة لعرض المواقع')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'القاهرة' })).toBeInTheDocument();
    map.fire('error');
    await screen.findByRole('alert');
  });
});
