import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SelectionPanel } from './selection-panel';

describe('map selection panel', () => {
  it('confirms only an eligible selected village and keeps unavailable target data honest', () => {
    const confirm = vi.fn();
    const cancel = vi.fn();
    const selection = { layer: 'cities' as const, id: 'v1', title: 'قرية النيل', kind: 'قرية', coordinates: '31 / 30', details: [] };
    const props = { features: [], onSelect: vi.fn(), onClose: vi.fn(), selection };
    const view = render(<SelectionPanel {...props} targetSelection={{ title: 'اختر هدف الهجوم', canConfirm: true, onConfirm: confirm, onCancel: cancel }} />);
    expect(screen.getByRole('heading', { name: 'قرية النيل' })).toHaveFocus();
    expect(screen.getByText('تظهر المسافة ومدة الوصول في معاينة الحملة عند توفرها.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد الهدف' }));
    expect(confirm).toHaveBeenCalledOnce();
    view.rerender(<SelectionPanel {...props} targetSelection={{ title: 'اختر هدف الهجوم', canConfirm: false, onConfirm: confirm, onCancel: cancel }} />);
    expect(screen.getByRole('button', { name: 'تأكيد الهدف' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'إلغاء اختيار الهدف' }));
    expect(cancel).toHaveBeenCalledOnce();
  });
  it('allows selecting sites beyond the first forty and resets paging when the search changes', () => {
    const onSelect = vi.fn();
    const features = Array.from({ length: 50 }, (_, index) => ({
      layer: 'cities' as const, id: `village-${index + 1}`, label: `قرية ${index + 1}`,
    }));
    render(<SelectionPanel selection={null} features={features} onSelect={onSelect} onClose={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'قرية 50' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'اعرض المزيد من المواقع' }));
    fireEvent.click(screen.getByRole('button', { name: 'قرية 50' }));
    expect(onSelect).toHaveBeenCalledWith({ layer: 'cities', id: 'village-50' });
    expect(screen.queryByRole('button', { name: 'اعرض المزيد من المواقع' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'قرية 50' } });
    expect(screen.getByRole('button', { name: 'قرية 50' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'امسح البحث' }));
    expect(screen.queryByRole('button', { name: 'قرية 50' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'اعرض المزيد من المواقع' })).toBeInTheDocument();
  });
  it('keeps an authorized relocation form mounted when viewport details temporarily clear', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          worldId: 'world',
          villageId: 'cairo',
          longitude: 31.24967,
          latitude: 30.06263,
          relocationUsed: false,
          canRelocate: true,
          reason: null,
          bounds: { west: -67, south: -28, east: 165, north: 60 },
          revision: 1,
        },
      }),
    });
    vi.stubGlobal('fetch', fetch);
    const selection = {
      layer: 'cities' as const,
      id: 'cairo',
      title: 'القاهرة',
      kind: 'قرية',
      coordinates: '31 / 30',
      details: [],
    };
    const relocation = {
      worldId: 'world',
      villageId: 'cairo',
      approved: true,
      onRelocated: vi.fn(),
    };
    const props = {
      features: [],
      selectedKey: { layer: 'cities' as const, id: 'cairo' },
      onSelect: vi.fn(),
      onClose: vi.fn(),
      relocation,
    };
    const view = render(<SelectionPanel {...props} selection={selection} />);
    fireEvent.click(await screen.findByRole('button', { name: 'نقل القرية' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'خط الطول' }), {
      target: { value: '31.3' },
    });
    view.rerender(
      <SelectionPanel
        {...props}
        selection={null}
        relocation={{ ...relocation, approved: false }}
      />,
    );
    expect(screen.getByRole('complementary', { name: 'تفاصيل الخريطة' })).toHaveAttribute(
      'data-expanded',
      'true',
    );
    expect(screen.getByRole('textbox', { name: 'خط الطول' })).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'خط الطول' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'تأكيد النقل الدائم' })).toBeDisabled();
    view.rerender(<SelectionPanel {...props} selection={selection} />);
    expect(screen.getByRole('textbox', { name: 'خط الطول' })).toHaveValue('31.3');
    expect(fetch).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });
  it('removes revoked viewport locations while retaining a usable search clear control', () => {
    const props = { selection: null, onSelect: vi.fn(), onClose: vi.fn() };
    const cairo = { layer: 'cities' as const, id: 'cairo', label: 'القاهرة' };
    const view = render(
      <SelectionPanel
        {...props}
        features={[cairo, { layer: 'castles', id: 'citadel', label: 'قلعة دمشق' }]}
      />,
    );
    fireEvent.change(screen.getByRole('searchbox', { name: 'ابحث في المواقع الظاهرة' }), {
      target: { value: 'دمشق' },
    });
    expect(screen.getByRole('button', { name: 'قلعة دمشق' })).toBeInTheDocument();
    view.rerender(<SelectionPanel {...props} features={[cairo]} />);
    expect(screen.queryByRole('button', { name: 'قلعة دمشق' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'امسح البحث' }));
    expect(screen.getByRole('button', { name: 'القاهرة' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'قلعة دمشق' })).not.toBeInTheDocument();
  });
  it('searches only the approved viewport feature list and selects the original layer and identifier', () => {
    const onSelect = vi.fn();
    render(
      <SelectionPanel
        selection={null}
        features={[
          { layer: 'cities', id: 'cairo', label: 'القاهرة' },
          { layer: 'castles', id: 'citadel', label: 'قلعة دمشق' },
        ]}
        onSelect={onSelect}
        onClose={() => {}}
      />,
    );
    const search = screen.getByRole('searchbox', { name: 'ابحث في المواقع الظاهرة' });
    fireEvent.change(search, { target: { value: 'دمشق' } });
    expect(screen.queryByRole('button', { name: 'القاهرة' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'قلعة دمشق' }));
    expect(onSelect).toHaveBeenCalledWith({ layer: 'castles', id: 'citadel' });
    fireEvent.change(search, { target: { value: 'مدينة غير مرئية' } });
    expect(screen.getByText('لا مواقع تطابق البحث في هذا المشهد.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'مدينة غير مرئية' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'امسح البحث' }));
    expect(screen.getByRole('button', { name: 'القاهرة' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'قلعة دمشق' })).toBeInTheDocument();
  });
  it('scrolls to a new selection without resetting scroll during payload refresh', () => {
    const props = { features: [], onSelect: vi.fn(), onClose: vi.fn() };
    const key = { layer: 'cities' as const, id: 'cairo' };
    const selection = {
      ...key,
      title: 'القاهرة',
      kind: 'مدينة',
      coordinates: '31 / 30',
      details: [],
    };
    const view = render(<SelectionPanel {...props} selection={null} selectedKey={null} />);
    const panel = screen.getByRole('complementary', { name: 'تفاصيل الخريطة' });
    const scroll = vi.fn();
    panel.scrollTo = scroll;
    view.rerender(<SelectionPanel {...props} selection={selection} selectedKey={key} />);
    expect(scroll).toHaveBeenCalledWith({ top: 0, behavior: 'instant' });
    view.rerender(<SelectionPanel {...props} selection={null} selectedKey={key} />);
    view.rerender(
      <SelectionPanel {...props} selection={{ ...selection }} selectedKey={{ ...key }} />,
    );
    expect(scroll).toHaveBeenCalledOnce();
  });
  it('expands and collapses the mobile sheet with an accessible control', () => {
    const onClose = vi.fn();
    render(<SelectionPanel selection={null} features={[]} onSelect={() => {}} onClose={onClose} />);
    const panel = screen.getByRole('complementary', { name: 'تفاصيل الخريطة' });
    expect(panel).toHaveAttribute('data-expanded', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'افتح تفاصيل الخريطة' }));
    expect(panel).toHaveAttribute('data-expanded', 'true');
    expect(screen.getByRole('button', { name: 'اطوِ تفاصيل الخريطة' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: 'اطوِ تفاصيل الخريطة' }));
    expect(panel).toHaveAttribute('data-expanded', 'false');
    expect(onClose).toHaveBeenCalledOnce();
  });
  it('shows an accessible empty state and keyboard feature selector', () => {
    const onSelect = vi.fn();
    render(
      <SelectionPanel
        selection={null}
        features={[{ layer: 'cities', id: 'cairo', label: 'القاهرة' }]}
        onSelect={onSelect}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText('اختر موقعًا على الخريطة')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'القاهرة' }));
    expect(onSelect).toHaveBeenCalledWith({ layer: 'cities', id: 'cairo' });
  });
  it('renders approved text literally and dismisses through a labeled control', () => {
    const onClose = vi.fn();
    render(
      <SelectionPanel
        selection={{
          layer: 'cities',
          id: 'city',
          title: '<script>مدينة</script>',
          kind: 'مدينة',
          coordinates: '31.2357 / 30.0444',
          details: [{ label: 'التحصين', value: '٤' }],
        }}
        features={[]}
        onSelect={() => {}}
        onClose={onClose}
      />,
    );
    expect(screen.getByRole('heading', { name: '<script>مدينة</script>' })).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
    expect(screen.getByText('31.2357 / 30.0444')).toHaveAttribute('dir', 'ltr');
    fireEvent.click(screen.getByRole('button', { name: 'أغلق تفاصيل الموقع' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
