import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VillageRelocation } from './village-relocation';

const props = {
  worldId: 'world',
  villageId: 'village',
  longitude: 31.24967,
  latitude: 30.06263,
  approved: true,
  onRelocated: vi.fn(),
};
const eligibility = {
  worldId: 'world',
  villageId: 'village',
  longitude: 31.24967,
  latitude: 30.06263,
  relocationUsed: false,
  canRelocate: true,
  reason: null,
  bounds: { west: -67.125, south: -28.6624, east: 165.25, north: 60.1772 },
  revision: 1,
};
function response(data: unknown) {
  return { ok: true, json: async () => ({ success: true, data }) };
}
async function prepareMove() {
  fireEvent.click(await screen.findByRole('button', { name: 'نقل القرية' }));
  fireEvent.change(screen.getByRole('spinbutton', { name: 'خط الطول' }), {
    target: { value: '31.3' },
  });
  fireEvent.change(screen.getByRole('spinbutton', { name: 'خط العرض' }), {
    target: { value: '30.2' },
  });
  fireEvent.click(screen.getByRole('checkbox'));
}

afterEach(() => {
  vi.unstubAllGlobals();
  props.onRelocated.mockClear();
});

describe('one-time village relocation', () => {
  it('requires explicit server eligibility before offering a permanent move', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );
    render(<VillageRelocation {...props} />);
    expect(screen.getByRole('status')).toHaveTextContent('جارٍ التحقق من إمكانية نقل القرية');
    expect(screen.queryByRole('button', { name: 'نقل القرية' })).not.toBeInTheDocument();
    expect(props.onRelocated).not.toHaveBeenCalled();
  });
  it('asks for geographic coordinates and explicit one-time confirmation before sending', async () => {
    const fetch = vi.fn().mockResolvedValue(response(eligibility));
    vi.stubGlobal('fetch', fetch);
    render(<VillageRelocation {...props} />);
    fireEvent.click(await screen.findByRole('button', { name: 'نقل القرية' }));
    expect(screen.getByRole('spinbutton', { name: 'خط الطول' })).toHaveValue(31.24967);
    expect(screen.getByRole('spinbutton', { name: 'خط العرض' })).toHaveValue(30.06263);
    expect(screen.getByRole('button', { name: 'تأكيد النقل الدائم' })).toBeDisabled();
    fireEvent.change(screen.getByRole('spinbutton', { name: 'خط الطول' }), {
      target: { value: '31.3' },
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'خط العرض' }), {
      target: { value: '30.2' },
    });
    expect(screen.getByRole('button', { name: 'تأكيد النقل الدائم' })).toBeDisabled();
    expect(fetch).toHaveBeenCalledOnce();
    expect(props.onRelocated).not.toHaveBeenCalled();
  });
  it('rejects blank, invalid, unchanged and out-of-world coordinates before mutation', async () => {
    const fetch = vi.fn().mockResolvedValue(response(eligibility));
    vi.stubGlobal('fetch', fetch);
    render(<VillageRelocation {...props} />);
    fireEvent.click(await screen.findByRole('button', { name: 'نقل القرية' }));
    fireEvent.click(screen.getByRole('checkbox'));
    for (const [longitude, latitude] of [
      ['', '30'],
      ['181', '30'],
      ['31', '91'],
      ['166', '30'],
      ['31', '-29'],
      ['31.24967', '30.06263'],
    ]) {
      fireEvent.change(screen.getByRole('spinbutton', { name: 'خط الطول' }), {
        target: { value: longitude },
      });
      fireEvent.change(screen.getByRole('spinbutton', { name: 'خط العرض' }), {
        target: { value: latitude },
      });
      fireEvent.click(screen.getByRole('button', { name: 'تأكيد النقل الدائم' }));
      expect(screen.getByRole('alert')).toHaveTextContent(
        'اختر إحداثيات صالحة داخل حدود العالم تختلف عن الموقع الحالي.',
      );
    }
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('submits once while pending and refreshes only after authoritative permanent acceptance', async () => {
    let deliver: (result: unknown) => void = () => {};
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(eligibility))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            deliver = resolve;
          }),
      );
    vi.stubGlobal('fetch', fetch);
    render(<VillageRelocation {...props} />);
    await prepareMove();
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد النقل الدائم' }));
    expect(await screen.findByRole('button', { name: 'جارٍ نقل القرية…' })).toBeDisabled();
    expect(screen.getByRole('spinbutton', { name: 'خط الطول' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'إلغاء النقل' })).toBeDisabled();
    expect(props.onRelocated).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(2);
    const [url, init] = fetch.mock.calls[1];
    expect(url).toBe('/api/kingdoms/world-map/relocate');
    expect(init).toMatchObject({
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
    });
    expect(JSON.parse(init.body)).toEqual({
      worldId: 'world',
      villageId: 'village',
      longitude: 31.3,
      latitude: 30.2,
      idempotencyKey: expect.any(String),
    });
    deliver(
      response({
        ...eligibility,
        longitude: 31.3,
        latitude: 30.2,
        relocationUsed: true,
        canRelocate: false,
        reason: 'used',
        revision: 2,
      }),
    );
    await waitFor(() => expect(props.onRelocated).toHaveBeenCalledOnce());
    expect(screen.getByRole('status')).toHaveTextContent('تم نقل القرية إلى موقعها الجديد.');
    expect(screen.queryByRole('button', { name: 'نقل القرية' })).not.toBeInTheDocument();
  });
  it('retains the same idempotency key and coordinates after a failed request', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(eligibility))
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ success: false, error: 'تعذر الاتصال. أعد المحاولة.' }),
      })
      .mockResolvedValueOnce(
        response({
          ...eligibility,
          longitude: 31.3,
          latitude: 30.2,
          relocationUsed: true,
          canRelocate: false,
          reason: 'used',
          revision: 2,
        }),
      );
    vi.stubGlobal('fetch', fetch);
    render(<VillageRelocation {...props} />);
    await prepareMove();
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد النقل الدائم' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('تعذر الاتصال. أعد المحاولة.');
    expect(props.onRelocated).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد النقل الدائم' }));
    await waitFor(() => expect(props.onRelocated).toHaveBeenCalledOnce());
    expect(fetch.mock.calls[2][1].body).toBe(fetch.mock.calls[1][1].body);
  });
  it('never refreshes the map from an invalid or foreign mutation response', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(eligibility))
      .mockResolvedValueOnce(
        response({
          ...eligibility,
          villageId: 'foreign',
          longitude: 31.3,
          latitude: 30.2,
          relocationUsed: true,
          canRelocate: false,
        }),
      )
      .mockResolvedValueOnce(response({ longitude: 31.3, latitude: 30.2 }))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetch);
    render(<VillageRelocation {...props} />);
    await prepareMove();
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد النقل الدائم' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'تعذر تأكيد نقل القرية. أعد المحاولة.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد النقل الدائم' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('تعذر نقل القرية. أعد المحاولة.'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد النقل الدائم' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(4));
    expect(screen.getByRole('alert')).not.toHaveTextContent('Failed to fetch');
    expect(props.onRelocated).not.toHaveBeenCalled();
  });
  it.each([
    { ...eligibility, relocationUsed: true, canRelocate: false, reason: 'used' },
    { ...eligibility, canRelocate: false, reason: 'unavailable' },
  ])('does not offer a move when the server marks it used or unavailable', async (data) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(data)));
    render(<VillageRelocation {...props} />);
    expect(
      await screen.findByText(
        data.relocationUsed ? 'استُخدمت فرصة نقل هذه القرية.' : 'نقل القرية غير متاح حاليًا.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'نقل القرية' })).not.toBeInTheDocument();
  });
  it('fails closed on foreign or malformed eligibility and allows an explicit retry', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response({ ...eligibility, villageId: 'foreign' }))
      .mockResolvedValueOnce(
        response({ worldId: 'world', villageId: 'village', canRelocate: true }),
      )
      .mockResolvedValueOnce(response(eligibility));
    vi.stubGlobal('fetch', fetch);
    render(<VillageRelocation {...props} />);
    await screen.findByRole('alert');
    expect(screen.queryByRole('button', { name: 'نقل القرية' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'أعد التحقق من النقل' }));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'أعد التحقق من النقل' }));
    expect(await screen.findByRole('button', { name: 'نقل القرية' })).toBeInTheDocument();
  });
  it('ignores late server acceptance after the selected village is unmounted', async () => {
    let deliver: (result: unknown) => void = () => {};
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(eligibility))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            deliver = resolve;
          }),
      );
    vi.stubGlobal('fetch', fetch);
    const view = render(<VillageRelocation {...props} />);
    await prepareMove();
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد النقل الدائم' }));
    const signal = fetch.mock.calls[1][1].signal as AbortSignal;
    view.unmount();
    expect(signal.aborted).toBe(true);
    deliver(
      response({
        ...eligibility,
        longitude: 31.3,
        latitude: 30.2,
        relocationUsed: true,
        canRelocate: false,
        reason: 'used',
        revision: 2,
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(props.onRelocated).not.toHaveBeenCalled();
  });
  it('preserves typed coordinates across a background viewport refresh without offering an unapproved action', async () => {
    const fetch = vi.fn().mockResolvedValue(response(eligibility));
    vi.stubGlobal('fetch', fetch);
    const view = render(<VillageRelocation {...props} />);
    await prepareMove();
    view.rerender(<VillageRelocation {...props} approved={false} />);
    expect(screen.getByRole('spinbutton', { name: 'خط الطول' })).toBeVisible();
    expect(screen.getByRole('spinbutton', { name: 'خط الطول' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'تأكيد النقل الدائم' })).toBeDisabled();
    view.rerender(<VillageRelocation {...props} approved />);
    expect(screen.getByRole('spinbutton', { name: 'خط الطول' })).toHaveValue(31.3);
    expect(screen.getByRole('spinbutton', { name: 'خط العرض' })).toHaveValue(30.2);
    expect(screen.getByRole('checkbox')).toBeChecked();
    expect(fetch).toHaveBeenCalledOnce();
  });
});
