import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createWorld, executeCommand, projectWorld } from '@/lib/kingdoms/engine';
import { unitKeys } from '@/lib/kingdoms/types';
import { KingdomsClient } from './kingdoms-client';
import { number, type WorldView } from './shared';
const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));

vi.mock('socket.io-client', () => ({
  io: () => ({ on: vi.fn(), emit: vi.fn(), disconnect: vi.fn() }),
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
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    media: query, matches: query === '(prefers-reduced-motion: reduce)', onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(),
    removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  })));
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
    expect(screen.getByRole('link', { name: 'خريطة العالم' })).toBeInTheDocument();
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
    const troops = within(hud).getByText('الوحدات الجاهزة').parentElement!;
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
    expect(screen.getByRole('combobox', { name: 'العالم والموسم' })).toHaveValue('world-2');
    expect(screen.getByRole('combobox', { name: 'القرية الحالية' })).toHaveValue('second-village');
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
    expect(screen.getByRole('combobox', { name: 'العالم والموسم' })).toHaveValue('world-1');
    expect(screen.getByRole('combobox', { name: 'القرية الحالية' })).toHaveValue(
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
    const navigation = screen.getByLabelText('إدارة المملكة');
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
    const navigation = await screen.findByLabelText('إدارة المملكة');
    fireEvent.click(within(navigation).getByRole('button', { name: 'إرسال حملة' }));
    const map = screen.getByLabelText('خريطة الأراضي');
    fireEvent.click(within(map).getByLabelText('أرض خالية، X 0، Y 0'));
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

  it('disables mutations in paused worlds', async () => {
    preferReducedMotion();
    vi.mocked(fetch).mockImplementation(async (url) =>
      response(String(url).endsWith('/worlds') ? summary : { ...projection(true), paused: true }),
    );
    render(<KingdomsClient />);
    fireEvent.click(await screen.findByRole('button', { name: 'القرية' }));
    fireEvent.click(screen.getByRole('button', { name: /دار الحكم.*المستوى [١1]/ }));
    const buttons = await screen.findAllByRole(
      'button',
      { name: 'طوّر المبنى' },
      { timeout: 3000 },
    );
    expect(buttons.every((button) => button.hasAttribute('disabled'))).toBe(true);
  });
});
