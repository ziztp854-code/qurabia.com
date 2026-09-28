import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createWorld } from '@/lib/kingdoms/engine';
import { KingdomsAdmin } from './kingdoms-admin';

const now = 1800000000000;
const state = createWorld(now);
const saved = { id: 'world-1', name: 'عالم الاختبار', revision: 1 };
const list = [{ ...saved, status: 'OPEN', createdAt: new Date(now).toISOString() }];
const reply = (data: unknown) =>
  new Response(JSON.stringify({ success: true, data }), { status: 200 });

describe('Kingdoms administration', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url, init) =>
        reply(
          init?.method === 'POST'
            ? saved
            : String(url).endsWith('/worlds')
              ? list
              : { ...saved, state },
        ),
      ),
    );
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('loads authoritative state after the create API returns only a receipt', async () => {
    render(<KingdomsAdmin />);
    fireEvent.change(screen.getByLabelText('اسم العالم'), { target: { value: 'عالم الاختبار' } });
    fireEvent.click(screen.getByRole('button', { name: 'أنشئ العالم والموسم' }));
    expect(await screen.findByRole('status')).toHaveTextContent('تم حفظ التغيير');
    expect(screen.getByLabelText('إعدادات العالم (JSON)')).toHaveValue(
      JSON.stringify(state.config, null, 2),
    );
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([url]) => String(url) === '/api/admin/kingdoms?worldId=world-1'),
    ).toBe(true);
  });

  it('rejects malformed balancing data before sending a mutation', async () => {
    render(<KingdomsAdmin />);
    await screen.findByRole('option', { name: /عالم الاختبار/ });
    fireEvent.change(screen.getByLabelText('العالم'), { target: { value: 'world-1' } });
    fireEvent.change(await screen.findByLabelText('إعدادات العالم (JSON)'), {
      target: { value: '{' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'احفظ إعدادات التوازن' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('الإعدادات غير صالحة');
    expect(vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(
      0,
    );
  });

  it('does not shorten a season when confirmation is declined', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<KingdomsAdmin />);
    await screen.findByRole('option', { name: /عالم الاختبار/ });
    fireEvent.change(screen.getByLabelText('العالم'), { target: { value: 'world-1' } });
    fireEvent.change(await screen.findByLabelText('موعد النهاية بالتوقيت المحلي'), {
      target: { value: '2026-10-01T12:00' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'احفظ موعد النهاية' }));
    await waitFor(() => expect(window.confirm).toHaveBeenCalled());
    expect(vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(
      0,
    );
  });
});
