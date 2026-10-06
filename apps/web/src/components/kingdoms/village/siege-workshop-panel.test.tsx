import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SiegeWorkshopPanel } from './siege-workshop-panel';
import { workshopRecipes, workshopLevels } from '@/lib/kingdoms/siege-workshop';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('keeps a newer server inventory when an older overlapping read arrives late', async () => {
  vi.useFakeTimers();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  const data = {
    serverNow: 1800000000000,
    level: 1,
    inventory: { catapult: 0, ballista: 0, 'siege-tower': 0 },
    damaged: { catapult: 0, ballista: 0, 'siege-tower': 0 },
    queue: [],
    resources: { wood: 10000, stone: 10000, iron: 10000, food: 10000, gold: 10000 },
    hallLevel: 6,
    recipes: workshopRecipes,
    nextLevel: workshopLevels[1],
    paused: false,
    ended: false,
  };
  let resolveFirst!: (response: Response) => void;
  const first = new Promise<Response>((resolve) => {
    resolveFirst = resolve;
  });
  const fetcher = vi
    .fn()
    .mockImplementationOnce(() => first)
    .mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            ...data,
            serverNow: data.serverNow + 10000,
            inventory: { ...data.inventory, catapult: 2 },
          },
        }),
      ),
    );
  vi.stubGlobal('fetch', fetcher);
  render(<SiegeWorkshopPanel worldId="world" villageId="v1" busy={false} />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10000);
  });
  expect(screen.getByRole('heading', { name: 'منجنيق · مخزون ٢' })).toBeInTheDocument();
  await act(async () => {
    resolveFirst(new Response(JSON.stringify({ success: true, data })));
    await first;
  });
  expect(screen.getByRole('heading', { name: 'منجنيق · مخزون ٢' })).toBeInTheDocument();
});
it('loads the owned server inventory and purchases a real manufacturing queue', async () => {
  const data = {
    serverNow: 1800000000000,
    level: 1,
    inventory: { catapult: 0, ballista: 0, 'siege-tower': 0 },
    damaged: { catapult: 0, ballista: 0, 'siege-tower': 0 },
    queue: [],
    resources: { wood: 10000, stone: 10000, iron: 10000, food: 10000, gold: 10000 },
    hallLevel: 6,
    recipes: workshopRecipes,
    nextLevel: workshopLevels[1],
    paused: false,
    ended: false,
  };
  const fetcher = vi.fn(
    async (_url: string, options?: RequestInit) =>
      new Response(
        JSON.stringify({
          success: true,
          data:
            options?.method === 'POST'
              ? {
                  ...data,
                  queue: [
                    {
                      id: 'craft-1',
                      kind: 'craft',
                      equipment: 'catapult',
                      count: 1,
                      startedAt: data.serverNow,
                      endsAt: data.serverNow + 600000,
                    },
                  ],
                }
              : data,
        }),
      ),
  );
  vi.stubGlobal('fetch', fetcher);
  const onChanged = vi.fn();
  render(<SiegeWorkshopPanel worldId="world" villageId="v1" busy={false} onChanged={onChanged} />);
  const craft = await screen.findByRole('button', { name: 'صنّع منجنيق' });
  fireEvent.click(craft);
  await waitFor(() =>
    expect(fetcher).toHaveBeenCalledWith(
      '/api/kingdoms/siege-workshop',
      expect.objectContaining({ method: 'POST' }),
    ),
  );
  const request = JSON.parse(
    String(fetcher.mock.calls.find((call) => call[1]?.method === 'POST')?.[1]?.body),
  );
  expect(request).toMatchObject({
    worldId: 'world',
    villageId: 'v1',
    action: { type: 'craft', equipment: 'catapult', count: 1 },
  });
  expect(request.action.key).toBeTruthy();
  expect(await screen.findByLabelText('طابور تصنيع المعدات')).toHaveTextContent('منجنيق');
  await waitFor(() => expect(onChanged).toHaveBeenCalledOnce());
  expect(screen.getByText(/لا توجد معدات متضررة/)).toBeInTheDocument();
});
