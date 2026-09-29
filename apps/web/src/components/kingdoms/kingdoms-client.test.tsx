import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createWorld, executeCommand, projectWorld } from '@/lib/kingdoms/engine';
import { KingdomsClient } from './kingdoms-client';
import type { WorldView } from './shared';

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

describe('Kingdoms player interface', () => {
  beforeEach(() => {
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
    expect(screen.getByRole('button', { name: 'خريطة العالم' })).toBeInTheDocument();
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
    fireEvent.change(await screen.findByLabelText('اسم المملكة'), {
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

  it('submits map missions with selected coordinates and troops, without client prices', async () => {
    vi.mocked(fetch).mockImplementation(async (url) =>
      response(String(url).endsWith('/worlds') ? summary : projection(true)),
    );
    render(<KingdomsClient />);
    const navigation = await screen.findByLabelText('إدارة المملكة');
    fireEvent.click(within(navigation).getByRole('button', { name: 'خريطة العالم' }));
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
    vi.mocked(fetch).mockImplementation(async (url) =>
      response(String(url).endsWith('/worlds') ? summary : { ...projection(true), paused: true }),
    );
    render(<KingdomsClient />);
    const buttons = await screen.findAllByRole('button', { name: 'طوّر المبنى' });
    expect(buttons.every((button) => button.hasAttribute('disabled'))).toBe(true);
  });
});
