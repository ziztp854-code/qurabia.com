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
const pickerProps = {
  destination: null as { longitude: number; latitude: number } | null,
  isPickingDestination: false,
  manualEntryRequested: false,
  onStartPickingDestination: vi.fn(),
  onDestinationChange: vi.fn(),
  onCancelDestination: vi.fn(),
};
function response(data: unknown) {
  return { ok: true, json: async () => ({ success: true, data }) };
}
async function prepareMove() {
  fireEvent.click(await screen.findByRole('button', { name: 'نقل القرية' }));
  fireEvent.change(screen.getByLabelText('خط الطول'), {
    target: { value: '31.3' },
  });
  fireEvent.change(screen.getByLabelText('خط العرض'), {
    target: { value: '30.2' },
  });
  fireEvent.click(screen.getByRole('checkbox'));
}

afterEach(() => {
  vi.unstubAllGlobals();
  props.onRelocated.mockClear();
  pickerProps.onStartPickingDestination.mockClear();
  pickerProps.onDestinationChange.mockClear();
  pickerProps.onCancelDestination.mockClear();
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
    expect(screen.getByLabelText('خط الطول')).toHaveValue('31.24967');
    expect(screen.getByLabelText('خط العرض')).toHaveValue('30.06263');
    expect(screen.getByRole('button', { name: 'تأكيد النقل الدائم' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('خط الطول'), {
      target: { value: '31.3' },
    });
    fireEvent.change(screen.getByLabelText('خط العرض'), {
      target: { value: '30.2' },
    });
    expect(screen.getByRole('button', { name: 'تأكيد النقل الدائم' })).toBeDisabled();
    expect(fetch).toHaveBeenCalledOnce();
    expect(props.onRelocated).not.toHaveBeenCalled();
  });
  it.each([
    ['5', '51', '51.', '51.5', '51.53', '51.531'],
    ['٥', '٥١', '٥١٫', '٥١٫٥', '٥١٫٥٣', '٥١٫٥٣١'],
    ['-', '-2', '-25', '-25.', '-25.2'],
  ])('keeps incremental coordinate drafts editable until submission: %j', async (...drafts) => {
    const fetch = vi.fn().mockResolvedValue(response(eligibility));
    vi.stubGlobal('fetch', fetch);
    render(<VillageRelocation {...props} />);
    fireEvent.click(await screen.findByRole('button', { name: 'نقل القرية' }));
    const longitude = screen.getByLabelText('خط الطول');
    const latitude = screen.getByLabelText('خط العرض');
    for (const input of [longitude, latitude]) {
      fireEvent.change(input, { target: { value: '' } });
      expect(input).toHaveDisplayValue('');
      for (const value of drafts) {
        fireEvent.change(input, { target: { value } });
        expect(input).toHaveDisplayValue(value);
      }
    }
    expect(fetch).toHaveBeenCalledOnce();
    expect(props.onRelocated).not.toHaveBeenCalled();
  });
  it.each([
    ['51.531', '25.2867'],
    ['٥١٫٥٣١', '٢٥٫٢٨٦٧'],
    ['۵۱٫۵۳۱', '۲۵٫۲۸۶۷'],
    ['51,531', '25,2867'],
  ])(
    'submits normalized decimal coordinates from mobile input: %s, %s',
    async (longitude, latitude) => {
      const fetch = vi
        .fn()
        .mockResolvedValueOnce(response(eligibility))
        .mockResolvedValueOnce(
          response({
            ...eligibility,
            longitude: 51.531,
            latitude: 25.2867,
            relocationUsed: true,
            canRelocate: false,
            reason: 'used',
            revision: 2,
          }),
        );
      vi.stubGlobal('fetch', fetch);
      render(<VillageRelocation {...props} />);
      fireEvent.click(await screen.findByRole('button', { name: 'نقل القرية' }));
      fireEvent.change(screen.getByLabelText('خط الطول'), { target: { value: longitude } });
      fireEvent.change(screen.getByLabelText('خط العرض'), { target: { value: latitude } });
      fireEvent.click(screen.getByRole('checkbox'));
      fireEvent.click(screen.getByRole('button', { name: 'تأكيد النقل الدائم' }));
      await waitFor(() => expect(props.onRelocated).toHaveBeenCalledOnce());
      expect(JSON.parse(fetch.mock.calls[1][1].body)).toMatchObject({
        longitude: 51.531,
        latitude: 25.2867,
      });
    },
  );
  it('rejects blank, invalid, unchanged and out-of-world coordinates before mutation', async () => {
    const fetch = vi.fn().mockResolvedValue(response(eligibility));
    vi.stubGlobal('fetch', fetch);
    render(<VillageRelocation {...props} />);
    fireEvent.click(await screen.findByRole('button', { name: 'نقل القرية' }));
    for (const [longitude, latitude] of [
      ['', '30'],
      ['31', ''],
      ['-', '30'],
      ['.', '30'],
      ['-.', '30'],
      ['51..5', '30'],
      ['٥١٫٥٫٣', '30'],
      ['51,5,3', '30'],
      ['NaN', '30'],
      ['Infinity', '30'],
      ['9'.repeat(400), '30'],
      ['0x20', '30'],
      ['1e1', '30'],
      ['0b100', '30'],
      ['31 3', '30'],
      ['31abc', '30'],
      ['181', '30'],
      ['31', '91'],
      ['166', '30'],
      ['31', '-29'],
      ['31.24967', '30.06263'],
      ['٣١٫٢٤٩٦٧', '٣٠٫٠٦٢٦٣'],
    ]) {
      fireEvent.change(screen.getByLabelText('خط الطول'), {
        target: { value: longitude },
      });
      fireEvent.change(screen.getByLabelText('خط العرض'), {
        target: { value: latitude },
      });
      fireEvent.click(screen.getByRole('checkbox'));
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
    expect(screen.getByLabelText('خط الطول')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'إلغاء النقل' })).toBeDisabled();
    expect(props.onRelocated).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(2);
    const [url, init] = fetch.mock.calls[1];
    expect(url).toBe('/api/kingdoms/world-map/relocate/');
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
    expect(screen.getByLabelText('خط الطول')).toBeVisible();
    expect(screen.getByLabelText('خط الطول')).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'تأكيد النقل الدائم' })).toBeDisabled();
    view.rerender(<VillageRelocation {...props} approved />);
    expect(screen.getByLabelText('خط الطول')).toHaveValue('31.3');
    expect(screen.getByLabelText('خط العرض')).toHaveValue('30.2');
    expect(screen.getByRole('checkbox')).toBeChecked();
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('starts map picking when the permanent relocation form opens and keeps manual entry optional', async () => {
    const fetch = vi.fn().mockResolvedValue(response(eligibility));
    vi.stubGlobal('fetch', fetch);
    render(<VillageRelocation {...props} {...pickerProps} />);
    fireEvent.click(await screen.findByRole('button', { name: 'نقل القرية' }));
    expect(pickerProps.onStartPickingDestination).toHaveBeenCalledOnce();
    expect(screen.queryByLabelText('خط الطول')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'تأكيد النقل الدائم' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'إدخال الإحداثيات يدويًا' })).toBeVisible();
  });
  it('previews an external map destination and resets confirmation when another destination is picked', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(eligibility)));
    const view = render(<VillageRelocation {...props} {...pickerProps} />);
    fireEvent.click(await screen.findByRole('button', { name: 'نقل القرية' }));
    view.rerender(
      <VillageRelocation
        {...props}
        {...pickerProps}
        destination={{ longitude: 51.531, latitude: 25.2867 }}
      />,
    );
    const preview = screen.getByRole('region', { name: 'الموقع الجديد للقرية' });
    expect(preview).toHaveTextContent('51.531');
    expect(preview).toHaveTextContent('25.2867');
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('button', { name: 'تأكيد النقل الدائم' })).not.toBeDisabled();
    view.rerender(
      <VillageRelocation
        {...props}
        {...pickerProps}
        destination={{ longitude: 51.532, latitude: 25.287 }}
      />,
    );
    expect(preview).toHaveTextContent('51.532');
    expect(preview).toHaveTextContent('25.287');
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'تأكيد النقل الدائم' })).toBeDisabled();
  });
  it('reveals manual coordinates requested from the map and retains Arabic drafts while updating the preview', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(eligibility)));
    const view = render(<VillageRelocation {...props} {...pickerProps} />);
    fireEvent.click(await screen.findByRole('button', { name: 'نقل القرية' }));
    view.rerender(<VillageRelocation {...props} {...pickerProps} manualEntryRequested />);
    fireEvent.change(screen.getByLabelText('خط الطول'), { target: { value: '٥١٫٥٣١' } });
    fireEvent.change(screen.getByLabelText('خط العرض'), { target: { value: '٢٥٫٢٨٦٧' } });
    expect(pickerProps.onDestinationChange).toHaveBeenLastCalledWith({
      longitude: 51.531,
      latitude: 25.2867,
    });
    view.rerender(
      <VillageRelocation
        {...props}
        {...pickerProps}
        manualEntryRequested
        destination={{ longitude: 51.531, latitude: 25.2867 }}
      />,
    );
    expect(screen.getByLabelText('خط الطول')).toHaveValue('٥١٫٥٣١');
    expect(screen.getByLabelText('خط العرض')).toHaveValue('٢٥٫٢٨٦٧');
  });
  it('requires a new confirmation after editing manual coordinates', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(eligibility)));
    render(<VillageRelocation {...props} />);
    await prepareMove();
    expect(screen.getByRole('checkbox')).toBeChecked();
    fireEvent.change(screen.getByLabelText('خط الطول'), { target: { value: '51.531' } });
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'تأكيد النقل الدائم' })).toBeDisabled();
  });
  it('clears the destination when cancelling and reopens picking with a fresh confirmation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(eligibility)));
    render(<VillageRelocation {...props} {...pickerProps} />);
    fireEvent.click(await screen.findByRole('button', { name: 'نقل القرية' }));
    fireEvent.click(screen.getByRole('button', { name: 'إلغاء النقل' }));
    expect(pickerProps.onCancelDestination).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'نقل القرية' }));
    expect(pickerProps.onStartPickingDestination).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });
  it('resets consent when returning to map picking or switching to optional manual entry', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(eligibility)));
    render(
      <VillageRelocation
        {...props}
        {...pickerProps}
        destination={{ longitude: 51.531, latitude: 25.2867 }}
      />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'نقل القرية' }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'إدخال الإحداثيات يدويًا' }));
    expect(screen.getByLabelText('خط الطول')).toHaveValue('51.531');
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(pickerProps.onDestinationChange).toHaveBeenLastCalledWith({
      longitude: 51.531,
      latitude: 25.2867,
    });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'غيّر الموقع على الخريطة' }));
    expect(screen.queryByLabelText('خط الطول')).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(pickerProps.onStartPickingDestination).toHaveBeenCalledTimes(2);
  });
  it('blocks a picked target during choosing or refresh and clears preview only after authoritative acceptance', async () => {
    let deliver: (result: unknown) => void = () => {};
    const target = { longitude: 51.531, latitude: 25.2867 };
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
    const view = render(
      <VillageRelocation {...props} {...pickerProps} destination={target} isPickingDestination />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'نقل القرية' }));
    expect(screen.getByRole('checkbox')).toBeDisabled();
    fireEvent.submit(screen.getByRole('button', { name: 'تأكيد النقل الدائم' }).closest('form')!);
    expect(fetch).toHaveBeenCalledOnce();
    view.rerender(<VillageRelocation {...props} {...pickerProps} destination={target} />);
    fireEvent.click(screen.getByRole('checkbox'));
    view.rerender(
      <VillageRelocation {...props} {...pickerProps} destination={target} approved={false} />,
    );
    expect(screen.getByRole('button', { name: 'تأكيد النقل الدائم' })).toBeDisabled();
    fireEvent.submit(screen.getByRole('button', { name: 'تأكيد النقل الدائم' }).closest('form')!);
    expect(fetch).toHaveBeenCalledOnce();
    view.rerender(<VillageRelocation {...props} {...pickerProps} destination={target} />);
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد النقل الدائم' }));
    expect(pickerProps.onCancelDestination).not.toHaveBeenCalled();
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toMatchObject(target);
    deliver(
      response({
        ...eligibility,
        ...target,
        relocationUsed: true,
        canRelocate: false,
        reason: 'used',
        revision: 2,
      }),
    );
    await waitFor(() => expect(props.onRelocated).toHaveBeenCalledOnce());
    expect(pickerProps.onCancelDestination).toHaveBeenCalledOnce();
  });
});
