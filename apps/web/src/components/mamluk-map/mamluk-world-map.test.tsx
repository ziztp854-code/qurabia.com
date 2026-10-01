import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MapSdkFixture, approvedPayload } from './map-fixture';
import { MamlukWorldMap } from './mamluk-world-map';
const navigation = vi.hoisted(() => ({ push: vi.fn() }));
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
});
const worlds = [
  { id: 'world', name: 'مصر والشام' },
  { id: 'other', name: 'العالم الثاني' },
];

describe('strategic world map controls', () => {
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
      zoom: 10,
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
      zoom: 10,
    });
    expect(screen.queryByRole('link', { name: 'إدارة القرية' })).not.toBeInTheDocument();
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
      screen.queryByText('تُعرض المواقع التي تسمح بها رؤيتك الحالية.'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('الجيوش')).not.toBeInTheDocument();
    expect(screen.queryByText('الحصار')).not.toBeInTheDocument();
    expect(screen.queryByText('القلاع')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'القاهرة' }));
    expect(screen.getByRole('heading', { level: 2, name: 'القاهرة' })).toBeInTheDocument();
    expect(screen.getByText('31.2357 / 30.0444')).toBeInTheDocument();
    expect(screen.queryByText('الملكية')).not.toBeInTheDocument();
    expect(screen.queryByText('التحصين')).not.toBeInTheDocument();
    expect(screen.queryByText('القيمة الاستراتيجية')).not.toBeInTheDocument();
  });
  it('restores selection after refresh and hides details while pending or revoked', async () => {
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
    fireEvent.click(screen.getByRole('button', { name: 'القاهرة' }));
    expect(screen.getByText('التحصين')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(screen.queryByText('التحصين')).not.toBeInTheDocument();
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
    expect(screen.getByText('التحصين')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('region', { name: 'خريطة حروب المماليك' }), {
      key: 'Escape',
    });
    expect(screen.queryByText('التحصين')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'قرّب الخريطة' }));
    fireEvent.click(screen.getByRole('button', { name: 'أبعد الخريطة' }));
    fireEvent.click(screen.getByRole('button', { name: 'انتقل إلى القاهرة' }));
    expect(screen.queryByRole('button', { name: 'القاهرة' })).not.toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: 'أغلق تفاصيل الموقع' }));
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
    expect(screen.queryByRole('button', { name: 'القاهرة' })).not.toBeInTheDocument();
    map.fire('error');
    await screen.findByRole('alert');
  });
});
