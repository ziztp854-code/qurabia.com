import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { WorldPanel } from './world-panel';
import {
  createSharedWorld,
  applySharedCommand,
  projectSharedWorld,
} from '@/lib/alfazaa/realm/world-engine';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe('Alfazaa shared-world account UI', () => {
  it('keeps shared account actions unavailable in the guest demo', () => {
    const fetcher = vi.spyOn(globalThis, 'fetch');
    render(<WorldPanel demo />);
    expect(screen.getByText(/تقدم المدينة التجريبية مستقل/)).toBeInTheDocument();
    expect(fetcher).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'إنشاء المخفر' })).toBeNull();
  });
  it('loads a real account and requires confirmation before permanent city troop conversion', async () => {
    const now = 1800000000000;
    const world = applySharedCommand(
      createSharedWorld(now),
      'alice',
      { type: 'join', name: 'النور' },
      now,
    );
    const data = {
      revision: 1,
      world: projectSharedWorld(world, 'alice', now),
      city: {
        revision: 3,
        gold: 1000,
        castleLevel: 1,
        troops: [{ cell: 0, cfgId: 10001, conversion: { unit: 'guard', count: 1 } }],
      },
    };
    const fetcher = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ success: true, data }), { status: 200 }));
    render(<WorldPanel demo={false} />);
    await screen.findByRole('heading', { name: 'المدينة ↔ المخفر' });
    const convert = screen.getByRole('button', { name: 'تحويل دائم إلى المخفر' });
    expect(convert).toBeDisabled();
    fireEvent.change(screen.getByLabelText('جندي المدينة'), { target: { value: '0' } });
    expect(convert).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(convert).not.toBeDisabled();
    // Fresh response objects are required because each fetch consumes its stream.
    fetcher.mockImplementation(
      async () => new Response(JSON.stringify({ success: true, data }), { status: 200 }),
    );
    fireEvent.click(convert);
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    const request = JSON.parse(fetcher.mock.calls[1][1]!.body as string);
    expect(request).toMatchObject({
      expectedRevision: 1,
      command: { type: 'convert-troop', cell: 0, confirm: true, expectedCityRevision: 3 },
    });
    expect(request.idempotencyKey).toBeTruthy();
  });
});
