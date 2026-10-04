import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createWorld, executeCommand, projectWorld } from '@/lib/kingdoms/engine';
import { unitKeys } from '@/lib/kingdoms/types';
import { KingdomsClient } from './kingdoms-client';
import { number, rateAmount, type WorldView } from './shared';
const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));

vi.mock('socket.io-client', () => ({
  io: () => ({ on: vi.fn(), emit: vi.fn(), disconnect: vi.fn() }),
}));

vi.mock('../mamluk-map/mamluk-world-map', () => ({
  MamlukWorldMap: () => <div data-testid="unified-map" />,
}));

const now = 1800000000000;
const world = createWorld(now);
const summary = [
  {
    id: 'world-1',
    name: 'عالم الاختبار',
    revision: 0,
    status: 'OPEN',
    createdAt: new Date(now).toISOString(),
  },
];
const projection = (founded = false): WorldView => ({
  ...projectWorld(
    founded
      ? executeCommand(world, 'player-1', { type: 'found', name: 'مملكة النور' }, now)
      : world,
    'player-1',
    now,
  ),
  worldId: 'world-1',
  worldName: 'عالم الاختبار',
  revision: 0,
  paused: false,
});
const response = (data: unknown) =>
  new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

function preferReducedMotion() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      media: query,
      matches: query === '(prefers-reduced-motion: reduce)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

describe('Kingdoms player interface', () => {
  beforeEach(() => {
    navigation.push.mockClear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => response(url.endsWith('/worlds') ? summary : projection())),
    );
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('creates the kingdom through a server command and renders only the returned resources', async () => {
    vi.mocked(fetch).mockImplementation(async (_url, init) =>
      init?.method === 'POST'
        ? response(projection(true))
        : response(String(_url).endsWith('/worlds') ? summary : projection()),
    );
    render(<KingdomsClient />);
    fireEvent.change(await screen.findByLabelText('اسم المملكة'), {
      target: { value: 'مملكة النور' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'أسّس مملكتي' }));
    await screen.findByRole('region', { name: 'موارد القرية' });
    const post = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(post?.[1]?.body as string)).toMatchObject({
      worldId: 'world-1',
      command: { type: 'found', name: 'مملكة النور' },
      idempotencyKey: expect.any(String),
    });
    expect(screen.getByRole('link', { name: 'خريطة العالم', hidden: true })).toBeInTheDocument();
  });

  it('keeps the same receipt key when retrying an ambiguous network failure', async () => {
    let attempts = 0;
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      if (init?.method === 'POST') {
        attempts += 1;
        if (attempts === 1) throw new Error('انقطع الاتصال');
        return response(projection(true));
      }
      return response(String(url).endsWith('/worlds') ? summary : projection());
    });
    render(<KingdomsClient />);
    fireEvent.change(await screen.findByLabelText('اسم المملكة', {}, { timeout: 3000 }), {
      target: { value: 'مملكة النور' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'أسّس مملكتي' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('انقطع الاتصال');
    expect(screen.queryByRole('region', { name: 'موارد القرية' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'أسّس مملكتي' }));
    await screen.findByRole('region', { name: 'موارد القرية' });
    const posts = vi
      .mocked(fetch)
      .mock.calls.filter(([, init]) => init?.method === 'POST')
      .map(([, init]) => JSON.parse(init?.body as string));
    expect(posts).toHaveLength(2);
    expect(posts[0].idempotencyKey).toEqual(posts[1].idempotencyKey);
  });

  it('renders an honest empty world list without a fabricated kingdom', async () => {
    vi.mocked(fetch).mockResolvedValue(response([]));
    render(<KingdomsClient />);
    expect(await screen.findByText(/لم يُفتح عالم بعد/)).toBeInTheDocument();
    expect(screen.queryByLabelText('اسم المملكة')).not.toBeInTheDocument();
  });

  it.each(['', 'paused-world', 'ended-world'])(
    'shows only open worlds when the requested world is "%s"',
    async (initialWorldId) => {
      const worlds = [
        { ...summary[0], id: 'paused-world', name: 'عالم موقوف', status: 'PAUSED' },
        { ...summary[0], id: 'ended-world', name: 'عالم منتهٍ', status: 'ENDED' },
        ...summary,
      ];
      vi.mocked(fetch).mockImplementation(async (url) =>
        response(String(url).endsWith('/worlds') ? worlds : projection()),
      );
      render(<KingdomsClient initialWorldId={initialWorldId} />);
      await screen.findByLabelText('اسم المملكة');
      const selector = screen.getByRole('combobox', { name: 'العالم والموسم' });
      expect(within(selector).getAllByRole('option')).toHaveLength(1);
      expect(within(selector).getByRole('option', { name: 'عالم الاختبار · مفتوح' })).toHaveValue(
        'world-1',
      );
      expect(selector).toHaveValue('world-1');
      expect(
        vi
          .mocked(fetch)
          .mock.calls.some(([url]) => /worldId=(paused-world|ended-world)/.test(String(url))),
      ).toBe(false);
    },
  );

  it('shows the empty state when every world is paused or ended', async () => {
    const worlds = [
      { ...summary[0], id: 'paused-world', status: 'PAUSED' },
      { ...summary[0], id: 'ended-world', status: 'ENDED' },
    ];
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (!String(url).endsWith('/worlds')) throw new Error('Closed world was requested');
      return response(worlds);
    });
    render(<KingdomsClient />);
    expect(await screen.findByText(/لم يُفتح عالم بعد/)).toBeInTheDocument();
    const selector = screen.getByRole('combobox', { name: 'العالم والموسم' });
    expect(selector).toHaveValue('');
    expect(within(selector).getByRole('option', { name: 'لا عوالم متاحة' })).toBeInTheDocument();
    expect(screen.queryByLabelText('اسم المملكة')).not.toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.map(([url]) => String(url))).toEqual([
      '/api/kingdoms/worlds',
    ]);
  });

  it('refreshes an empty list and selects a newly opened world without closed options', async () => {
    let worlds = [{ ...summary[0], id: 'paused-world', status: 'PAUSED' }];
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (String(url).endsWith('/worlds')) return response(worlds);
      if (String(url) === '/api/kingdoms?worldId=world-1') return response(projection());
      throw new Error('Unexpected world was requested');
    });
    render(<KingdomsClient />);
    await screen.findByText(/لم يُفتح عالم بعد/);
    worlds = [...worlds, ...summary];
    fireEvent.click(screen.getByRole('button', { name: 'تحديث' }));
    await screen.findByLabelText('اسم المملكة');
    const selector = screen.getByRole('combobox', { name: 'العالم والموسم' });
    expect(selector).toHaveValue('world-1');
    expect(within(selector).getAllByRole('option')).toHaveLength(1);
    expect(within(selector).getByRole('option')).toHaveTextContent('عالم الاختبار · مفتوح');
    expect(screen.queryByText(/لم يُفتح عالم بعد/)).not.toBeInTheDocument();
  });

  it('retains the selected open world when refreshing its server view', async () => {
    let requests = 0;
    const worlds = [...summary, { ...summary[0], id: 'world-2', name: 'العالم الثاني' }];
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (String(url).endsWith('/worlds')) return response(worlds);
      if (String(url) !== '/api/kingdoms?worldId=world-2') {
        throw new Error('Unexpected world was requested');
      }
      requests += 1;
      return response({
        ...projection(),
        worldId: 'world-2',
        worldName: requests === 1 ? 'العالم الثاني' : 'العالم الثاني بعد التحديث',
      });
    });
    render(<KingdomsClient initialWorldId="world-2" />);
    await screen.findByLabelText('اسم المملكة');
    fireEvent.click(screen.getByRole('button', { name: 'تحديث' }));
    expect(await screen.findByText(/العالم الثاني بعد التحديث/)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'العالم والموسم' })).toHaveValue('world-2');
    expect(requests).toBe(2);
  });

  it('retries a failed world list without restoring paused worlds', async () => {
    let attempts = 0;
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (String(url).endsWith('/worlds')) {
        attempts += 1;
        if (attempts === 1) throw new Error('تعذر تحميل العوالم');
        return response([{ ...summary[0], id: 'paused-world', status: 'PAUSED' }, ...summary]);
      }
      if (String(url) === '/api/kingdoms?worldId=world-1') return response(projection());
      throw new Error('Unexpected world was requested');
    });
    render(<KingdomsClient />);
    expect(await screen.findByRole('alert')).toHaveTextContent('تعذر تحميل العوالم');
    fireEvent.click(screen.getByRole('button', { name: 'تحديث' }));
    await screen.findByLabelText('اسم المملكة');
    const selector = screen.getByRole('combobox', { name: 'العالم والموسم' });
    expect(selector).toHaveValue('world-1');
    expect(within(selector).getAllByRole('option')).toHaveLength(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('opens the interactive village first with actual troops and keeps geographic navigation context', async () => {
    const snapshot = projection(true);
    const village = snapshot.villages[0];
    vi.mocked(fetch).mockImplementation(async (url) =>
      response(String(url).endsWith('/worlds') ? summary : snapshot),
    );
    render(<KingdomsClient />);
    expect(await screen.findByRole('region', { name: 'خريطة القرية' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'ملخص المملكة' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('complementary', { name: 'إدارة مباني القرية' }),
    ).not.toBeInTheDocument();
    const hud = screen.getByRole('region', { name: 'موارد القرية' });
    expect(
      Array.from(hud.querySelectorAll('[data-resource]'), (cell) =>
        cell.getAttribute('data-resource'),
      ),
    ).toEqual(['wood', 'stone', 'iron', 'food', 'gold']);
    for (const resource of ['wood', 'stone', 'iron', 'food', 'gold'] as const) {
      expect(hud.querySelector(`[data-resource="${resource}"] strong`)).toHaveTextContent(
        number(village.resources[resource]),
      );
    }
    expect(screen.getByRole('link', { name: 'العودة إلى الألعاب' })).toHaveAttribute(
      'href',
      '/games',
    );
    fireEvent.click(screen.getByRole('button', { name: 'إعدادات العالم والقرية' }));
    const troops = screen.getByText(/الوحدات الجاهزة:/);
    expect(troops).toHaveTextContent(
      number(unitKeys.reduce((sum, unit) => sum + village.troops[unit], 0)),
    );
    expect(within(hud).queryByText('السكان')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'انتقل إلى خريطة العالم' }));
    expect(navigation.push).toHaveBeenCalledWith(
      `/games/kingdoms/world-map/?worldId=world-1&villageId=${encodeURIComponent(village.id)}`,
    );
    expect(hud).toHaveTextContent(number(village.resources.gold));
  });

  it('keeps production and food upkeep details available through the collapsed settings', async () => {
    const snapshot = projection(true);
    const village = snapshot.villages[0];
    vi.mocked(fetch).mockImplementation(async (url) =>
      response(String(url).endsWith('/worlds') ? summary : snapshot),
    );
    render(<KingdomsClient />);
    await screen.findByRole('region', { name: 'خريطة القرية' });
    expect(screen.queryByRole('region', { name: 'بطاقة القرية' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'إعدادات العالم والقرية' }));
    const summaryControl = screen.getByText('تفاصيل الموارد والإنتاج');
    expect(summaryControl.closest('details')).not.toHaveAttribute('open');
    fireEvent.click(summaryControl);
    const details = await screen.findByRole('region', { name: 'بطاقة القرية' });
    expect(within(details).getByRole('progressbar', { name: 'امتلاء مخزن خشب' })).toHaveAttribute(
      'aria-valuenow',
      '45',
    );
    expect(
      within(details).getByText(`+${rateAmount(snapshot.productionRates[village.id].wood)}/ساعة`),
    ).toBeInTheDocument();
    const food = within(details).getByRole('button');
    fireEvent.click(food);
    expect(food).toHaveAttribute('aria-expanded', 'true');
    expect(within(details).getByText(/قبل إعاشة الجيش/)).toHaveTextContent(
      `إعاشة ${rateAmount(snapshot.productionBreakdown![village.id].upkeep)}`,
    );
    fireEvent.click(screen.getByRole('button', { name: 'إعدادات العالم والقرية' }));
    fireEvent.click(screen.getByRole('button', { name: 'إعدادات العالم والقرية' }));
    expect(screen.queryByRole('region', { name: 'بطاقة القرية' })).not.toBeInTheDocument();
  });

  it('restores the requested nonfirst world and own village on return from the geographic map', async () => {
    const first = projection(true).villages[0];
    const villages = [first, { ...first, id: 'second-village', name: 'قرية العودة' }];
    vi.mocked(fetch).mockImplementation(async (url) =>
      response(
        String(url).endsWith('/worlds')
          ? [...summary, { ...summary[0], id: 'world-2', name: 'العالم الثاني' }]
          : {
              ...projection(true),
              worldId: 'world-2',
              worldName: 'العالم الثاني',
              villages,
              productionRates: {
                ...projection(true).productionRates,
                'second-village': projection(true).productionRates[first.id],
              },
            },
      ),
    );
    render(
      <KingdomsClient
        initialWorldId="world-2"
        initialVillageId="second-village"
        initialTab="village"
      />,
    );
    await screen.findByRole('region', { name: 'خريطة القرية' });
    expect(screen.getByRole('combobox', { name: 'العالم والموسم', hidden: true })).toHaveValue(
      'world-2',
    );
    expect(screen.getByRole('combobox', { name: 'القرية الحالية', hidden: true })).toHaveValue(
      'second-village',
    );
    expect(screen.queryByRole('region', { name: 'ملخص المملكة' })).not.toBeInTheDocument();
    expect(
      vi.mocked(fetch).mock.calls.some(([url]) => String(url) === '/api/kingdoms?worldId=world-2'),
    ).toBe(true);
    expect(
      vi.mocked(fetch).mock.calls.some(([url]) => String(url) === '/api/kingdoms?worldId=world-1'),
    ).toBe(false);
  });
  it('falls back to returned public world choices and own village when query context is unavailable', async () => {
    vi.mocked(fetch).mockImplementation(async (url) =>
      response(String(url).endsWith('/worlds') ? summary : projection(true)),
    );
    render(
      <KingdomsClient
        initialWorldId="unavailable-world"
        initialVillageId="foreign-village"
        initialTab="village"
      />,
    );
    await screen.findByRole('region', { name: 'خريطة القرية' });
    expect(screen.getByRole('combobox', { name: 'العالم والموسم', hidden: true })).toHaveValue(
      'world-1',
    );
    expect(screen.getByRole('combobox', { name: 'القرية الحالية', hidden: true })).toHaveValue(
      projection(true).villages[0].id,
    );
    expect(
      vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('unavailable-world')),
    ).toBe(false);
  });

  it('opens a kingdom overview with live values and routes to the village', async () => {
    vi.mocked(fetch).mockImplementation(async (url) =>
      response(String(url).endsWith('/worlds') ? summary : projection(true)),
    );
    render(<KingdomsClient initialTab="overview" />);
    expect(await screen.findByRole('heading', { name: 'مملكة النور' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'ملخص المملكة' })).toBeInTheDocument();
    const scene = screen.getByRole('region', { name: 'خريطة القرية' });
    expect(within(scene).getByRole('button', { name: /دار الحكم.*المستوى/ })).toBeInTheDocument();
    expect(
      within(scene).getByRole('button', { name: /حطّاب المملكة.*لم يُبنَ/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'خريطة المملكة' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'إدارة القرية' }));
    expect(screen.getByRole('region', { name: 'خريطة القرية' })).toBeInTheDocument();
  });

  it('opens the selected scene building in the village management panel', async () => {
    preferReducedMotion();
    vi.mocked(fetch).mockImplementation(async (url) =>
      response(String(url).endsWith('/worlds') ? summary : projection(true)),
    );
    render(<KingdomsClient initialTab="overview" />);
    const scene = await screen.findByRole('region', { name: 'خريطة القرية' });
    fireEvent.click(within(scene).getByRole('button', { name: /حطّاب المملكة.*لم يُبنَ/ }));
    expect(screen.getByRole('region', { name: 'خريطة القرية' })).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: 'حطّاب المملكة' }, { timeout: 3000 }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'إدارة المملكة' }));
    const navigation = screen.getByRole('navigation', { name: 'إدارة المملكة' });
    fireEvent.click(within(navigation).getByRole('button', { name: 'لوحة المملكة' }));
    fireEvent.click(within(navigation).getByRole('button', { name: 'القرية' }));
    expect(
      screen.queryByRole('complementary', { name: 'إدارة مباني القرية' }),
    ).not.toBeInTheDocument();
  });

  it('opens the geographic world route from overview and navigation with the active village', async () => {
    vi.mocked(fetch).mockImplementation(async (url) =>
      response(String(url).endsWith('/worlds') ? summary : projection(true)),
    );
    render(<KingdomsClient initialTab="overview" />);
    const overview = await screen.findByRole('region', { name: 'خريطة المملكة' });
    const village = projection(true).villages[0];
    const expected = `/games/kingdoms/world-map/?worldId=world-1&villageId=${encodeURIComponent(village.id)}`;
    expect(within(overview).getByRole('link', { name: /افتح خريطة العالم/ })).toHaveAttribute(
      'href',
      expected.replace('/?', '?'),
    );
    expect(screen.getByRole('link', { name: 'خريطة العالم' })).toHaveAttribute(
      'href',
      expected.replace('/?', '?'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'إعدادات العالم والقرية' }));
    expect(screen.getByRole('link', { name: 'الخريطة الجغرافية' })).toHaveAttribute(
      'href',
      expected.replace('/?', '?'),
    );
    expect(screen.queryByLabelText('خريطة الأراضي')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'استكشف العالم' }));
    expect(navigation.push).toHaveBeenCalledWith(expected);
    expect(screen.queryByRole('region', { name: 'القرية المختارة' })).not.toBeInTheDocument();
  });
  it('submits map missions with selected coordinates and troops, without client prices', async () => {
    vi.mocked(fetch).mockImplementation(async (url) =>
      response(String(url).endsWith('/worlds') ? summary : projection(true)),
    );
    render(<KingdomsClient />);
    fireEvent.click(await screen.findByRole('button', { name: 'إدارة المملكة' }));
    const navigation = screen.getByRole('navigation', { name: 'إدارة المملكة' });
    fireEvent.click(within(navigation).getByRole('button', { name: 'إرسال حملة', hidden: true }));
    expect(screen.getByTestId('unified-map')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('الوجهة X'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('الوجهة Y'), { target: { value: '0' } });
    fireEvent.submit(
      screen.getByRole('button', { name: 'اختر الإحداثيات', hidden: true }).closest('form')!,
    );
    const mission = screen.getByLabelText('نوع الحملة');
    const form = mission.closest('form')!;
    fireEvent.change(mission, { target: { value: 'occupy' } });
    fireEvent.change(within(form).getByLabelText(/حارس .*متاح/), { target: { value: '5' } });
    fireEvent.submit(form);
    await waitFor(() =>
      expect(vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true),
    );
    const post = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(post?.[1]?.body as string).command).toEqual({
      type: 'march',
      villageId: projection(true).villages[0].id,
      targetX: 0,
      targetY: 0,
      mission: 'occupy',
      troops: { guard: 5, rider: 0, scout: 0, settler: 0 },
    });
  }, 20_000);

  it('shows a global incoming attack alert and focuses the existing world-map route', async () => {
    const founded = projection(true);
    const village = founded.villages[0];
    const incomingView = {
      ...founded,
      incoming: [
        {
          id: 'incoming-1',
          mission: 'attack' as const,
          targetVillageId: village.id,
          arrivesAt: now + 90_000,
          source: {
            id: 'src',
            name: 'معسكر الظل',
            x: 2,
            y: 2,
            kingdomName: 'الظل',
            ownerId: 'bob',
            protectedUntil: 0,
          },
        },
      ],
    };
    vi.mocked(fetch).mockImplementation(async (url) =>
      response(String(url).endsWith('/worlds') ? summary : incomingView),
    );
    render(<KingdomsClient />);
    expect(await screen.findByRole('alert', { name: 'هجوم قادم' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'إدارة المملكة' }));
    expect(
      screen
        .getByRole('navigation', { name: 'إدارة المملكة', hidden: true })
        .querySelector('[aria-label="1 هجمات قادمة"]'),
    ).not.toBeNull();
    fireEvent.click(
      within(screen.getByRole('alert', { name: 'هجوم قادم' })).getByRole('button', {
        name: 'عرض على الخريطة',
      }),
    );
    expect(navigation.push).toHaveBeenCalledWith(
      `/games/kingdoms/world-map/?worldId=world-1&villageId=${encodeURIComponent(village.id)}`,
    );
    expect(screen.queryAllByTestId('unified-map')).toHaveLength(0);
    expect(document.body.innerHTML).not.toContain('commanderId');
    expect(document.body.innerHTML).not.toContain('"loot"');
  });

  it('disables mutations in paused worlds', async () => {
    preferReducedMotion();
    vi.mocked(fetch).mockImplementation(async (url) =>
      response(String(url).endsWith('/worlds') ? summary : { ...projection(true), paused: true }),
    );
    render(<KingdomsClient />);
    fireEvent.click(await screen.findByRole('button', { name: 'القرية', hidden: true }));
    fireEvent.click(screen.getByRole('button', { name: /دار الحكم.*المستوى [١1]/ }));
    const buttons = await screen.findAllByRole(
      'button',
      { name: 'طوّر المبنى' },
      { timeout: 3000 },
    );
    expect(buttons.every((button) => button.hasAttribute('disabled'))).toBe(true);
  });
});
