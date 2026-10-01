import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SelectionPanel } from './selection-panel';

describe('map selection panel', () => {
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
